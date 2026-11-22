import type { PaymentMethod } from '@prisma/client';
import { LocalDate, Money, YearMonth } from '../shared/index.js';
import { MeiLimitCalculator } from '../modules/fiscal/public.js';

// Cenário puro da demonstração: sem banco, sem relógio global. Tudo em centavos (Money) e relativo a "hoje".

export interface DemoEntry {
  readonly key: string; // chave estável: vira o sourceRef do ledger e garante idempotência
  readonly entity: 'pj' | 'pf';
  readonly type: 'receita' | 'despesa';
  readonly categorySlug: string;
  readonly amount: Money;
  readonly description: string;
  readonly date: LocalDate;
  readonly paymentMethod: PaymentMethod;
  /** Mistura PF/PJ: o dinheiro pessoal pagou a despesa da PJ, ou a receita da PJ caiu na conta pessoal. */
  readonly paidByPf?: boolean;
  /** Acerto já quitado (o seed o marca como acertado depois de criar o lançamento). */
  readonly settled?: boolean;
}

/** Retirada de pró-labore: perna despesa na PJ e receita na PF, ligadas por transferGroupId (caso de uso do ledger). */
export interface DemoWithdrawal {
  readonly key: string;
  readonly amount: Money;
  readonly description: string;
  readonly date: LocalDate;
}

export interface DemoScenario {
  readonly openedOn: LocalDate;
  readonly entries: readonly DemoEntry[];
  readonly withdrawals: readonly DemoWithdrawal[];
}

/** Meta de receita acumulada da PJ: 75% do limite, para o próximo lançamento passar de 80%. */
export const DEMO_TARGET_PERCENT = 75;

const REVENUE_WEIGHTS = [100, 112, 94, 120, 105, 98, 125, 108, 102, 115, 96, 110] as const;
const CLIENTS = [
  'Consultoria de desenvolvimento web',
  'Projeto de integração de sistemas',
  'Manutenção mensal de plataforma',
  'Suporte técnico e treinamento',
  'Desenvolvimento de landing page',
  'Automação de relatórios',
] as const;
// MEI de serviços: nada aqui é "Mercadorias e Insumos" (revenda/matéria-prima). Software e afins são despesa operacional comum.
const PJ_SUPPLIES = [
  { description: 'Licenças de software', cents: 21900n, slug: 'outras-despesas' },
  { description: 'Periféricos (mouse, teclado e cabos)', cents: 24900n, slug: 'outras-despesas' },
  { description: 'Hospedagem e domínio', cents: 18900n, slug: 'aluguel-comercial' },
  { description: 'Material de escritório', cents: 7650n, slug: 'outras-despesas' },
] as const;

/** Pró-labore mensal: coerente com o faturamento (~R$ 5 mil/mês) e com a base de renda da PF. */
export const DEMO_PRO_LABORE_CENTS = 350000n;
/** Necessidades Básicas da PF no mês atual: faixa "atenção" (alerta sem parecer bug). */
export const DEMO_NECESSIDADES_CURRENT_PERCENT = 85;
// Uso do pote Necessidades por mês (do mais antigo ao atual); o último vale DEMO_NECESSIDADES_CURRENT_PERCENT
const NECESSIDADES_PERCENT = [72, 88, 96, 79, 104, 83, 91, 76, 98, 86, 94, DEMO_NECESSIDADES_CURRENT_PERCENT] as const;
const NECESSIDADES_JAR_PERCENT = 55;
// Distribuição do gasto de necessidades entre os lançamentos do mês (soma 100)
const NECESSIDADES = [
  { slug: 'moradia', day: 10, weight: 40, description: 'Aluguel e condomínio', pm: 'pix' },
  { slug: 'alimentacao', day: 3, weight: 20, description: 'Supermercado', pm: 'cartao_credito' },
  { slug: 'alimentacao', day: 14, weight: 8, description: 'Feira e padaria', pm: 'pix' },
  { slug: 'alimentacao', day: 24, weight: 15, description: 'Supermercado', pm: 'cartao_credito' },
  { slug: 'transporte', day: 8, weight: 9, description: 'Combustível', pm: 'cartao_credito' },
  { slug: 'transporte', day: 20, weight: 3, description: 'Aplicativo de transporte', pm: 'pix' },
  { slug: 'saude', day: 16, weight: 5, description: 'Farmácia', pm: 'pix' },
] as const;

function clampDay(ym: YearMonth, day: number, lower: LocalDate, upper: LocalDate): LocalDate {
  let date = LocalDate.fromParts(ym.year, ym.month, Math.min(day, ym.endDate.day));
  if (date.isBefore(lower)) date = lower;
  if (date.isAfter(upper)) date = upper;
  return date;
}

function key(ym: YearMonth, slug: string, n: number): string {
  return `demo:${ym.toString()}:${slug}:${n}`;
}

function vary(base: bigint, index: number, spread: number): bigint {
  return base + BigInt((index * 3713) % spread);
}

export function buildDemoScenario(today: LocalDate): DemoScenario {
  const currentYm = today.yearMonth();
  const openMonth = today.month === 1 ? 1 : Math.max(2, today.month - 8);
  const openedOn = LocalDate.fromParts(
    today.year,
    openMonth,
    openMonth === today.month ? Math.min(10, today.day) : 10
  );

  const entries: DemoEntry[] = [];

  // ---- PJ: do mês de abertura até o mês corrente
  const pjMonths: YearMonth[] = [];
  for (let ym = YearMonth.fromParts(today.year, openMonth); !ym.isAfter(currentYm); ym = ym.addMonths(1)) {
    pjMonths.push(ym);
  }

  const limite = MeiLimitCalculator.compute({
    year: today.year,
    openedOn: { year: openedOn.year, month: openedOn.month },
    faturamentoAno: Money.zero(),
  }).limite;
  const target = limite.mulRatio(DEMO_TARGET_PERCENT, 100);
  const perMonth = target.allocate(pjMonths.map((_, i) => REVENUE_WEIGHTS[i % REVENUE_WEIGHTS.length]!));

  // Receita da PJ que caiu no Pix pessoal, já acertada: no mês anterior ao atual (ou no único mês, se for só um)
  const settledMonthIdx = Math.max(0, pjMonths.length - 2);

  pjMonths.forEach((ym, i) => {
    const [first, second] = perMonth[i]!.allocate([60, 40]) as [Money, Money];
    const clientIdx = i % CLIENTS.length;
    const revenue = [
      { n: 1, day: 8, amount: first, description: CLIENTS[clientIdx]! },
      { n: 2, day: 22, amount: second, description: CLIENTS[(clientIdx + 3) % CLIENTS.length]! },
    ];
    for (const r of revenue) {
      entries.push({
        key: key(ym, 'prestacao-servicos', r.n),
        entity: 'pj',
        type: 'receita',
        categorySlug: 'prestacao-servicos',
        amount: r.amount,
        description: r.description,
        date: clampDay(ym, r.day, openedOn, today),
        paymentMethod: 'pix',
        ...(i === settledMonthIdx && r.n === 2
          ? { description: `${r.description} (cliente pagou no Pix pessoal)`, paidByPf: true, settled: true }
          : {}),
      });
    }

    const supply = PJ_SUPPLIES[i % PJ_SUPPLIES.length]!;
    const expenses = [
      { slug: 'aluguel-comercial', day: 5, cents: 38990n, description: 'Coworking e internet', pm: 'pix' },
      { slug: supply.slug, day: 12, cents: supply.cents, description: supply.description, pm: 'cartao_credito' },
      { slug: 'outras-despesas', day: 25, cents: 4990n, description: 'Contador e tarifas bancárias', pm: 'pix' },
    ] as const;
    expenses.forEach((e, n) => {
      const date = LocalDate.fromParts(ym.year, ym.month, e.day);
      if (date.isAfter(today) || date.isBefore(openedOn)) return;
      entries.push({
        key: key(ym, e.slug, n + 1),
        entity: 'pj',
        type: 'despesa',
        categorySlug: e.slug,
        amount: Money.fromCents(e.cents),
        description: e.description,
        date,
        paymentMethod: e.pm,
      });
    });
  });

  // Despesa da PJ paga com dinheiro pessoal e ainda não acertada (a PJ deve à PF)
  const openDate = today.addDays(-4);
  entries.push({
    key: `demo:${currentYm.toString()}:acerto-aberto:1`,
    entity: 'pj',
    type: 'despesa',
    categorySlug: 'outras-despesas',
    amount: Money.fromCents(79900n),
    description: 'Monitor para a estação de trabalho (pago no cartão pessoal)',
    date: openDate.isBefore(openedOn) ? openedOn : openDate,
    paymentMethod: 'cartao_credito',
    paidByPf: true,
  });

  // ---- Pró-labore: uma retirada por mês, no começo do mês, desde a abertura
  const withdrawals: DemoWithdrawal[] = pjMonths.map((ym) => ({
    key: `demo:${ym.toString()}:pro-labore`,
    amount: Money.fromCents(DEMO_PRO_LABORE_CENTS),
    description: 'Pró-labore do MEI',
    date: clampDay(ym, 5, openedOn, today),
  }));

  // ---- PF: 12 meses de histórico. Renda de 3.500/mês em todos os meses: salário até a abertura do MEI,
  // depois o pró-labore (que vem da retirada da PJ, acima, não de receita solta).
  const monthStart = (ym: YearMonth) => LocalDate.fromParts(ym.year, ym.month, 1);
  for (let i = 0; i < 12; i++) {
    const ym = currentYm.addMonths(i - 11);

    if (ym.isBefore(openedOn.yearMonth())) {
      entries.push({
        key: key(ym, 'outras-receitas', 1),
        entity: 'pf',
        type: 'receita',
        categorySlug: 'outras-receitas',
        amount: Money.fromCents(DEMO_PRO_LABORE_CENTS),
        description: 'Salário (emprego anterior)',
        date: clampDay(ym, 5, monthStart(ym), today),
        paymentMethod: 'pix',
      });
    }

    // Necessidades: valor calculado para o pote chegar na faixa desejada do mês (base = renda de 3.500)
    const jarAllocation = Money.fromCents(DEMO_PRO_LABORE_CENTS).mulRatio(NECESSIDADES_JAR_PERCENT, 100);
    const target = jarAllocation.mulRatio(NECESSIDADES_PERCENT[i]!, 100);
    const parts = target.allocate(NECESSIDADES.map((n) => n.weight));
    NECESSIDADES.forEach((n, idx) => {
      entries.push({
        key: key(ym, n.slug, idx + 1),
        entity: 'pf',
        type: 'despesa',
        categorySlug: n.slug,
        amount: parts[idx]!,
        description: n.description,
        date: clampDay(ym, n.day, monthStart(ym), today),
        paymentMethod: n.pm,
      });
    });

    const pf = [
      { slug: 'educacao', day: 7, cents: 11990n, description: 'Curso online', pm: 'cartao_credito' },
      { slug: 'lazer', day: 18, cents: 8990n, description: 'Streaming e assinaturas', pm: 'cartao_credito' },
      { slug: 'lazer', day: 27, cents: vary(14200n, i, 4500), description: 'Restaurante', pm: 'pix' },
    ] as const;
    pf.forEach((e, n) => {
      const date = LocalDate.fromParts(ym.year, ym.month, e.day);
      if (date.isAfter(today)) return;
      entries.push({
        key: key(ym, e.slug, n + 1),
        entity: 'pf',
        type: 'despesa',
        categorySlug: e.slug,
        amount: Money.fromCents(e.cents),
        description: e.description,
        date,
        paymentMethod: e.pm,
      });
    });
  }

  return { openedOn, entries, withdrawals };
}
