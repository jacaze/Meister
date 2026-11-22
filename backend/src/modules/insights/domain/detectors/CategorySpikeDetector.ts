import type { Detector } from './Detector.js';
import type { Finding } from '../Finding.js';
import type { FinancialSnapshot } from '../FinancialSnapshot.js';
import { calculateMedianCents } from '../FinancialSnapshot.js';
import { moneyMetric } from '../metrics.js';

export class CategorySpikeDetector implements Detector {
  readonly id = 'category_spike';
  readonly version = '1.0';

  run(snapshot: FinancialSnapshot, _today: Date): Finding[] {
    // Only run from day 7 onward
    if (snapshot.dayOfMonth < 7) {
      return [];
    }

    // Requires at least 1 closed history month (ideally 3)
    if (snapshot.historicalMonths.length === 0) {
      return [];
    }

    const findings: Finding[] = [];
    const recentHistory = snapshot.historicalMonths.slice(0, 3);

    for (const cat of snapshot.categories) {
      if (cat.type !== 'despesa') continue;
      if (cat.slug === 'sem-categoria') continue;

      const currentCents = snapshot.currentMonth.categoryExpenses[cat.id] ?? 0n;
      if (currentCents === 0n) continue;

      const pastValues = recentHistory.map((m) => m.categoryExpenses[cat.id] ?? 0n);
      const medianCents = calculateMedianCents(pastValues);

      // Baseline minimum: R$ 30,00 (3000 cents)
      if (medianCents < 3000n) continue;

      // Difference minimum: R$ 50,00 (5000 cents)
      const diffCents = currentCents - medianCents;
      if (diffCents < 5000n) continue;

      const ratio = Number(currentCents) / Number(medianCents);
      const increasePercent = Math.round((ratio - 1) * 100);

      // Threshold: >= +30%
      if (increasePercent >= 30) {
        const severity = increasePercent >= 50 ? 'atencao' : 'info';

        findings.push({
          detectorId: this.id,
          detectorVersion: this.version,
          entityId: snapshot.entityId,
          period: snapshot.period,
          severity,
          confidence: 'alta',
          impactAmountCents: diffCents,
          metrics: [
            { key: 'categoria', kind: 'enum', value: cat.name, display: cat.name },
            moneyMetric('gasto_atual', currentCents),
            moneyMetric('mediana_anterior', medianCents),
            { key: 'percentual_aumento', kind: 'percent', value: increasePercent, display: `+${increasePercent}%` },
            moneyMetric('diferenca', diffCents),
          ],
          actions: [
            { kind: 'review_transactions', label: 'Ver lançamentos desta categoria', params: { categoryId: cat.id } },
          ],
          evidence: { categoryId: cat.id },
          dedupeKey: `spike:${snapshot.period}:${cat.id}`,
        });
      }
    }

    return findings;
  }
}
