import type { Detector } from './Detector.js';
import type { Finding } from '../Finding.js';
import type { FinancialSnapshot } from '../FinancialSnapshot.js';
import { calculateMedianCents } from '../FinancialSnapshot.js';
import { Money } from '../../../../shared/index.js';

function roundTo50(cents: bigint): bigint {
  const rounded = (cents / 5000n) * 5000n;
  return rounded;
}

export class CashForecastDetector implements Detector {
  readonly id = 'cash_forecast';
  readonly version = '1.0';

  run(snapshot: FinancialSnapshot, _today: Date): Finding[] {
    // Only run toward end of month (day 20+) or on demand
    if (snapshot.dayOfMonth < 20) {
      return [];
    }

    if (snapshot.historicalMonths.length === 0) {
      return [];
    }

    const recent = snapshot.historicalMonths.slice(0, 3);
    const incomes = recent.map((m) => m.totalIncomeCents);
    const expenses = recent.map((m) => m.totalExpenseCents);

    const minIncome = incomes.reduce((min, cur) => (cur < min ? cur : min), incomes[0]!);
    const maxIncome = incomes.reduce((max, cur) => (cur > max ? cur : max), incomes[0]!);
    const medianIncome = calculateMedianCents(incomes);

    const minExpense = expenses.reduce((min, cur) => (cur < min ? cur : min), expenses[0]!);
    const maxExpense = expenses.reduce((max, cur) => (cur > max ? cur : max), expenses[0]!);
    const medianExpense = calculateMedianCents(expenses);

    // Worst scenario = minIncome - maxExpense
    const worstCaseCents = roundTo50(minIncome - maxExpense);
    // Best scenario = maxIncome - minExpense
    const bestCaseCents = roundTo50(maxIncome - minExpense);
    // Central scenario = medianIncome - medianExpense
    const centralCaseCents = roundTo50(medianIncome - medianExpense);

    const severity = worstCaseCents < 0n ? 'atencao' : 'info';

    const worstMoney = Money.fromCents(worstCaseCents);
    const bestMoney = Money.fromCents(bestCaseCents);
    const centralMoney = Money.fromCents(centralCaseCents);

    return [
      {
        detectorId: this.id,
        detectorVersion: this.version,
        entityId: snapshot.entityId,
        period: snapshot.period,
        severity,
        confidence: 'estimativa',
        impactAmountCents: centralCaseCents < 0n ? -centralCaseCents : centralCaseCents,
        metrics: [
          { key: 'saldo_cenario_conservador', kind: 'money', value: worstMoney.toDecimalString(), display: `R$ ${worstMoney.toDecimalString().replace('.', ',')}` },
          { key: 'saldo_cenario_central', kind: 'money', value: centralMoney.toDecimalString(), display: `R$ ${centralMoney.toDecimalString().replace('.', ',')}` },
          { key: 'saldo_cenario_otimista', kind: 'money', value: bestMoney.toDecimalString(), display: `R$ ${bestMoney.toDecimalString().replace('.', ',')}` },
        ],
        actions: [
          { kind: 'open_jar_plan', label: 'Planejar potes do próximo mês' },
        ],
        dedupeKey: `cash_forecast:${snapshot.period}`,
      },
    ];
  }
}
