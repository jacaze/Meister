/**
 * Mapeamento puro da categoria que a Pluggy envia em cada transação (texto em inglês, campo
 * `category`) para o slug de categoria padrão do MEIster. Sem SDK e sem banco.
 *
 * Fonte dos nomes: árvore de categorias da Pluggy
 * (https://docs.pluggy.ai/docs/transaction-categories, seção "Category Tree").
 *
 * Princípios:
 * - Respeita a direção: o slug devolvido sempre existe para o tipo do lançamento (despesa = out,
 *   receita = in). Reembolso de compra (Shopping com direção "in") não sugere nada.
 * - Transferências, PIX, pagamento de fatura e empréstimos não dizem nada sobre o destino do
 *   dinheiro: ficam sem sugestão (melhor que errar).
 */

export type PluggyDirection = 'in' | 'out';

interface SlugByDirection {
  readonly out?: string;
  readonly in?: string;
}

const OUT = (slug: string): SlugByDirection => ({ out: slug });
const IN = (slug: string): SlugByDirection => ({ in: slug });

const ALIMENTACAO = OUT('alimentacao');
const MORADIA = OUT('moradia');
const TRANSPORTE = OUT('transporte');
const SAUDE = OUT('saude');
const EDUCACAO = OUT('educacao');
const LAZER = OUT('lazer');
const OUTRAS_DESPESAS = OUT('outras-despesas');
const OUTRAS_RECEITAS = IN('outras-receitas');

const RULES: ReadonlyArray<readonly [string, SlugByDirection]> = [
  // Receitas
  ['Income', OUTRAS_RECEITAS],
  ['Salary', OUTRAS_RECEITAS],
  ['Retirement', OUTRAS_RECEITAS],
  ['Entrepreneurial activities', OUTRAS_RECEITAS],
  ['Government aid', OUTRAS_RECEITAS],
  ['Non-recurring income', OUTRAS_RECEITAS],
  ['Proceeds interests and dividends', OUTRAS_RECEITAS],

  // Alimentação
  ['Groceries', ALIMENTACAO],
  ['Food and drinks', ALIMENTACAO],
  ['Eating out', ALIMENTACAO],
  ['Food delivery', ALIMENTACAO],
  ['Restaurants', ALIMENTACAO],

  // Moradia
  ['Housing', MORADIA],
  ['Rent', MORADIA],
  ['Houseware', MORADIA],
  ['Urban land and building tax', MORADIA],
  ['Utilities', MORADIA],
  ['Water', MORADIA],
  ['Electricity', MORADIA],
  ['Gas', MORADIA],

  // Transporte
  ['Transportation', TRANSPORTE],
  ['Taxi and ride-hailing', TRANSPORTE],
  ['Public transportation', TRANSPORTE],
  ['Car rental', TRANSPORTE],
  ['Bicycle', TRANSPORTE],
  ['Automotive', TRANSPORTE],
  ['Gas stations', TRANSPORTE],
  ['Parking', TRANSPORTE],
  ['Tolls and in-vehicle payment', TRANSPORTE],
  ['Vehicle ownership taxes and fees', TRANSPORTE],
  ['Vehicle maintenance', TRANSPORTE],
  ['Traffic tickets', TRANSPORTE],
  ['Vehicle insurance', TRANSPORTE],

  // Saúde
  ['Healthcare', SAUDE],
  ['Dentist', SAUDE],
  ['Pharmacy', SAUDE],
  ['Optometry', SAUDE],
  ['Hospital clinics and labs', SAUDE],
  ['Health insurance', SAUDE],
  ['Wellness and fitness', SAUDE],
  ['Gyms and fitness centers', SAUDE],
  ['Wellness', SAUDE],

  // Educação
  ['Education', EDUCACAO],
  ['Online Courses', EDUCACAO],
  ['University', EDUCACAO],
  ['School', EDUCACAO],
  ['Kindergarten', EDUCACAO],
  ['Bookstore', EDUCACAO],

  // Lazer
  ['Leisure', LAZER],
  ['Tickets', LAZER],
  ['Stadiums and arenas', LAZER],
  ['Landmarks and museums', LAZER],
  ['Cinema, theater and concerts', LAZER],
  ['Digital services', LAZER],
  ['Gaming', LAZER],
  ['Video streaming', LAZER],
  ['Music streaming', LAZER],
  ['Sports practice', LAZER],
  ['Travel', LAZER],
  ['Airport and airlines', LAZER],
  ['Accommodation', LAZER],
  ['Mileage programs', LAZER],
  ['Bus tickets', LAZER],
  ['Gambling', LAZER],
  ['Lottery', LAZER],
  ['Online bet', LAZER],

  // Doações
  ['Donations', OUT('doacoes')],

  // Investimentos (saída = aporte)
  ['Investments', OUT('investimentos')],
  ['Automatic investment', OUT('investimentos')],
  ['Fixed income', OUT('investimentos')],
  ['Mutual funds', OUT('investimentos')],
  ['Variable income', OUT('investimentos')],
  ['Pension', OUT('investimentos')],

  // Despesas sem categoria padrão específica: equivalem a "Outras Despesas"
  ['Shopping', OUTRAS_DESPESAS],
  ['Online shopping', OUTRAS_DESPESAS],
  ['Electronics', OUTRAS_DESPESAS],
  ['Pet supplies and vet', OUTRAS_DESPESAS],
  ['Clothing', OUTRAS_DESPESAS],
  ['Kids and toys', OUTRAS_DESPESAS],
  ['Sports goods', OUTRAS_DESPESAS],
  ['Office Supplies', OUTRAS_DESPESAS],
  ['Services', OUTRAS_DESPESAS],
  ['Telecommunications', OUTRAS_DESPESAS],
  ['Internet', OUTRAS_DESPESAS],
  ['Mobile', OUTRAS_DESPESAS],
  ['TV', OUTRAS_DESPESAS],
  ['Taxes', OUTRAS_DESPESAS],
  ['Income taxes', OUTRAS_DESPESAS],
  ['Taxes on investments', OUTRAS_DESPESAS],
  ['Tax on financial operations', OUTRAS_DESPESAS],
  ['Bank fees', OUTRAS_DESPESAS],
  ['Account fees', OUTRAS_DESPESAS],
  ['Wire transfer fees and ATM fees', OUTRAS_DESPESAS],
  ['Credit card fees', OUTRAS_DESPESAS],
  ['Insurance', OUTRAS_DESPESAS],
  ['Life insurance', OUTRAS_DESPESAS],
  ['Home Insurance', OUTRAS_DESPESAS],

  // Intencionalmente ausentes (sem sugestão): Transfers, Transfer - *, Same person transfer*,
  // Third-party transfers, Credit card payment, Loans and Financing, Financing, Legal obligations,
  // Cashback.
];

function normalize(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

const INDEX: ReadonlyMap<string, SlugByDirection> = new Map(
  RULES.map(([name, slugs]) => [normalize(name), slugs] as const)
);

/**
 * Devolve o slug da categoria padrão do MEIster para a categoria Pluggy, ou `null` quando não
 * há pista confiável (categoria ausente, desconhecida, transferência, ou direção incompatível).
 */
export function suggestSlugFromPluggyCategory(
  pluggyCategory: string | null | undefined,
  direction: PluggyDirection
): string | null {
  if (!pluggyCategory) return null;
  const slugs = INDEX.get(normalize(pluggyCategory));
  return slugs?.[direction] ?? null;
}

/**
 * Categorias de movimentação entre contas/pessoas (Transfers, Transfer - PIX, Same person
 * transfer, Third-party transfers, Credit card payment). A descrição de um PIX costuma citar o
 * nome de um comércio ("Mercado Pago"), então palavras-chave não devem classificá-los.
 */
export function isPluggyTransferCategory(pluggyCategory: string | null | undefined): boolean {
  if (!pluggyCategory) return false;
  const name = normalize(pluggyCategory);
  return (
    name.startsWith('transfer') ||
    name.startsWith('same person transfer') ||
    name.startsWith('third-party transfers') ||
    name === 'credit card payment'
  );
}
