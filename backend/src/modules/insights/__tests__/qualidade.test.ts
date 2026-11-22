import { describe, expect, it } from 'vitest';
import type { FinancialSnapshot, MonthlySummary } from '../domain/FinancialSnapshot.js';
import { CashForecastDetector } from '../domain/detectors/CashForecastDetector.js';
import { PositiveTrendDetector } from '../domain/detectors/PositiveTrendDetector.js';
import { LimitPaceDetector } from '../domain/detectors/LimitPaceDetector.js';
import { PfInPjDetector } from '../domain/detectors/PfInPjDetector.js';
import { TemplateNarrator } from '../domain/TemplateNarrator.js';
import { composeDigestPoints } from '../domain/DigestComposer.js';
import { PeriodResolver } from '../domain/PeriodResolver.js';
import { NumberGuard, LengthGuard } from '../domain/NarratorGuards.js';
import { refreshInsightsIfStale, resetInsightsRefreshCache } from '../application/use-cases/EnsureInsights.js';
import type { WorkspaceScope } from '../../../shared/index.js';

function month(m: string, income: bigint, expense: bigint): MonthlySummary {
  return { month: m, totalIncomeCents: income, totalExpenseCents: expense, netResultCents: income - expense, categoryExpenses: {} };
}

const snapshot = (overrides: Partial<FinancialSnapshot> = {}): FinancialSnapshot => ({
  workspaceId: 'ws',
  entityId: 'pf-1',
  isMei: false,
  period: '2026-11',
  dayOfMonth: 22,
  daysInMonth: 30,
  currentMonth: month('2026-11', 350000n, 260614n),
  historicalMonths: [],
  categories: [],
  jars: [],
  pfInPjCount: 0,
  pfInPjCents: 0n,
  ...overrides,
});

describe('CashForecastDetector (estimativa explicável)', () => {
  const history = [
    month('2026-10', 500000n, 300000n), // +2.000,00
    month('2026-09', 400000n, 350000n), // +500,00
    month('2026-08', 450000n, 480000n), // -300,00
  ];

  it('usa média, pior e melhor resultado dos 3 últimos meses, sem arredondar', () => {
    const [f] = new CashForecastDetector().run(snapshot({ historicalMonths: history }), new Date());
    const m = Object.fromEntries(f!.metrics.map((x) => [x.key, x]));
    expect(m.saldo_cenario_conservador!.display).toBe('-R$ 300,00');
    expect(m.saldo_cenario_conservador!.value).toBe('-300.00');
    expect(m.saldo_cenario_central!.display).toBe('R$ 733,33'); // (200000+50000-30000)/3 = 73333
    expect(m.saldo_cenario_otimista!.display).toBe('R$ 2.000,00');
    expect(f!.confidence).toBe('estimativa');
    expect(f!.severity).toBe('atencao');
  });

  it('não emite com menos de 3 meses fechados consecutivos da entidade', () => {
    const det = new CashForecastDetector();
    expect(det.run(snapshot({ historicalMonths: history.slice(0, 2) }), new Date())).toEqual([]);
    expect(det.run(snapshot({ historicalMonths: [history[0]!, history[1]!, month('2026-07', 1n, 0n)] }), new Date())).toEqual([]);
    expect(det.run(snapshot({ historicalMonths: [] }), new Date())).toEqual([]);
  });

  it('narra como estimativa e passa pelos guards', () => {
    const [f] = new CashForecastDetector().run(snapshot({ historicalMonths: history }), new Date());
    const text = TemplateNarrator.narrate(f!);
    expect(text).toContain('Estimativa');
    expect(text).toContain('R$ 2.000,00');
    expect(NumberGuard.validate(text, f!).valid).toBe(true);
    expect(LengthGuard.validate(text).valid).toBe(true);
  });

  it('virada de ano busca dezembro/novembro/outubro', () => {
    const jan = snapshot({
      period: '2027-01',
      historicalMonths: [month('2026-12', 3n, 1n), month('2026-11', 3n, 1n), month('2026-10', 3n, 1n)],
    });
    expect(new CashForecastDetector().run(jan, new Date())).toHaveLength(1);
  });
});

describe('textos dos detectores em pt-BR', () => {
  it('positive_trend usa só o resultado do snapshot da entidade, formatado', () => {
    const [f] = new PositiveTrendDetector().run(
      snapshot({ historicalMonths: [month('2026-10', 100n, 50n)] }),
      new Date()
    );
    expect(f!.entityId).toBe('pf-1');
    expect(TemplateNarrator.narrate(f!)).toContain('R$ 893,86');
  });

  it('limit_pace usa milhar e percentual com vírgula', () => {
    const [f] = new LimitPaceDetector().run(
      snapshot({
        isMei: true,
        limit: {
          ano: 2026,
          limiteCents: 8100000n,
          faturamentoAnoCents: 6075000n,
          percentualUtilizado: 75,
          restanteCents: 2025000n,
          status: 'atencao',
        },
      }),
      new Date()
    );
    const text = TemplateNarrator.narrate(f!);
    expect(text).toContain('R$ 60.750,00');
    expect(text).toContain('75,0%');
    expect(text).toContain('R$ 81.000,00');
    expect(text).not.toMatch(/\d\.\d%/);
  });

  it('pf_in_pj concorda no singular', () => {
    const [f] = new PfInPjDetector().run(
      snapshot({ isMei: true, pfInPjCount: 1, pfInPjCents: 12000n }),
      new Date()
    );
    expect(f!.metrics[0]!.display).toBe('1 despesa');
  });
});

describe('composeDigestPoints', () => {
  it('sem insights, descreve receitas, despesas e resultado (não "movimentação total")', () => {
    const points = composeDigestPoints({
      attentionTexts: [],
      infoTexts: [],
      transactionCount: 5,
      incomeCents: 350000n,
      expenseCents: 185659n,
      topExpenseCategory: { name: 'Alimentação', cents: 100000n },
    });
    expect(points[0]).toBe(
      'Você registrou 5 transações no período: receitas de R$ 3.500,00, despesas de R$ 1.856,59 e resultado de R$ 1.643,41.'
    );
    expect(points[0]).not.toContain('movimentação total');
    expect(points[1]).toContain('Alimentação');
    expect(points[1]).toContain('53,9%');
    expect(points.length).toBeLessThanOrEqual(3);
  });

  it('prioriza atenção (máx. 2), completa com info e nunca passa de 3', () => {
    const points = composeDigestPoints({
      attentionTexts: ['a1', 'a2', 'a3'],
      infoTexts: ['i1', 'i2'],
      transactionCount: 1,
      incomeCents: 1n,
      expenseCents: 1n,
    });
    expect(points).toEqual(['a1', 'a2', 'i1']);
  });

  it('sem movimento nem insights, avisa', () => {
    expect(
      composeDigestPoints({ attentionTexts: [], infoTexts: [], transactionCount: 0, incomeCents: 0n, expenseCents: 0n })
    ).toEqual(['Nenhuma movimentação relevante identificada para este mês ainda.']);
  });
});

describe('PeriodResolver.phrase', () => {
  it('começa frase com a preposição correta', () => {
    const ref = new Date('2026-11-15T12:00:00Z');
    expect(PeriodResolver.resolve('quanto gastei', ref).phrase).toBe('Neste mês');
    expect(PeriodResolver.resolve('mês passado', ref).phrase).toBe('No mês passado');
    expect(PeriodResolver.resolve('este ano', ref).phrase).toBe('Em 2026');
  });
});

describe('refreshInsightsIfStale', () => {
  const scope = {
    workspaceId: 'ws-throttle',
    actorUserId: 'u',
    role: 'owner',
    defaultEntityIds: { pf: 'e1', pj: 'e2' },
    visibleEntityIds: ['e1', 'e2'],
    ownEntityIds: ['e1', 'e2'],
  } as unknown as WorkspaceScope;

  it('roda por entidade visível, respeita a janela e isola falhas', async () => {
    resetInsightsRefreshCache();
    const calls: string[] = [];
    const run = (async (_s: WorkspaceScope, input: { entityId?: string }) => {
      calls.push(input.entityId!);
      if (input.entityId === 'e1') throw new Error('boom');
      return [];
    }) as never;
    const t0 = new Date('2026-11-22T10:00:00Z');

    expect(await refreshInsightsIfStale(scope, { now: t0, run })).toBe(1);
    expect(calls).toEqual(['e1', 'e2']);

    // e2 dentro da janela: pula; e1 falhou antes: tenta de novo
    calls.length = 0;
    await refreshInsightsIfStale(scope, { now: new Date(t0.getTime() + 60_000), run });
    expect(calls).toEqual(['e1']);

    // fora da janela: roda de novo
    calls.length = 0;
    await refreshInsightsIfStale(scope, { now: new Date(t0.getTime() + 20 * 60_000), run });
    expect(calls).toEqual(['e1', 'e2']);
  });
});
