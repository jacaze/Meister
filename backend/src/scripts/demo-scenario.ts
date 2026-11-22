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
}

export interface DemoScenario {
  readonly openedOn: LocalDate;
  readonly entries: readonly DemoEntry[];
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
const PJ_SUPPLIES = [
  { description: 'Licenças de software', cents: 21900n },
  { description: 'Equipamentos e periféricos', cents: 64900n },
  { description: 'Hospedagem e domínio', cents: 18900n },
  { description: 'Material de escritório', cents: 7650n },
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
      });
    }

    const supply = PJ_SUPPLIES[i % PJ_SUPPLIES.length]!;
    const expenses = [
      { slug: 'aluguel-comercial', day: 5, cents: 38990n, description: 'Coworking e internet', pm: 'pix' },
      { slug: 'mercadoria-insumos', day: 12, cents: supply.cents, description: supply.description, pm: 'cartao_credito' },
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

  // ---- PF: 12 meses de histórico
  for (let i = 0; i < 12; i++) {
    const ym = currentYm.addMonths(i - 11);
    const pf = [
      { slug: 'pro-labore', type: 'receita', day: 5, cents: 350000n, description: 'Pró-labore do MEI', pm: 'pix' },
      { slug: 'moradia', type: 'despesa', day: 10, cents: 125000n, description: 'Aluguel e condomínio', pm: 'pix' },
      { slug: 'alimentacao', type: 'despesa', day: 3, cents: vary(52040n, i, 6000), description: 'Supermercado', pm: 'cartao_credito' },
      { slug: 'alimentacao', type: 'despesa', day: 14, cents: vary(21575n, i, 3000), description: 'Feira e padaria', pm: 'pix' },
      { slug: 'alimentacao', type: 'despesa', day: 24, cents: vary(48030n, i, 5000), description: 'Supermercado', pm: 'cartao_credito' },
      { slug: 'transporte', type: 'despesa', day: 8, cents: vary(26000n, i, 4000), description: 'Combustível', pm: 'cartao_credito' },
      { slug: 'transporte', type: 'despesa', day: 20, cents: 7490n, description: 'Aplicativo de transporte', pm: 'pix' },
      { slug: 'educacao', type: 'despesa', day: 7, cents: 11990n, description: 'Curso online', pm: 'cartao_credito' },
      { slug: 'lazer', type: 'despesa', day: 18, cents: 8990n, description: 'Streaming e assinaturas', pm: 'cartao_credito' },
      { slug: 'lazer', type: 'despesa', day: 27, cents: vary(14200n, i, 4500), description: 'Restaurante', pm: 'pix' },
      ...(i % 2 === 0
        ? [{ slug: 'saude', type: 'despesa', day: 16, cents: vary(13820n, i, 3000), description: 'Farmácia', pm: 'pix' } as const]
        : []),
    ] as const;
    pf.forEach((e, n) => {
      const date = LocalDate.fromParts(ym.year, ym.month, e.day);
      if (date.isAfter(today)) return;
      entries.push({
        key: key(ym, e.slug, n + 1),
        entity: 'pf',
        type: e.type,
        categorySlug: e.slug,
        amount: Money.fromCents(e.cents),
        description: e.description,
        date,
        paymentMethod: e.pm,
      });
    });
  }

  return { openedOn, entries };
}
