import type { TransactionType } from '@prisma/client';

export interface DefaultCategoryDefinition {
  readonly slug: string;
  readonly name: string;
  readonly type: TransactionType;
  readonly entityKind: 'pf' | 'pj' | 'ambas';
  readonly defaultJarSlug?: string;
}

export const DEFAULT_CATEGORIES: readonly DefaultCategoryDefinition[] = [
  // PJ (Empresa / MEI)
  {
    slug: 'vendas-produtos',
    name: 'Vendas de Produtos',
    type: 'receita',
    entityKind: 'pj',
  },
  {
    slug: 'prestacao-servicos',
    name: 'Prestação de Serviços',
    type: 'receita',
    entityKind: 'pj',
  },
  {
    slug: 'mercadoria-insumos',
    name: 'Mercadorias e Insumos',
    type: 'despesa',
    entityKind: 'pj',
    defaultJarSlug: 'operacao',
  },
  {
    slug: 'impostos-das',
    name: 'Impostos (DAS)',
    type: 'despesa',
    entityKind: 'pj',
    defaultJarSlug: 'impostos',
  },
  {
    slug: 'aluguel-comercial',
    name: 'Aluguel Comercial e Contas',
    type: 'despesa',
    entityKind: 'pj',
    defaultJarSlug: 'operacao',
  },

  // PF (Pessoa Física)
  {
    slug: 'pro-labore',
    name: 'Pró-labore e Retiradas',
    type: 'receita',
    entityKind: 'pf',
  },
  {
    slug: 'outras-receitas',
    name: 'Outras Receitas',
    type: 'receita',
    entityKind: 'pf',
  },
  {
    slug: 'moradia',
    name: 'Moradia',
    type: 'despesa',
    entityKind: 'pf',
    defaultJarSlug: 'necessidades',
  },
  {
    slug: 'alimentacao',
    name: 'Alimentação',
    type: 'despesa',
    entityKind: 'pf',
    defaultJarSlug: 'necessidades',
  },
  {
    slug: 'transporte',
    name: 'Transporte',
    type: 'despesa',
    entityKind: 'pf',
    defaultJarSlug: 'necessidades',
  },
  {
    slug: 'saude',
    name: 'Saúde',
    type: 'despesa',
    entityKind: 'pf',
    defaultJarSlug: 'necessidades',
  },
  {
    slug: 'educacao',
    name: 'Educação',
    type: 'despesa',
    entityKind: 'pf',
    defaultJarSlug: 'educacao',
  },
  {
    slug: 'lazer',
    name: 'Lazer e Diversão',
    type: 'despesa',
    entityKind: 'pf',
    defaultJarSlug: 'diversao',
  },
  {
    slug: 'investimentos',
    name: 'Investimentos e Poupança',
    type: 'despesa',
    entityKind: 'pf',
    defaultJarSlug: 'liberdade',
  },
  {
    slug: 'doacoes',
    name: 'Doações',
    type: 'despesa',
    entityKind: 'pf',
    defaultJarSlug: 'doacao',
  },
  {
    slug: 'outras-despesas',
    name: 'Outras Despesas',
    type: 'despesa',
    entityKind: 'ambas',
  },
] as const;
