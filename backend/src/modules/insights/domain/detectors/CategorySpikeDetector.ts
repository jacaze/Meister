import type { Detector } from './Detector.js';
import type { Finding } from '../Finding.js';
import type { FinancialSnapshot } from '../FinancialSnapshot.js';
import { calculateMedianCents } from '../FinancialSnapshot.js';
import { Money } from '../../../../shared/index.js';

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
        const currentMoney = Money.fromCents(currentCents);
        const medianMoney = Money.fromCents(medianCents);
        const diffMoney = Money.fromCents(diffCents);

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
            { key: 'gasto_atual', kind: 'money', value: currentMoney.toDecimalString(), display: `R$ ${currentMoney.toDecimalString().replace('.', ',')}` },
            { key: 'mediana_anterior', kind: 'money', value: medianMoney.toDecimalString(), display: `R$ ${medianMoney.toDecimalString().replace('.', ',')}` },
            { key: 'percentual_aumento', kind: 'percent', value: increasePercent, display: `+${increasePercent}%` },
            { key: 'diferenca', kind: 'money', value: diffMoney.toDecimalString(), display: `R$ ${diffMoney.toDecimalString().replace('.', ',')}` },
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
