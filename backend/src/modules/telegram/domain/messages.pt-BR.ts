export function escapeMarkdownV2(text: string): string {
  // Characters reserved in MarkdownV2: _ * [ ] ( ) ~ ` > # + - = | { } . !
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

export function formatBrl(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(isNaN(num) ? 0 : num);
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
      `📅 *Data:* ${escapeMarkdownV2(draft.date)}\n` +
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
      msg += `\n📦 *Pote ${escapeMarkdownV2(res.impact.jarName)}:* ${escapeMarkdownV2(res.impact.jarPercentUsed.toFixed(1))}% utilizado${warn}`;
    }

    if (res.impact?.meiPercentUsed !== undefined) {
      msg += `\n📊 *Termômetro MEI:* ${escapeMarkdownV2(res.impact.meiPercentUsed.toFixed(1))}% do teto anual`;
    }

    return msg;
  },

  proposalCancelled: `❌ *Proposta cancelada com sucesso\\.* O lançamento foi descartado\\.`,

  notUnderstood: `🤔 *Não consegui identificar um lançamento financeiro\\.*\n\nTente algo como: _"Gastei 50 no almoço"_ ou _"Recebi 2500 de serviço via Pix"_\\.`,
};
