import { formatBRLFromDecimal, formatDateBR, formatPercent } from '../../../shared/format.js';

export function escapeMarkdownV2(text: string): string {
  // Characters reserved in MarkdownV2: _ * [ ] ( ) ~ ` > # + - = | { } . !
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

export function formatBrl(amount: string | number): string {
  return formatBRLFromDecimal(amount);
}

export const MessagesPtBr = {
  welcomeUnlinked: (_botUsername?: string) =>
    `👋 *Olá\\! Eu sou o assistente financeiro do MEIster\\.*\n\n` +
    `Para vincular sua conta e lançar despesas/receitas direto por aqui, acesse o MEIster na web em *Configurações ➔ Conexões ➔ Telegram* e clique em *Vincular*\\.`,

  linkSuccess: (userName: string, workspaceName: string) =>
    `🎉 *Conta vinculada com sucesso\\!*\n\n` +
    `Olá, *${escapeMarkdownV2(userName)}*\\! Agora suas mensagens no Telegram serão registradas diretamente no workspace *${escapeMarkdownV2(workspaceName)}*\\.\n\n` +
    `💡 *Exemplos do que você pode me mandar:*\n` +
    `• _"Gastei 45 no almoço no débito"_\n` +
    `• _"Recebi 1500 de consultoria via Pix"_\n` +
    `• _"Paguei 120 de gasolina ontem"_\n` +
    `• Comandos: /saldo, /limite, /das, /potes ou /ajuda\\.`,

  alreadyLinked:
    `ℹ️ *Este chat já está vinculado à sua conta MEIster\\.*\n\nEnvie uma receita, despesa ou use /ajuda para ver os comandos\\.`,

  invalidOrExpiredToken:
    `❌ *Link de vínculo inválido ou expirado\\.*\n\nPor favor, gere um novo link no painel web do MEIster e tente novamente\\.`,

  help:
    `🤖 *Comandos do MEIster Assistente*\n\n` +
    `• /saldo — Saldo consolidado das contas\n` +
    `• /limite — Termômetro do limite anual do MEI\n` +
    `• /das — Situação e valor do DAS do mês\n` +
    `• /potes — Situação dos potes financeiros\n` +
    `• /insights — Dicas e análises inteligentes das suas finanças\n` +
    `• /resumo — Resumo financeiro do mês em 3 pontos\n` +
    `• /perguntar <texto> — Pergunte aos seus números\n` +
    `• /ultimos — Últimos lançamentos registrados\n` +
    `• /desvincular — Desconecta o Telegram da sua conta\n` +
    `• /ajuda — Exibe esta mensagem\n\n` +
    `_Você também pode simplesmente digitar qualquer lançamento em linguagem natural ou mandar fotos de notas fiscais\\._`,

  proposalReady: (draft: {
    type: 'receita' | 'despesa';
    amount: string;
    description: string;
    categoryName: string;
    date: string;
    scope: 'pj' | 'pf';
  }) => {
    const icon = draft.type === 'receita' ? '🟢' : '🔴';
    const typeLabel = draft.type === 'receita' ? 'Receita' : 'Despesa';
    const scopeLabel = draft.scope === 'pj' ? 'Empresa (MEI)' : 'Pessoal (PF)';

    return (
      `🧾 *Proposta de Lançamento*\n\n` +
      `${icon} *Tipo:* ${escapeMarkdownV2(typeLabel)}\n` +
      `💰 *Valor:* *${escapeMarkdownV2(formatBrl(draft.amount))}*\n` +
      `📝 *Descrição:* ${escapeMarkdownV2(draft.description)}\n` +
      `🏷️ *Categoria:* ${escapeMarkdownV2(draft.categoryName)}\n` +
      `📅 *Data:* ${escapeMarkdownV2(formatDateBR(draft.date))}\n` +
      `🏢 *Entidade:* ${escapeMarkdownV2(scopeLabel)}\n\n` +
      `_Deseja confirmar este lançamento?_`
    );
  },

  proposalConfirmed: (res: {
    description: string;
    amount: string;
    type: string;
    impact?: {
      jarName?: string;
      jarPercentUsed?: number;
      isJarWarning?: boolean;
      meiAnnualLimit?: number;
      meiPercentUsed?: number;
    };
  }) => {
    let msg = `✅ *Lançamento confirmado com sucesso\\!*\n\n` +
      `• *${escapeMarkdownV2(res.description)}* — *${escapeMarkdownV2(formatBrl(res.amount))}*\n`;

    if (res.impact?.jarName && res.impact?.jarPercentUsed !== undefined) {
      const warn = res.impact.isJarWarning ? ' ⚠️' : '';
      msg += `\n📦 *Pote ${escapeMarkdownV2(res.impact.jarName)}:* ${escapeMarkdownV2(formatPercent(res.impact.jarPercentUsed))} utilizado${warn}`;
    }

    if (res.impact?.meiPercentUsed !== undefined) {
      msg += `\n📊 *Termômetro MEI:* ${escapeMarkdownV2(formatPercent(res.impact.meiPercentUsed))} do teto anual`;
    }

    return msg;
  },

  receiptProposalReady: (data: {
    issuerName?: string;
    total: string;
    issuedOn: string;
    splits?: Array<{ categoryName: string; amount: string; jarName?: string }>;
    duplicate?: boolean;
    duplicateDate?: string;
  }) => {
    let msg = `🧾 *Nota Fiscal / Comprovante Reconhecido*\n\n`;
    if (data.issuerName) {
      msg += `🏢 *Estabelecimento:* ${escapeMarkdownV2(data.issuerName)}\n`;
    }
    msg += `📅 *Data de Emissão:* ${escapeMarkdownV2(formatDateBR(data.issuedOn))}\n`;
    msg += `💰 *Total da Nota:* *${escapeMarkdownV2(formatBrl(data.total))}*\n\n`;

    if (data.splits && data.splits.length > 1) {
      msg += `📦 *Divisão Automática por Categorias/Potes:*\n`;
      for (const s of data.splits) {
        const jar = s.jarName ? ` \\(Pote: ${escapeMarkdownV2(s.jarName)}\\)` : '';
        msg += `• *${escapeMarkdownV2(s.categoryName)}:* ${escapeMarkdownV2(formatBrl(s.amount))}${jar}\n`;
      }
      msg += `\n`;
    }

    if (data.duplicate) {
      msg += `⚠️ *Atenção:* Esta nota fiscal já foi registrada em ${escapeMarkdownV2(data.duplicateDate ? formatDateBR(data.duplicateDate) : 'data anterior')}\\. Deseja registrar novamente\\?\n\n`;
    } else {
      msg += `_Deseja confirmar o lançamento desta despesa?_`;
    }

    return msg;
  },

  proposalCancelled: `❌ *Proposta cancelada com sucesso\\.* O lançamento foi descartado\\.`,

  notUnderstood: `🤔 *Não consegui identificar um lançamento financeiro\\.*\n\nTente algo como: _"Gastei 50 no almoço"_ ou _"Recebi 2500 de serviço via Pix"_\\.`,

  audioUnsupported:
    `🎙️ *Ainda não entendo áudio\\.* Me mande por texto \\(ex\\.: _"gastei 45 no mercado no pix"_\\) ou uma foto da nota fiscal\\.`,

  documentUnsupported:
    `📎 *Ainda não consigo ler esse tipo de documento\\.* Me mande o lançamento por texto \\(ex\\.: _"gastei 45 no mercado no pix"_\\) ou uma *foto* da nota fiscal\\.`,

  mediaUnsupported:
    `🤔 *Esse tipo de mensagem eu ainda não entendo\\.* Eu entendo *texto* \\(ex\\.: _"gastei 45 no mercado no pix"_\\), *foto de nota fiscal* e os comandos de /ajuda\\.`,

  editedUnsupported:
    `✏️ *Vi que você editou uma mensagem, mas não consigo reprocessar edições\\.* Envie o lançamento como uma nova mensagem\\.`,

  proposalNoLongerAvailable:
    `⌛ *Essa proposta expirou ou não está mais disponível\\.* Envie o lançamento novamente para gerar outra\\.`,
};
