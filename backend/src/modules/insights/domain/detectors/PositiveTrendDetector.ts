import type { Detector } from './Detector.js';
import type { Finding } from '../Finding.js';
import type { FinancialSnapshot } from '../FinancialSnapshot.js';
import { Money } from '../../../../shared/index.js';

export class PositiveTrendDetector implements Detector {
  readonly id = 'positive_trend';
  readonly version = '1.0';

  run(snapshot: FinancialSnapshot, _today: Date): Finding[] {
    const netCurrent = snapshot.currentMonth.netResultCents;
    if (netCurrent <= 0n) {
      return [];
    }

    // Check if at least 2 consecutive positive months
    const positiveHistorical = snapshot.historicalMonths
      .slice(0, 2)
      .filter((m) => m.netResultCents > 0n);

    if (positiveHistorical.length >= 1 || snapshot.currentMonth.totalIncomeCents > snapshot.currentMonth.totalExpenseCents * 2n) {
      const netMoney = Money.fromCents(netCurrent);

      return [
        {
          detectorId: this.id,
          detectorVersion: this.version,
          entityId: snapshot.entityId,
          period: snapshot.period,
          severity: 'info',
          confidence: 'alta',
          impactAmountCents: netCurrent,
          positive: true,
          metrics: [
            { key: 'saldo_positivo', kind: 'money', value: netMoney.toDecimalString(), display: `R$ ${netMoney.toDecimalString().replace('.', ',')}` },
          ],
          actions: [],
          dedupeKey: `positive_trend:${snapshot.period}`,
        },
      ];
    }

    return [];
  }
}
