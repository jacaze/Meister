import { describe, expect, it } from 'vitest';
import { calculateMedianCents, type FinancialSnapshot } from '../domain/FinancialSnapshot.js';
import { CategorySpikeDetector } from '../domain/detectors/CategorySpikeDetector.js';
import { IncomeDropDetector } from '../domain/detectors/IncomeDropDetector.js';
import { LimitPaceDetector } from '../domain/detectors/LimitPaceDetector.js';
import { PfInPjDetector } from '../domain/detectors/PfInPjDetector.js';
import { JarPaceDetector } from '../domain/detectors/JarPaceDetector.js';
import { CashForecastDetector } from '../domain/detectors/CashForecastDetector.js';
import { TemplateNarrator } from '../domain/TemplateNarrator.js';
import { PolicyGuard, LengthGuard } from '../domain/NarratorGuards.js';
import { PeriodResolver } from '../domain/PeriodResolver.js';

describe('Insights Module — Domain, Detectors & Guards', () => {
  it('calculates median cents correctly for odd and even length series', () => {
    expect(calculateMedianCents([100n, 200n, 300n])).toBe(200n);
    expect(calculateMedianCents([100n, 300n])).toBe(200n);
    expect(calculateMedianCents([])).toBe(0n);
  });

  const baseSnapshot: FinancialSnapshot = {
    workspaceId: 'ws-1',
    entityId: 'ent-1',
    isMei: true,
    period: '2026-11',
    dayOfMonth: 15,
    daysInMonth: 30,
    currentMonth: {
      month: '2026-11',
      totalIncomeCents: 500000n,
      totalExpenseCents: 200000n,
      netResultCents: 300000n,
      categoryExpenses: {
        'cat-alimentacao': 15000n, // R$ 150,00
      },
    },
    historicalMonths: [
      {
        month: '2026-10',
        totalIncomeCents: 600000n,
        totalExpenseCents: 150000n,
        netResultCents: 450000n,
        categoryExpenses: { 'cat-alimentacao': 8000n }, // R$ 80,00
      },
      {
        month: '2026-09',
        totalIncomeCents: 600000n,
        totalExpenseCents: 150000n,
        netResultCents: 450000n,
        categoryExpenses: { 'cat-alimentacao': 9000n }, // R$ 90,00
      },
      {
        month: '2026-08',
        totalIncomeCents: 600000n,
        totalExpenseCents: 150000n,
        netResultCents: 450000n,
        categoryExpenses: { 'cat-alimentacao': 8500n }, // R$ 85,00
      },
    ],
    categories: [
      { id: 'cat-alimentacao', name: 'Alimentação', slug: 'alimentacao', type: 'despesa' },
    ],
    jars: [],
    pfInPjCount: 0,
    pfInPjCents: 0n,
  };

  it('detects category spike when expenses surge >= 30% above median', () => {
    const detector = new CategorySpikeDetector();
    const findings = detector.run(baseSnapshot, new Date());

    expect(findings.length).toBe(1);
    const finding = findings[0]!;
    expect(finding.detectorId).toBe('category_spike');
    expect(finding.severity).toBe('atencao'); // surge is ~76%

    const text = TemplateNarrator.narrate(finding);
    expect(text).toContain('Alimentação');
    expect(text).toContain('R$ 150,00');
    expect(text).toContain('+76%');
  });

  it('detects income drop when projected revenue falls >= 30% below recent median', () => {
    const snapshotWithDrop: FinancialSnapshot = {
      ...baseSnapshot,
      currentMonth: {
        ...baseSnapshot.currentMonth,
        totalIncomeCents: 150000n, // R$ 1.500 at day 15 => projects R$ 3.000 vs median R$ 6.000 (-50%)
      },
    };

    const detector = new IncomeDropDetector();
    const findings = detector.run(snapshotWithDrop, new Date());

    expect(findings.length).toBe(1);
    expect(findings[0]!.severity).toBe('alerta');
    const text = TemplateNarrator.narrate(findings[0]!);
    expect(text).toContain('-50%');
  });

  it('detects limit pace warning when MEI annual usage reaches >= 80%', () => {
    const snapshotWithLimit: FinancialSnapshot = {
      ...baseSnapshot,
      limit: {
        ano: 2026,
        limiteCents: 8100000n, // R$ 81.000,00
        faturamentoAnoCents: 6885000n, // R$ 68.850,00 (85%)
        percentualUtilizado: 85.0,
        restanteCents: 1215000n,
        status: 'atencao',
      },
    };

    const detector = new LimitPaceDetector();
    const findings = detector.run(snapshotWithLimit, new Date());

    expect(findings.length).toBe(1);
    expect(findings[0]!.metrics.find((m) => m.key === 'percentual_utilizado')?.display).toBe('85.0%');
  });

  it('detects PF expenses inside PJ entity', () => {
    const snapshotWithPf: FinancialSnapshot = {
      ...baseSnapshot,
      pfInPjCount: 3,
      pfInPjCents: 18500n, // R$ 185,00
    };

    const detector = new PfInPjDetector();
    const findings = detector.run(snapshotWithPf, new Date());

    expect(findings.length).toBe(1);
    expect(findings[0]!.detectorId).toBe('pf_in_pj');
  });

  it('detects jar pacing breach before end of month', () => {
    const snapshotWithJar: FinancialSnapshot = {
      ...baseSnapshot,
      jars: [
        {
          id: 'jar-1',
          name: 'Operação',
          categoryIds: ['cat-alimentacao'],
          alocadoCents: 100000n, // R$ 1.000,00
          usadoCents: 80000n, // R$ 800,00 (80% at day 15 => pace diff 30 p.p. ahead)
          percentUsado: 80,
          status: 'atencao',
        },
      ],
    };

    const detector = new JarPaceDetector();
    const findings = detector.run(snapshotWithJar, new Date());

    expect(findings.length).toBe(1);
    expect(findings[0]!.detectorId).toBe('jar_pace');
  });

  it('calculates conservative, central and optimistic cash forecast for day 20+', () => {
    const snapshotForecast: FinancialSnapshot = {
      ...baseSnapshot,
      dayOfMonth: 25,
    };

    const detector = new CashForecastDetector();
    const findings = detector.run(snapshotForecast, new Date());

    expect(findings.length).toBe(1);
    const f = findings[0]!;
    expect(f.confidence).toBe('estimativa');
    const text = TemplateNarrator.narrate(f);
    expect(text).toContain('Previsão para o próximo mês');
  });

  it('enforces policy guards against unauthorized financial advice and length limits', () => {
    const invalidText = 'Recomendo que você invista todo o saldo em criptomoeda imediatamente.';
    const policyResult = PolicyGuard.validate(invalidText);
    expect(policyResult.valid).toBe(false);
    expect(policyResult.reason).toContain('não permitida');

    const validText = 'Os gastos com Alimentação somam R$ 150,00 este mês, ficando 30% acima da mediana recente.';
    expect(PolicyGuard.validate(validText).valid).toBe(true);
    expect(LengthGuard.validate(validText).valid).toBe(true);
  });

  it('resolves deterministic natural language PT-BR periods', () => {
    const ref = new Date('2026-11-15T12:00:00Z');
    expect(PeriodResolver.resolve('gastos de hoje', ref).label).toBe('Hoje');
    expect(PeriodResolver.resolve('quanto gastei ontem', ref).label).toBe('Ontem');
    expect(PeriodResolver.resolve('despesas do mês passado', ref).label).toBe('Mês passado');
    expect(PeriodResolver.resolve('faturamento deste ano', ref).label).toBe('Ano de 2026');
  });
});
