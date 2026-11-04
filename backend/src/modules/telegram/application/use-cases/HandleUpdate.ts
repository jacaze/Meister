import prisma from '../../../../config/prisma.js';
import type { MessagingChannel } from '../application/ports/messaging-channel.js';
import { TelegramApiChannel } from '../infra/telegram-channel.js';
import { decodeProposalCallback, encodeProposalCallback } from '../domain/callback-data.js';
import {
  escapeMarkdownV2,
  formatCurrencyPtBr,
  TelegramMessagesPtBr,
} from '../domain/messages.pt-BR.js';
import { linkChat } from './LinkChat.js';
import { proposeFromText, confirmProposal, cancelProposal } from '../../assistant/public.js';
import { getMeiLimit, getDasStatus } from '../../../fiscal/public.js';
import { getJarsStatus } from '../../../jars/public.js';
import { listTransactions } from '../../../ledger/public.js';
import type { WorkspaceScope } from '../../../../shared/index.js';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
      username?: string;
      first_name?: string;
    };
    date: number;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name?: string;
      username?: string;
    };
    message?: {
      message_id: number;
      chat: {
        id: number;
      };
    };
    data?: string;
  };
}

export async function handleUpdate(
  update: TelegramUpdate,
  channel: MessagingChannel = new TelegramApiChannel()
): Promise<void> {
  // 1. Handle Callback Query (Inline keyboard buttons)
  if (update.callback_query && update.callback_query.data) {
    const callback = update.callback_query;
    const chatId = callback.message?.chat.id;
    const messageId = callback.message?.message_id;

    if (!chatId || !messageId) {
      await channel.answerCallbackQuery(callback.id);
      return;
    }

    const parsed = decodeProposalCallback(callback.data);
    if (!parsed) {
      await channel.answerCallbackQuery(callback.id, 'Ação inválida.');
      return;
    }

    // Find connection
    const connection = await prisma.telegramChatConnection.findUnique({
      where: { chatId: String(chatId) },
    });

    if (!connection || connection.status !== 'active') {
      await channel.answerCallbackQuery(callback.id, 'Chat não vinculado.');
      return;
    }

    // Resolve scope
    const scope = await buildScope(connection.workspaceId, connection.userId);

    if (parsed.action === 'confirm') {
      try {
        const result = await confirmProposal(scope, parsed.proposalId);
        await channel.answerCallbackQuery(callback.id, 'Lançamento confirmado!');

        const confirmationMsg = TelegramMessagesPtBr.proposalConfirmed({
          amountFormatted: formatCurrencyPtBr(result.amount),
          description: result.description,
          jarName: result.impact?.jarName,
          jarPercent: result.impact?.jarPercentUsed,
          meiRemaining:
            result.impact?.meiAnnualLimit && result.impact?.meiAccumulatedGross !== undefined
              ? formatCurrencyPtBr(
                  Math.max(0, result.impact.meiAnnualLimit - result.impact.meiAccumulatedGross)
                )
              : undefined,
        });

        await channel.editMessageText(chatId, messageId, confirmationMsg, {
          parseMode: 'MarkdownV2',
        });
      } catch (err: any) {
        await channel.answerCallbackQuery(callback.id, err.message || 'Erro ao confirmar.');
      }
      return;
    }

    if (parsed.action === 'cancel') {
      try {
        await cancelProposal(scope, parsed.proposalId);
        await channel.answerCallbackQuery(callback.id, 'Proposta cancelada.');
        await channel.editMessageText(chatId, messageId, TelegramMessagesPtBr.proposalCanceled(), {
          parseMode: 'MarkdownV2',
        });
      } catch (err: any) {
        await channel.answerCallbackQuery(callback.id, err.message || 'Erro ao cancelar.');
      }
      return;
    }

    await channel.answerCallbackQuery(callback.id);
    return;
  }

  // 2. Handle Text Messages
  if (update.message && update.message.text) {
    const msg = update.message;
    const chatId = String(msg.chat.id);
    const rawText = msg.text.trim();

    // Check /start command with optional linking token: "/start <token>"
    if (rawText.startsWith('/start')) {
      const parts = rawText.split(/\s+/);
      const token = parts[1];

      if (!token) {
        await channel.sendMessage(chatId, TelegramMessagesPtBr.welcomeUnlinked(), {
          parseMode: 'MarkdownV2',
        });
        return;
      }

      try {
        const linked = await linkChat({
          token,
          chatId,
          telegramUserId: String(msg.from.id),
          username: msg.from.username,
          firstName: msg.from.first_name,
        });

        await channel.sendMessage(chatId, TelegramMessagesPtBr.linkSuccess(linked.workspaceName), {
          parseMode: 'MarkdownV2',
        });
      } catch (err: any) {
        await channel.sendMessage(
          chatId,
          `⚠️ *Erro ao vincular:* ${escapeMarkdownV2(err.message || 'Token inválido ou expirado.')}`,
          { parseMode: 'MarkdownV2' }
        );
      }
      return;
    }

    // Check if chat is connected
    const connection = await prisma.telegramChatConnection.findUnique({
      where: { chatId },
    });

    if (!connection || connection.status !== 'active') {
      await channel.sendMessage(chatId, TelegramMessagesPtBr.welcomeUnlinked(), {
        parseMode: 'MarkdownV2',
      });
      return;
    }

    const scope = await buildScope(connection.workspaceId, connection.userId);

    // Command /ajuda
    if (rawText === '/ajuda' || rawText === '/help') {
      await channel.sendMessage(chatId, TelegramMessagesPtBr.helpText(), {
        parseMode: 'MarkdownV2',
      });
      return;
    }

    // Command /saldo
    if (rawText === '/saldo') {
      const transactions = await listTransactions(scope, { page: 1, limit: 100 });
      let balance = 0;
      for (const t of transactions.data) {
        const val = Number(t.amount);
        if (t.type === 'receita') balance += val;
        else balance -= val;
      }

      const balanceFormatted = formatCurrencyPtBr(balance);
      await channel.sendMessage(
        chatId,
        `💰 *Saldo Consolidado:* ${escapeMarkdownV2(balanceFormatted)}`,
        { parseMode: 'MarkdownV2' }
      );
      return;
    }

    // Command /limite
    if (rawText === '/limite') {
      if (!scope.defaultEntityIds.pj) {
        await channel.sendMessage(
          chatId,
          `ℹ️ Não há entidade MEI (PJ) configurada neste workspace.`,
          { parseMode: 'MarkdownV2' }
        );
        return;
      }

      const mei = await getMeiLimit(scope, { entityId: scope.defaultEntityIds.pj });
      const acumulado = formatCurrencyPtBr(Number(mei.faturamentoAno));
      const limite = formatCurrencyPtBr(Number(mei.limite));
      const restante = formatCurrencyPtBr(Math.max(0, Number(mei.limite) - Number(mei.faturamentoAno)));

      const msgLimite =
        `📊 *Termômetro do MEI (${mei.ano}):*\n\n` +
        `• *Faturamento Acumulado:* ${escapeMarkdownV2(acumulado)}\n` +
        `• *Teto Anual:* ${escapeMarkdownV2(limite)}\n` +
        `• *Restante:* ${escapeMarkdownV2(restante)}\n` +
        `• *Uso:* ${mei.percentualUtilizado}%\n` +
        `• *Faixa:* ${escapeMarkdownV2(mei.status.toUpperCase())}`;

      await channel.sendMessage(chatId, msgLimite, { parseMode: 'MarkdownV2' });
      return;
    }

    // Command /das
    if (rawText === '/das') {
      if (!scope.defaultEntityIds.pj) {
        await channel.sendMessage(chatId, `ℹ️ Não há entidade MEI vinculada.`, {
          parseMode: 'MarkdownV2',
        });
        return;
      }

      const das = await getDasStatus(scope, { entityId: scope.defaultEntityIds.pj });
      const current = das.guias[0];
      if (!current) {
        await channel.sendMessage(chatId, `ℹ️ Nenhuma guia DAS pendente encontrada.`, {
          parseMode: 'MarkdownV2',
        });
        return;
      }

      const msgDas =
        `🧾 *Guia DAS MEI (${current.competencia}):*\n\n` +
        `• *Valor:* ${escapeMarkdownV2(formatCurrencyPtBr(Number(current.valor)))}\n` +
        `• *Vencimento:* ${escapeMarkdownV2(current.vencimento)}\n` +
        `• *Status:* ${escapeMarkdownV2(current.status.toUpperCase())}`;

      await channel.sendMessage(chatId, msgDas, { parseMode: 'MarkdownV2' });
      return;
    }

    // Command /potes
    if (rawText === '/potes') {
      const jars = await getJarsStatus(scope);
      if (jars.jars.length === 0) {
        await channel.sendMessage(chatId, `ℹ️ Nenhum pote orçamentário configurado.`, {
          parseMode: 'MarkdownV2',
        });
        return;
      }

      let text = `🏺 *Situação dos Potes de Orçamento:*\n\n`;
      for (const j of jars.jars) {
        const icon = j.status === 'ok' ? '🟢' : j.status === 'atencao' ? '🟡' : '🔴';
        text += `${icon} *${escapeMarkdownV2(j.nome)}*: ${j.percentUsado}% utilizado ` +
          `(${escapeMarkdownV2(formatCurrencyPtBr(j.gastoMes))} de ${escapeMarkdownV2(formatCurrencyPtBr(j.tetoMes))})\n`;
      }

      await channel.sendMessage(chatId, text, { parseMode: 'MarkdownV2' });
      return;
    }

    // Command /ultimos
    if (rawText === '/ultimos') {
      const res = await listTransactions(scope, { page: 1, limit: 5 });
      if (res.data.length === 0) {
        await channel.sendMessage(chatId, `ℹ️ Nenhum lançamento recente encontrado.`, {
          parseMode: 'MarkdownV2',
        });
        return;
      }

      let text = `📋 *Últimos 5 Lançamentos:*\n\n`;
      for (const t of res.data) {
        const icon = t.type === 'receita' ? '🟢' : '🔴';
        const dateStr = t.transactionDate.toISOString().slice(0, 10);
        text += `${icon} *${escapeMarkdownV2(formatCurrencyPtBr(t.amount))}* \\- ${escapeMarkdownV2(t.description)} ` +
          `_(${escapeMarkdownV2(dateStr)})_\n`;
      }

      await channel.sendMessage(chatId, text, { parseMode: 'MarkdownV2' });
      return;
    }

    // Free text NLP parsing via Assistant module
    const outcome = await proposeFromText(scope, {
      text: rawText,
      sourceRef: `telegram:${msg.message_id}`,
    });

    if (outcome.kind === 'proposal') {
      const keyboard = [
        [
          {
            text: '✅ Confirmar',
            callback_data: encodeProposalCallback(outcome.proposalId, 'confirm'),
          },
          {
            text: '❌ Cancelar',
            callback_data: encodeProposalCallback(outcome.proposalId, 'cancel'),
          },
        ],
      ];

      const proposalText = TelegramMessagesPtBr.proposalDraft({
        type: outcome.draft.type,
        amountFormatted: formatCurrencyPtBr(outcome.draft.amount),
        description: outcome.draft.description,
        categoryName: outcome.draft.categoryName,
        dateFormatted: outcome.draft.date,
        scope: outcome.draft.scope,
      });

      await channel.sendMessage(chatId, proposalText, {
        parseMode: 'MarkdownV2',
        replyMarkup: { inline_keyboard: keyboard },
      });
      return;
    }

    if (outcome.kind === 'question') {
      await channel.sendMessage(
        chatId,
        `❓ ${escapeMarkdownV2(outcome.questionText)}`,
        { parseMode: 'MarkdownV2' }
      );
      return;
    }

    if (outcome.kind === 'not_a_transaction') {
      await channel.sendMessage(chatId, TelegramMessagesPtBr.notUnderstood(), {
        parseMode: 'MarkdownV2',
      });
      return;
    }

    if (outcome.kind === 'query') {
      await channel.sendMessage(
        chatId,
        `💡 Identifiquei uma consulta (${escapeMarkdownV2(outcome.queryKind)}). Use os comandos como \`/saldo\`, \`/limite\` ou \`/potes\`.`,
        { parseMode: 'MarkdownV2' }
      );
      return;
    }

    if (outcome.kind === 'refused') {
      await channel.sendMessage(chatId, `⚠️ ${escapeMarkdownV2(outcome.reason)}`, {
        parseMode: 'MarkdownV2',
      });
    }
  }
}

async function buildScope(workspaceId: string, userId: string): Promise<WorkspaceScope> {
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId },
  });

  const entities = await prisma.entity.findMany({
    where: { workspaceId },
  });

  const pj = entities.find((e) => e.type === 'PJ');
  const pf = entities.find((e) => e.type === 'PF');

  return {
    workspaceId,
    actorUserId: userId,
    actorRole: (membership?.role as any) || 'OWNER',
    defaultEntityIds: {
      pj: pj?.id,
      pf: pf?.id,
    },
  };
}
