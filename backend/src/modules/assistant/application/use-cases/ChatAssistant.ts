import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import { Money } from '../../../../shared/index.js';
import { proposeFromText } from './ProposeFromText.js';
import { askFinances } from '../../../insights/public.js';
import { askEducation } from '../../../education/public.js';

export interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface ChatAssistantInput {
  readonly message: string;
  readonly history?: readonly ChatMessage[];
}

export type ChatAssistantOutput =
  | {
      readonly kind: 'proposal';
      readonly reply: string;
      readonly proposal: {
        readonly id: string;
        readonly type: 'receita' | 'despesa';
        readonly amount: string;
        readonly description: string;
        readonly date: string;
        readonly categoryId: string | null;
        readonly categoryName: string;
        readonly paymentMethod: string | null;
        readonly scope: 'pj' | 'pf';
      };
    }
  | {
      readonly kind: 'question';
      readonly reply: string;
      readonly field: string;
    }
  | {
      readonly kind: 'finance_query';
      readonly reply: string;
      readonly periodLabel?: string;
      readonly metrics?: Record<string, string | number>;
    }
  | {
      readonly kind: 'education';
      readonly reply: string;
      readonly topic?: string;
    }
  | {
      readonly kind: 'general';
      readonly reply: string;
      readonly isAiGenerated: boolean;
    };

/**
 * Call Gemini Generative Language API for conversational interactions.
 */
async function callGeminiChat(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: readonly ChatMessage[],
  userMessage: string
): Promise<string | null> {
  try {
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    // Map history (up to last 6 messages)
    const recentHistory = (history || []).slice(-6);
    for (const msg of recentHistory) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    // Add current user prompt
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      }),
    });

    if (!response.ok) {
      console.warn(`[GeminiChat] API status ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === 'string' ? text.trim() : null;
  } catch (err) {
    console.warn('[GeminiChat] Error in generateContent:', err);
    return null;
  }
}

export async function chatAssistant(
  scope: WorkspaceScope,
  input: ChatAssistantInput
): Promise<ChatAssistantOutput> {
  const message = input.message.trim();
  const lower = message.toLowerCase();

  // 1. Check for transaction proposals (e.g. "gastei 45 no almoço", "recebi 500 via pix")
  const outcome = await proposeFromText(scope, { text: message });

  if (outcome.kind === 'proposal') {
    const formattedAmount = outcome.draft.amount.replace('.', ',');
    const tipo = outcome.draft.type === 'receita' ? 'Receita' : 'Despesa';
    return {
      kind: 'proposal',
      reply: `Identifiquei uma proposta de **${tipo}** no valor de **R$ ${formattedAmount}** para "*${outcome.draft.description}*" na categoria **${outcome.draft.categoryName}**. Confirma o lançamento?`,
      proposal: {
        id: outcome.proposalId,
        type: outcome.draft.type,
        amount: outcome.draft.amount,
        description: outcome.draft.description,
        date: outcome.draft.date,
        categoryId: outcome.draft.categoryId,
        categoryName: outcome.draft.categoryName,
        paymentMethod: outcome.draft.paymentMethod,
        scope: outcome.draft.scope,
      },
    };
  }

  if (outcome.kind === 'question') {
    return {
      kind: 'question',
      reply: outcome.questionText,
      field: outcome.field,
    };
  }

  if (outcome.kind === 'query') {
    const finRes = await askFinances(scope, message);
    return {
      kind: 'finance_query',
      reply: finRes.answer,
      periodLabel: finRes.periodLabel,
      metrics: finRes.metrics,
    };
  }

  // 2. Check finance queries (saldo, potes, das, despesas, limite)
  const isFinanceKeyword =
    /\b(saldo|caixa|quanto tenho|pote|potes|reserva|limite|teto|faturamento|das|guia das|imposto|despesa|gastei|gastos)\b/i.test(
      lower
    );

  if (isFinanceKeyword) {
    const finRes = await askFinances(scope, message);
    if (finRes.intent !== 'recusa_orientacao') {
      return {
        kind: 'finance_query',
        reply: finRes.answer,
        periodLabel: finRes.periodLabel,
        metrics: finRes.metrics,
      };
    }
  }

  // 3. Check MEI educational & fiscal policy queries
  const isEducationKeyword =
    /\b(mei|desenquadramento|nota fiscal|nf-e|nfc-e|teto|limite mei|dasn|inss|aposentadoria|direitos|misturar|conta pj|abrir mei)\b/i.test(
      lower
    );

  if (isEducationKeyword) {
    const eduRes = askEducation(message);
    if (!eduRes.isDisclaimer && eduRes.citedLessonSlug) {
      return {
        kind: 'education',
        reply: `${eduRes.answer}\n\n📚 *Lição recomendada:* ${eduRes.citedLessonTitle || eduRes.citedLessonSlug}`,
        topic: eduRes.citedLessonTitle || eduRes.citedLessonSlug,
      };
    }
  }

  // 4. Generative AI with Gemini if key is provided
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.LLM_MODEL || 'gemini-1.5-flash';

  if (apiKey) {
    // Gather workspace context for high-quality Gemini generation
    const entities = await prisma.entity.findMany({
      where: { workspaceId: scope.workspaceId },
    });
    const pjEntity = entities.find((e) => e.kind === 'pj');

    // Balance summary
    const txs = await prisma.transaction.findMany({
      where: { workspaceId: scope.workspaceId },
      select: { type: true, amount: true },
    });
    let inCents = 0n;
    let outCents = 0n;
    for (const t of txs) {
      const c = Money.fromDecimalString(String(t.amount)).cents;
      if (t.type === 'receita') inCents += c;
      if (t.type === 'despesa') outCents += c;
    }
    const balanceMoney = Money.fromCents(inCents >= outCents ? inCents - outCents : outCents - inCents);
    const balanceStr = (inCents >= outCents ? 'R$ ' : '-R$ ') + balanceMoney.toDecimalString().replace('.', ',');

    const systemPrompt = `Você é o MEIster Copilot, assistente inteligente e consultor amigável para Microempreendedores Individuais (MEI) no Brasil.
Contexto do MEI:
- Empresa: ${pjEntity?.name || 'MEI'}
- Saldo atual em caixa: ${balanceStr}
- Data de hoje: ${new Date().toLocaleDateString('pt-BR')}

Diretrizes de resposta:
- Responda em português brasileiro de forma acolhedora, objetiva e prática.
- Use formatação Markdown (negrito, tópicos).
- Se o usuário quiser registrar uma movimentação financeira, informe que ele pode apenas escrever "Gastei 45 no almoço" ou "Recebi 120 de serviço" que você prepara o lançamento para confirmação!
- Respeite rigorosamente a legislação do MEI (Lei Complementar 123/2006). Incentive a separação estrita entre finanças da empresa (PJ) e despesas pessoais (PF).
- Não recomende investimentos de risco nem dê conselhos financeiros fora do escopo de gestão do MEI.`;

    const aiResponse = await callGeminiChat(
      apiKey,
      model,
      systemPrompt,
      input.history || [],
      message
    );

    if (aiResponse) {
      return {
        kind: 'general',
        reply: aiResponse,
        isAiGenerated: true,
      };
    }
  }

  // 5. Friendly Deterministic Fallback when Gemini is offline or not configured
  return {
    kind: 'general',
    reply:
      `Olá! Sou o assistente MEIster. Como posso ajudar com seu MEI hoje?\n\n` +
      `• **Registrar lançamentos:** basta digitar por exemplo *"Gastei 45 no almoço"* ou *"Recebi 150 do cliente via pix"*.\n` +
      `• **Consultar saldo e finanças:** pergunte *"Qual meu saldo?"*, *"Como estão meus potes?"* ou *"Quando vence o DAS?"*.\n` +
      `• **Dúvidas sobre o MEI:** tire dúvidas sobre limite anual, emissão de nota fiscal e separação de contas PF/PJ.\n\n` +
      `💡 *Dica:* Para ativar inteligência artificial generativa em tempo real com o Gemini, configure sua chave de API no ícone ⚙️ no topo do assistente!`,
    isAiGenerated: false,
  };
}
