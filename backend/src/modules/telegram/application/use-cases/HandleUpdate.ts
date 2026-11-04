import prisma from '../../../../config/prisma.js';
import { resolveScopeForUser } from '../../../workspace/public.js';
import { proposeFromText, confirmProposal, cancelProposal } from '../../../assistant/public.js';
import { getMeiLimit, listDas } from '../../../fiscal/public.js';
import { getJarsStatus } from '../../../jars/public.js';
import { listTransactions } from '../../../ledger/public.js';
import { MessagesPtBr, escapeMarkdownV2, formatBrl } from '../../domain/messages.pt-BR.js';
import { decodeProposalCallback, encodeProposalCallback } from '../../domain/callback-data.js';
import type { MessagingChannel } from '../ports/messaging-channel.js';
import { linkChat } from './LinkChat.js';
import { unlinkChat } from './GetLinkStatus.js';

export interface TelegramUpdate {
  readonly update_id: number | bigint;
  readonly message?: {
    readonly message_id: number;
    readonly from?: { readonly id: number; readonly is_bot: boolean; readonly first_name?: string };
    readonly chat: { readonly id: number | string; readonly type: string };
    readonly text?: string;
  };
  readonly callback_query?: {
    readonly id: string;
    readonly from: { readonly id: number; readonly first_name?: string };
    readonly message?: { readonly message_id: number; readonly chat: { readonly id: number | string } };
    readonly data?: string;
  };
}

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  channel: MessagingChannel
): Promise<void> {
  const updateId = BigInt(update.update_id);

  // 1. Deduplication with inbound_updates table
  try {
    const existing = await prisma.inboundUpdate.findUnique({
      where: { updateId },
    });
    if (existing && (existing.status === 'processada' || existing.status === 'ignorada')) {
      return;
    }
  } catch {
    // If inbound_updates table is inaccessible, proceed safely
  }

  // 2. Handle Callback Queries (Button Clicks)
  if (update.callback_query && typeof update.callback_query.data === 'string') {
    const cb = update.callback_query;
    const callbackData = cb.data as string;
    const chatId = String(cb.message?.chat.id);
    const messageId = cb.message?.message_id;

    await channel.answerCallback(cb.id);

    const parsed = decodeProposalCallback(callbackData);
    if (!parsed || !messageId) {
      return;
    }

    const link = await prisma.telegramLink.findFirst({
      where: { chatId, status: 'ativo' },
    });
    if (!link) return;

    const scope = await resolveScopeForUser(link.userId);

    if (parsed.action === 'c') {
      try {
        const res = await confirmProposal(scope, parsed.proposalId);
        await channel.editMessageText(
          chatId,
          messageId,
          MessagesPtBr.proposalConfirmed(res)
        );
      } catch (err: any) {
        await channel.sendText(chatId, `⚠️ ${escapeMarkdownV2(err.message || 'Erro ao confirmar proposta.')}`);
      }
    } else if (parsed.action === 'x') {
      try {
        await cancelProposal(scope, parsed.proposalId);
        await channel.editMessageText(chatId, messageId, MessagesPtBr.proposalCancelled);
      } catch (err: any) {
        await channel.sendText(chatId, `⚠️ ${escapeMarkdownV2(err.message || 'Erro ao cancelar proposta.')}`);
      }
    }
    return;
  }

  // 3. Handle Messages
  const rawText = update.message?.text;
  if (!update.message || typeof rawText !== 'string') {
    return;
  }

  const msg = update.message;
  if (msg.from?.is_bot) return;

  const chatId = String(msg.chat.id);
  const text = rawText.trim();

  // Check link
  const link = await prisma.telegramLink.findFirst({
    where: { chatId, status: 'ativo' },
  });

  // Handle /start with token
  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/);
    if (parts.length > 1 && parts[1]) {
      await linkChat({
        chatId,
        telegramUserId: String(msg.from?.id),
        token: parts[1],
        channel,
      });
      return;
    }

    if (!link) {
      await channel.sendText(chatId, MessagesPtBr.welcomeUnlinked('meister_financas_bot'));
      return;
    }

    await channel.sendText(chatId, MessagesPtBr.alreadyLinked);
    return;
  }

  if (!link) {
    await channel.sendText(chatId, MessagesPtBr.welcomeUnlinked('meister_financas_bot'));
    return;
  }

  const scope = await resolveScopeForUser(link.userId);

  // Command Routing
  if (text === '/ajuda') {
    await channel.sendText(chatId, MessagesPtBr.help);
    return;
  }

  if (text === '/desvincular') {
    await unlinkChat(scope);
    await channel.sendText(chatId, `🔌 *Conta desvinculada com sucesso\\.* Você não receberá mais notificações por aqui\\. Use o painel web para reconectar quando quiser\\.`);
    return;
  }

  if (text === '/saldo') {
    const txs = await listTransactions(scope, { pageSize: 100 });
    let totalIn = 0;
    let totalOut = 0;
    for (const t of txs.items) {
      const val = Number(t.amount);
      if (t.type === 'receita') totalIn += val;
      else if (t.type === 'despesa') totalOut += val;
    }
    const balance = totalIn - totalOut;
    const balanceFormatted = formatBrl(balance);

    await channel.sendText(
      chatId,
      `💰 *Saldo Consolidado*\n\n` +
      `• *Total Entradas:* ${escapeMarkdownV2(formatBrl(totalIn))}\n` +
      `• *Total Saídas:* ${escapeMarkdownV2(formatBrl(totalOut))}\n` +
      `• *Saldo em Caixa:* *${escapeMarkdownV2(balanceFormatted)}*`
    );
    return;
  }

  if (text === '/limite') {
    if (!scope.defaultEntityIds.pj) {
      await channel.sendText(chatId, `ℹ️ _Essa conta não possui um perfil MEI ativo associado\\._`);
      return;
    }
    const mei = await getMeiLimit(scope, { entityId: scope.defaultEntityIds.pj });
    if (!mei) {
      await channel.sendText(chatId, `ℹ️ _Limite MEI não disponível para a entidade selecionada\\._`);
      return;
    }
    await channel.sendText(
      chatId,
      `📊 *Termômetro do Limite MEI (Ano ${mei.ano})*\n\n` +
      `• *Teto Anual Proporcional:* ${escapeMarkdownV2(formatBrl(mei.limite))}\n` +
      `• *Faturamento Acumulado:* ${escapeMarkdownV2(formatBrl(mei.faturamentoAno))}\n` +
      `• *Disponível para Faturar:* ${escapeMarkdownV2(formatBrl(mei.restante))}\n` +
      `• *Percentual Utilizado:* *${escapeMarkdownV2(mei.percentualUtilizado.toFixed(1))}%* \\(${escapeMarkdownV2(mei.status.toUpperCase())}\\)`
    );
    return;
  }

  if (text === '/das') {
    const dasList = await listDas(scope);
    if (dasList.items.length === 0) {
      await channel.sendText(chatId, `🎉 *Nenhuma guia DAS pendente encontrada para o seu MEI\\.*`);
      return;
    }
    let msgDas = `🏛️ *Guias do DAS (Documento de Arrecadação do MEI)*\n\n`;
    for (const d of dasList.items.slice(0, 3)) {
      const statusIcon = d.status === 'pago' ? '✅' : d.status === 'vencido' ? '🔴' : '🟡';
      msgDas += `${statusIcon} *Competência ${escapeMarkdownV2(d.competence)}*\n` +
        `• Valor: *${escapeMarkdownV2(formatBrl(d.amount))}*\n` +
        `• Vencimento: ${escapeMarkdownV2(d.dueDate)}\n` +
        `• Status: *${escapeMarkdownV2(d.status.toUpperCase())}*\n\n`;
    }
    msgDas += `🔗 [Acessar Portal PGMEI para Gerar Guia](https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/)`;
    await channel.sendText(chatId, msgDas);
    return;
  }

  if (text === '/potes') {
    const jarsStatus = await getJarsStatus(scope);
    if (jarsStatus.jars.length === 0) {
      await channel.sendText(chatId, `ℹ️ _Você ainda não ativou um plano de potes financeiros\\. Acesse a aba Potes no painel web para começar\\._`);
      return;
    }
    let msgJars = `🏺 *Seus Potes Financeiros*\n\n`;
    for (const j of jarsStatus.jars) {
      const icon = j.status === 'estourado' ? '🚨' : j.status === 'atencao' ? '⚠️' : '🟢';
      msgJars += `${icon} *${escapeMarkdownV2(j.name)}*\n` +
        `• Utilizado: *${escapeMarkdownV2(formatBrl(j.usado))}* / ${escapeMarkdownV2(formatBrl(j.alocado))} \\(${escapeMarkdownV2(j.percentUsado.toFixed(0))}%\\)\n` +
        `• Disponível: ${escapeMarkdownV2(formatBrl(j.disponivel))}\n\n`;
    }
    await channel.sendText(chatId, msgJars);
    return;
  }

  if (text === '/ultimos') {
    const txs = await listTransactions(scope, { pageSize: 5 });
    if (txs.items.length === 0) {
      await channel.sendText(chatId, `ℹ️ _Nenhum lançamento encontrado ainda\\._`);
      return;
    }
    let msgUltimos = `📋 *Últimos Lançamentos*\n\n`;
    for (const t of txs.items) {
      const icon = t.type === 'receita' ? '🟢' : '🔴';
      msgUltimos += `${icon} *${escapeMarkdownV2(t.description)}*\n` +
        `• ${escapeMarkdownV2(formatBrl(String(t.amount)))} em ${escapeMarkdownV2(t.transactionDate.toISOString().slice(0, 10))}\n\n`;
    }
    await channel.sendText(chatId, msgUltimos);
    return;
  }

  // 4. Natural Language Processing (Assistant)
  try {
    const outcome = await proposeFromText(scope, {
      text,
      sourceRef: `tg:msg:${msg.message_id}`,
    });

    if (outcome.kind === 'proposal') {
      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: '✅ Confirmar',
              callback_data: encodeProposalCallback(outcome.proposalId, 'c'),
            },
            {
              text: '❌ Cancelar',
              callback_data: encodeProposalCallback(outcome.proposalId, 'x'),
            },
          ],
        ],
      };

      await channel.sendText(
        chatId,
        MessagesPtBr.proposalReady(outcome.draft),
        { replyMarkup }
      );
    } else if (outcome.kind === 'question') {
      await channel.sendText(chatId, `❓ ${escapeMarkdownV2(outcome.questionText)}`);
    } else if (outcome.kind === 'query') {
      if (outcome.queryKind === 'saldo') {
        const txs = await listTransactions(scope, { pageSize: 100 });
        let total = 0;
        for (const t of txs.items) {
          total += t.type === 'receita' ? Number(t.amount) : -Number(t.amount);
        }
        await channel.sendText(chatId, `💰 Seu saldo atual em caixa é *${escapeMarkdownV2(formatBrl(total))}*\\.`);
      } else if (outcome.queryKind === 'limite') {
        if (!scope.defaultEntityIds.pj) {
          await channel.sendText(chatId, `ℹ️ _Essa conta não possui um perfil MEI ativo associado\\._`);
          return;
        }
        const mei = await getMeiLimit(scope, { entityId: scope.defaultEntityIds.pj });
        if (mei) {
          await channel.sendText(chatId, `📊 Você utilizou *${escapeMarkdownV2(mei.percentualUtilizado.toFixed(1))}%* do limite anual do MEI \\(Resta ${escapeMarkdownV2(formatBrl(mei.restante))}\\)\\.`);
        }
      } else if (outcome.queryKind === 'das') {
        const dasList = await listDas(scope);
        await channel.sendText(chatId, `🏛️ Você tem ${dasList.items.length} guias de DAS registradas\\. Use /das para ver os detalhes\\.`);
      } else {
        await channel.sendText(chatId, `ℹ️ Use os comandos /saldo, /limite, /das ou /potes para consultar seus números\\.`);
      }
    } else if (outcome.kind === 'not_a_transaction') {
      await channel.sendText(chatId, MessagesPtBr.notUnderstood);
    } else {
      await channel.sendText(chatId, `⚠️ ${escapeMarkdownV2(outcome.reason)}`);
    }
  } catch (err: any) {
    console.error('[HandleUpdate] Error in assistant flow:', err);
    await channel.sendText(chatId, `⚠️ Ocorreu um erro ao processar sua mensagem: ${escapeMarkdownV2(err.message || 'Erro inesperado')}`);
  }
}