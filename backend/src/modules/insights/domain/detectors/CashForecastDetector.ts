import type { Detector } from './Detector.js';
import type { Finding } from '../Finding.js';
import type { FinancialSnapshot, MonthlySummary } from '../FinancialSnapshot.js';
import { moneyMetric } from '../metrics.js';

const MONTHS_REQUIRED = 3;

function previousMonths(period: string, count: number): string[] {
  const [yearStr, monthStr] = period.split('-');
  let year = Number(yearStr);
  let month = Number(monthStr);
  const months: string[] = [];
  for (let i = 0; i < count; i += 1) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return months;
}

/**
 * Estimativa do resultado (receitas - despesas) do próximo mês a partir dos 3 últimos meses
 * fechados, consecutivos, da própria entidade:
 *   - cenário central     = média aritmética dos 3 resultados mensais (divisão inteira em centavos);
 *   - cenário conservador = pior resultado mensal dos 3 meses;
 *   - cenário otimista    = melhor resultado mensal dos 3 meses.
 * Sem os 3 meses fechados com movimentação, não emite nada (não inventa número).
 */
export class CashForecastDetector implements Detector {
  readonly id = 'cash_forecast';
  readonly version = '2.0';

  run(snapshot: FinancialSnapshot, _today: Date): Finding[] {
    if (snapshot.dayOfMonth < 20) {
      return [];
    }

    const byMonth = new Map<string, MonthlySummary>(
      snapshot.historicalMonths.map((m) => [m.month, m])
    );
    const base: MonthlySummary[] = [];
    for (const month of previousMonths(snapshot.period, MONTHS_REQUIRED)) {
      const summary = byMonth.get(month);
      if (!summary) return [];
      base.push(summary);
    }

    const nets = base.map((m) => m.totalIncomeCents - m.totalExpenseCents);
    const worstCents = nets.reduce((min, cur) => (cur < min ? cur : min), nets[0]!);
    const bestCents = nets.reduce((max, cur) => (cur > max ? cur : max), nets[0]!);
    const centralCents = nets.reduce((acc, cur) => acc + cur, 0n) / BigInt(nets.length);

    const severity = worstCents < 0n ? 'atencao' : 'info';

    return [
      {
        detectorId: this.id,
        detectorVersion: this.version,
        entityId: snapshot.entityId,
        period: snapshot.period,
        severity,
        confidence: 'estimativa',
        impactAmountCents: centralCents < 0n ? -centralCents : centralCents,
        metrics: [
          moneyMetric('saldo_cenario_conservador', worstCents),
          moneyMetric('saldo_cenario_central', centralCents),
          moneyMetric('saldo_cenario_otimista', bestCents),
        ],
        actions: [{ kind: 'open_jar_plan', label: 'Planejar potes do próximo mês' }],
        dedupeKey: `cash_forecast:${snapshot.period}`,
      },
    ];
  }
}
