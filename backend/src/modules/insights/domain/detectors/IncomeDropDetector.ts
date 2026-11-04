import type { Detector } from './Detector.js';
import type { Finding } from '../Finding.js';
import type { FinancialSnapshot } from '../FinancialSnapshot.js';
import { calculateMedianCents } from '../FinancialSnapshot.js';
import { Money } from '../../../../shared/index.js';

export class IncomeDropDetector implements Detector {
  readonly id = 'income_drop';
  readonly version = '1.0';

  run(snapshot: FinancialSnapshot, _today: Date): Finding[] {
    // Only evaluate from day 10 onward
    if (snapshot.dayOfMonth < 10) {
      return [];
    }

    if (snapshot.historicalMonths.length === 0) {
      return [];
    }

    const pastIncomes = snapshot.historicalMonths.slice(0, 3).map((m) => m.totalIncomeCents);
    const medianIncomeCents = calculateMedianCents(pastIncomes);

    // Baseline minimum of R$ 500,00 (50000 cents)
    if (medianIncomeCents < 50000n) {
      return [];
    }

    // Projected revenue for full month based on current day
    const currentIncomeCents = snapshot.currentMonth.totalIncomeCents;
    const projectedIncomeCents =
      (currentIncomeCents * BigInt(snapshot.daysInMonth)) / BigInt(snapshot.dayOfMonth);

    if (projectedIncomeCents >= medianIncomeCents) {
      return [];
    }

    const dropCents = medianIncomeCents - projectedIncomeCents;
    // Difference minimum: R$ 300,00 (30000 cents)
    if (dropCents < 30000n) {
      return [];
    }

    const ratio = Number(projectedIncomeCents) / Number(medianIncomeCents);
    const dropPercent = Math.round((1 - ratio) * 100);

    if (dropPercent >= 30) {
      const severity = dropPercent >= 50 ? 'alerta' : 'atencao';
      const currentMoney = Money.fromCents(currentIncomeCents);
      const projectedMoney = Money.fromCents(projectedIncomeCents);
      const medianMoney = Money.fromCents(medianIncomeCents);

      return [
        {
          detectorId: this.id,
          detectorVersion: this.version,
          entityId: snapshot.entityId,
          period: snapshot.period,
          severity,
          confidence: 'alta',
          impactAmountCents: dropCents,
          metrics: [
            { key: 'receita_atual', kind: 'money', value: currentMoney.toDecimalString(), display: `R$ ${currentMoney.toDecimalString().replace('.', ',')}` },
            { key: 'receita_projetada', kind: 'money', value: projectedMoney.toDecimalString(), display: `R$ ${projectedMoney.toDecimalString().replace('.', ',')}` },
            { key: 'mediana_anterior', kind: 'money', value: medianMoney.toDecimalString(), display: `R$ ${medianMoney.toDecimalString().replace('.', ',')}` },
            { key: 'percentual_queda', kind: 'percent', value: dropPercent, display: `-${dropPercent}%` },
          ],
          actions: [
            { kind: 'review_transactions', label: 'Ver receitas do mês' },
            { kind: 'open_lesson', label: 'Dicas sobre Fluxo de Caixa', params: { lessonSlug: 'fluxo-de-caixa' } },
          ],
          dedupeKey: `income_drop:${snapshot.period}`,
        },
      ];
    }

    return [];
  }
}
