export interface JarTemplateItem {
  readonly slug: string;
  readonly name: string;
  readonly percent?: number; // 0 to 100
  readonly fixedAmount?: string; // e.g. "86.05"
  readonly rollover: boolean;
  readonly defaultCategorySlugs?: readonly string[];
}

export interface JarTemplate {
  readonly slug: string;
  readonly name: string;
  readonly targetKind: 'pj' | 'pf' | 'ambas';
  readonly jars: readonly JarTemplateItem[];
}

export const JAR_TEMPLATES: readonly JarTemplate[] = [
  {
    slug: 'mei-empresa',
    name: 'MEI — Empresa',
    targetKind: 'pj',
    jars: [
      {
        slug: 'operacao',
        name: 'Operação & Custos',
        percent: 50.0,
        rollover: false,
        defaultCategorySlugs: ['mercadoria-insumos', 'aluguel-comercial', 'outras-despesas'],
      },
      {
        slug: 'impostos',
        name: 'Impostos (DAS)',
        percent: 10.0,
        rollover: false,
        defaultCategorySlugs: ['impostos-das'],
      },
      {
        slug: 'reserva',
        name: 'Reserva de Emergência PJ',
        percent: 15.0,
        rollover: true,
      },
      {
        slug: 'reinvestimento',
        name: 'Reinvestimento & Crescimento',
        percent: 10.0,
        rollover: false,
      },
      {
        slug: 'prolabore',
        name: 'Pró-labore',
        percent: 15.0,
        rollover: false,
      },
    ],
  },
  {
    slug: 'seis-potes',
    name: 'Pessoal — Método dos 6 Potes',
    targetKind: 'pf',
    jars: [
      {
        slug: 'necessidades',
        name: 'Necessidades Básicas',
        percent: 55.0,
        rollover: false,
        defaultCategorySlugs: ['moradia', 'alimentacao', 'transporte', 'saude'],
      },
      {
        slug: 'liberdade',
        name: 'Liberdade Financeira',
        percent: 10.0,
        rollover: true,
        defaultCategorySlugs: ['investimentos'],
      },
      {
        slug: 'educacao',
        name: 'Educação',
        percent: 10.0,
        rollover: false,
        defaultCategorySlugs: ['educacao'],
      },
      {
        slug: 'longo-prazo',
        name: 'Poupança para Grandes Compras',
        percent: 10.0,
        rollover: true,
      },
      {
        slug: 'diversao',
        name: 'Lazer e Diversão',
        percent: 10.0,
        rollover: false,
        defaultCategorySlugs: ['lazer'],
      },
      {
        slug: 'doacao',
        name: 'Doações',
        percent: 5.0,
        rollover: false,
        defaultCategorySlugs: ['doacoes'],
      },
    ],
  },
  {
    slug: '50-30-20',
    name: 'Pessoal — 50 / 30 / 20',
    targetKind: 'pf',
    jars: [
      {
        slug: 'necessidades',
        name: 'Necessidades (50%)',
        percent: 50.0,
        rollover: false,
        defaultCategorySlugs: ['moradia', 'alimentacao', 'transporte', 'saude'],
      },
      {
        slug: 'desejos',
        name: 'Desejos & Estilo de Vida (30%)',
        percent: 30.0,
        rollover: false,
        defaultCategorySlugs: ['lazer'],
      },
      {
        slug: 'poupanca',
        name: 'Poupança & Dívidas (20%)',
        percent: 20.0,
        rollover: true,
        defaultCategorySlugs: ['investimentos'],
      },
    ],
  },
  {
    slug: 'personalizado',
    name: 'Personalizado',
    targetKind: 'ambas',
    jars: [],
  },
] as const;
