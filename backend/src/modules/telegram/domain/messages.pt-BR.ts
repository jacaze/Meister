export function escapeMarkdownV2(text: string): string {
  // Characters that must be escaped in Telegram MarkdownV2:
  // _ * [ ] ( ) ~ ` > # + - = | { } . !
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

export function formatCurrencyPtBr(centsOrAmount: bigint | number | string): string {
  let num: number;
  if (typeof centsOrAmount === 'bigint') {
    num = Number(centsOrAmount) / 100;
  } else if (typeof centsOrAmount === 'string') {
    num = parseFloat(centsOrAmount);
  } else {
    num = centsOrAmount;
  }
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const TelegramMessagesPtBr = {
  welcomeUnlinked: (botUsername?: string) =>
    `👋 *Olá\\! Bem\\-vindo ao Meister*\n\n` +
    `Para conectar sua conta com segurança, acesse as *Configurações* do seu painel Meister no computador ou celular e clique em *Conectar Telegram*\\.\n\n` +
    `Ou use o comando:\n` +
    `\`/start <seu_token_de_vinculacao>\``,

  linkSuccess: (workspaceName: string) =>
    `🎉 *Conta conectada com sucesso\\!*\n\n` +
    `Seu Telegram está vinculado ao workspace *${escapeMarkdownV2(workspaceName)}*\\.\n\n` +
    `Agora você pode enviar fotos de notas ou mensagens em texto como:\n` +
    `• _"Gastei 45 no almoço hoje no pix"_\n` +
    `• _"Recebi 1200 do cliente ABC"_\n` +
    `• _"/saldo"_, _"/limite"_, _"/potes"_`,

  helpText: () =>
    `🧭 *Comandos Disponíveis:*\n\n` +
    `• \`/saldo\` \\- Ver o saldo total consolidado\n` +
    `• \`/limite\` \\- Termômetro de faturamento anual do MEI\n` +
    `• \`/das\` \\- Status da guia DAS do mês\n` +
    `• \`/potes\` \\- Situação dos potes de orçamento\n` +
    `• \`/ultimos\` \\- Ver os últimos 5 lançamentos\n` +
    `• \`/ajuda\` \\- Mostra esta mensagem de ajuda\n\n` +
    `💡 *Lançamentos Rápidos:*\n` +
    `Envie uma mensagem em linguagem natural, por exemplo:\n` +
    `_"Comprei materiais elétricos 180 no débito ontem"_`,

  proposalDraft: (data: {
    type: 'receita' | 'despesa';
    amountFormatted: string;
    description: string;
    categoryName: string;
    dateFormatted: string;
    scope: 'pj' | 'pf';
  }) => {
    const icon = data.type === 'receita' ? '🟢' : '🔴';
    const typeLabel = data.type === 'receita' ? 'Receita' : 'Despesa';
    const scopeLabel = data.scope === 'pj' ? 'Empresa (PJ)' : 'Pessoal (PF)';

    return (
      `📝 *Proposta de Lançamento*\n\n` +
      `${icon} *Tipo:* ${escapeMarkdownV2(typeLabel)}\n` +
      `💰 *Valor:* ${escapeMarkdownV2(data.amountFormatted)}\n` +
      `🏷️ *Descrição:* ${escapeMarkdownV2(data.description)}\n` +
      `📁 *Categoria:* ${escapeMarkdownV2(data.categoryName)}\n` +
      `📅 *Data:* ${escapeMarkdownV2(data.dateFormatted)}\n` +
      `🏢 *Conta:* ${escapeMarkdownV2(scopeLabel)}\n\n` +
      `_Deseja confirmar este lançamento?_`
    );
  },

  proposalConfirmed: (data: {
    amountFormatted: string;
    description: string;
    jarName?: string;
    jarPercent?: number;
    meiRemaining?: string;
  }) => {
    let msg = `✅ *Lançamento confirmado com sucesso\\!*\n` +
      `💰 *${escapeMarkdownV2(data.amountFormatted)}* \\- ${escapeMarkdownV2(data.description)}\n`;

    if (data.jarName && data.jarPercent !== undefined) {
      msg += `\n🏺 *Pote:* ${escapeMarkdownV2(data.jarName)} (${data.jarPercent}% utilizado)`;
    }
    if (data.meiRemaining) {
      msg += `\n📊 *MEI:* ${escapeMarkdownV2(data.meiRemaining)} restantes para o teto anual`;
    }
    return msg;
  },

  proposalCanceled: () => `❌ *Proposta cancelada com sucesso\\.*`,

  notUnderstood: () =>
    `🤔 Não entendi o lançamento financeiro\\.\n` +
    `Tente enviar o valor e a descrição, por exemplo:\n` +
    `_"Gastei 50 no mercado hoje no pix"_`,
};
