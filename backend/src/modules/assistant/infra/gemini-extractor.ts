import { GoogleGenAI, Type } from '@google/genai';
import type { CategorySummary, ExtractFromTextInput, LlmExtractor } from '../application/ports/llm-extractor.js';
import type { Extraction } from '../domain/extraction-schema.js';

export class GeminiExtractor implements LlmExtractor {
  private readonly client: GoogleGenAI | null = null;
  private readonly modelName: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.modelName = process.env.LLM_MODEL || 'gemini-2.5-flash';

    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  async extractFromText(input: ExtractFromTextInput): Promise<Extraction> {
    if (!this.client) {
      // Deterministic fallback heuristic when API key is missing
      return this.fallbackHeuristic(input);
    }

    const categoriesPrompt = input.categories
      .map((c) => `- ${c.slug} (${c.type}): ${c.name}`)
      .join('\n');

    const systemInstruction = `Você é um extrator de lançamentos e intenções financeiras em português (Brasil) para o sistema Meister.
Você deve analisar a mensagem do usuário e extrair os dados estritamente no esquema estruturado JSON solicitado.

Regras de Negócio e Extração:
1. "intent":
   - "lancamento" se o usuário estiver registrando uma transação financeira (gasto ou ganho).
   - "consulta" se for uma dúvida sobre finanças ("qual meu saldo", "quanto falta pro limite", "valor do das", "como estão os potes").
   - "outro" se for saudação, despedida ou texto sem contexto financeiro.
2. "type": "receita" (entrada/recebimento/venda/ganho) ou "despesa" (saída/compra/pagamento/gasto). Se não estiver claro, retorne null.
3. "amount": String formatada estritamente com duas casas decimais separadas por ponto, ex: "150.00", "42.50", "1200.00". Se ausente, retorne null.
4. "dateIso": Data no formato "YYYY-MM-DD" se explícita ou resolvida. Caso contrário null.
5. "dateExpression": Expressão temporal literal encontrada, ex: "ontem", "hoje", "semana passada", "dia 15", "quarta-feira".
6. "categorySlug": Escolha a categoria mais apropriada dentre as seguintes disponíveis:
${categoriesPrompt}
Se nenhuma se encaixar com clareza, retorne null.
7. "paymentMethod": Um de: "dinheiro", "pix", "cartao_credito", "cartao_debito", "boleto", "outro" ou null.
8. "scope": "pj" se for despesa/receita da empresa/CNPJ/cliente, "pf" se pessoal/família, ou "indefinido" se não especificado.
9. "query": Se intent for "consulta", classifique em: "saldo", "limite", "das", "potes", "resumo_mes", "ultimos".
10. "confidence": Número de 0.0 a 1.0 representando a confiança da extração.
11. "ambiguous": Lista de campos que geraram dúvida (ex: ["category", "scope"]).

Data de referência hoje: ${input.referenceDateIso || new Date().toISOString().slice(0, 10)}`;

    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: input.text,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent: { type: Type.STRING, enum: ['lancamento', 'consulta', 'outro'] },
              documentKind: {
                type: Type.STRING,
                enum: [
                  'texto_livre',
                  'cupom_fiscal',
                  'comprovante_pix',
                  'recibo',
                  'boleto',
                  'fatura_cartao',
                  'outro_documento',
                  'nao_e_documento',
                ],
              },
              type: { type: Type.STRING, enum: ['receita', 'despesa'], nullable: true },
              amount: { type: Type.STRING, nullable: true },
              dateIso: { type: Type.STRING, nullable: true },
              dateExpression: { type: Type.STRING, nullable: true },
              description: { type: Type.STRING, nullable: true },
              merchant: { type: Type.STRING, nullable: true },
              categorySlug: { type: Type.STRING, nullable: true },
              paymentMethod: {
                type: Type.STRING,
                enum: ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'outro'],
                nullable: true,
              },
              scope: { type: Type.STRING, enum: ['pj', 'pf', 'indefinido'] },
              confidence: { type: Type.NUMBER },
              ambiguous: {
                type: Type.ARRAY,
                items: { type: Type.STRING, enum: ['amount', 'date', 'type', 'category', 'scope'] },
              },
              query: {
                type: Type.STRING,
                enum: ['saldo', 'limite', 'das', 'potes', 'resumo_mes', 'ultimos'],
                nullable: true,
              },
            },
            required: ['intent', 'documentKind', 'scope', 'confidence', 'ambiguous'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return {
        intent: parsed.intent || 'outro',
        documentKind: parsed.documentKind || 'texto_livre',
        type: parsed.type || null,
        amount: parsed.amount || null,
        dateIso: parsed.dateIso || null,
        dateExpression: parsed.dateExpression || null,
        description: parsed.description || input.text.slice(0, 50),
        merchant: parsed.merchant || null,
        categorySlug: parsed.categorySlug || null,
        paymentMethod: parsed.paymentMethod || null,
        scope: parsed.scope || 'indefinido',
        items: [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
        ambiguous: Array.isArray(parsed.ambiguous) ? parsed.ambiguous : [],
        query: parsed.query || null,
      };
    } catch (err) {
      console.warn('[GeminiExtractor] Call failed, using fallback heuristic:', err);
      return this.fallbackHeuristic(input);
    }
  }

  private fallbackHeuristic(input: ExtractFromTextInput): Extraction {
    const raw = input.text.toLowerCase().trim();

    // Queries
    if (raw.includes('saldo')) {
      return {
        intent: 'consulta',
        documentKind: 'texto_livre',
        type: null,
        amount: null,
        dateIso: null,
        dateExpression: null,
        description: null,
        merchant: null,
        categorySlug: null,
        paymentMethod: null,
        scope: 'indefinido',
        items: [],
        confidence: 0.95,
        ambiguous: [],
        query: 'saldo',
      };
    }
    if (raw.includes('limite') || raw.includes('mei') || raw.includes('faturamento')) {
      return {
        intent: 'consulta',
        documentKind: 'texto_livre',
        type: null,
        amount: null,
        dateIso: null,
        dateExpression: null,
        description: null,
        merchant: null,
        categorySlug: null,
        paymentMethod: null,
        scope: 'pj',
        items: [],
        confidence: 0.95,
        ambiguous: [],
        query: 'limite',
      };
    }
    if (raw.includes('das') || raw.includes('imposto')) {
      return {
        intent: 'consulta',
        documentKind: 'texto_livre',
        type: null,
        amount: null,
        dateIso: null,
        dateExpression: null,
        description: null,
        merchant: null,
        categorySlug: null,
        paymentMethod: null,
        scope: 'pj',
        items: [],
        confidence: 0.95,
        ambiguous: [],
        query: 'das',
      };
    }
    if (raw.includes('potes') || raw.includes('orçamento') || raw.includes('orcamento')) {
      return {
        intent: 'consulta',
        documentKind: 'texto_livre',
        type: null,
        amount: null,
        dateIso: null,
        dateExpression: null,
        description: null,
        merchant: null,
        categorySlug: null,
        paymentMethod: null,
        scope: 'indefinido',
        items: [],
        confidence: 0.95,
        ambiguous: [],
        query: 'potes',
      };
    }

    // Extraction amount
    const amountMatch = raw.match(/(?:r\$|\$)?\s*(\d+(?:[.,]\d{1,2})?)/);
    let amount: string | null = null;
    if (amountMatch && amountMatch[1]) {
      const normalized = amountMatch[1].replace(',', '.');
      const num = parseFloat(normalized);
      if (!isNaN(num) && num > 0) {
        amount = num.toFixed(2);
      }
    }

    // Type detection
    let type: 'receita' | 'despesa' | null = null;
    if (
      raw.includes('recebi') ||
      raw.includes('ganhei') ||
      raw.includes('vendi') ||
      raw.includes('entrada') ||
      raw.includes('receita')
    ) {
      type = 'receita';
    } else if (
      raw.includes('gastei') ||
      raw.includes('comprei') ||
      raw.includes('paguei') ||
      raw.includes('almoco') ||
      raw.includes('almoço') ||
      raw.includes('uber') ||
      raw.includes('combustivel') ||
      raw.includes('mercado') ||
      raw.includes('saida') ||
      raw.includes('saída') ||
      raw.includes('despesa')
    ) {
      type = 'despesa';
    }

    // Payment method
    let paymentMethod: any = null;
    if (raw.includes('pix')) paymentMethod = 'pix';
    else if (raw.includes('cartao') || raw.includes('cartão') || raw.includes('credito') || raw.includes('crédito')) {
      paymentMethod = 'cartao_credito';
    } else if (raw.includes('debito') || raw.includes('débito')) {
      paymentMethod = 'cartao_debito';
    } else if (raw.includes('dinheiro')) {
      paymentMethod = 'dinheiro';
    } else if (raw.includes('boleto')) {
      paymentMethod = 'boleto';
    }

    // Date expression
    let dateExpression: string | null = null;
    if (raw.includes('ontem')) dateExpression = 'ontem';
    else if (raw.includes('hoje')) dateExpression = 'hoje';
    else if (raw.includes('anteontem')) dateExpression = 'anteontem';

    // Category matching heuristic
    let categorySlug: string | null = null;
    if (input.categories.length > 0) {
      for (const cat of input.categories) {
        if (raw.includes(cat.name.toLowerCase()) || raw.includes(cat.slug)) {
          categorySlug = cat.slug;
          break;
        }
      }
      if (!categorySlug) {
        if (raw.includes('almoco') || raw.includes('almoço') || raw.includes('restaurante')) {
          categorySlug = 'alimentacao';
        } else if (raw.includes('uber') || raw.includes('combustivel') || raw.includes('gasolina')) {
          categorySlug = 'transporte';
        } else if (raw.includes('cliente') || raw.includes('venda') || raw.includes('servico') || raw.includes('serviço')) {
          categorySlug = 'servicos-prestados';
        }
      }
    }

    return {
      intent: amount || type ? 'lancamento' : 'outro',
      documentKind: 'texto_livre',
      type,
      amount,
      dateIso: null,
      dateExpression,
      description: input.text.slice(0, 60),
      merchant: null,
      categorySlug,
      paymentMethod,
      scope: raw.includes('empresa') || raw.includes('cnpj') ? 'pj' : 'indefinido',
      items: [],
      confidence: 0.85,
      ambiguous: [],
      query: null,
    };
  }
}
