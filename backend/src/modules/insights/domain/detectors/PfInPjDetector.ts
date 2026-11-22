import type { Detector } from './Detector.js';
import type { Finding } from '../Finding.js';
import type { FinancialSnapshot } from '../FinancialSnapshot.js';
import { moneyMetric } from '../metrics.js';

export class PfInPjDetector implements Detector {
  readonly id = 'pf_in_pj';
  readonly version = '1.0';

  run(snapshot: FinancialSnapshot, _today: Date): Finding[] {
    // Only applies to PJ entity
    if (!snapshot.isMei) {
      return [];
    }

    if (snapshot.pfInPjCount >= 2 || snapshot.pfInPjCents >= 10000n) {

      return [
        {
          detectorId: this.id,
          detectorVersion: this.version,
          entityId: snapshot.entityId,
          period: snapshot.period,
          severity: 'atencao',
          confidence: 'alta',
          impactAmountCents: snapshot.pfInPjCents,
          metrics: [
            { key: 'quantidade_lancamentos', kind: 'count', value: snapshot.pfInPjCount, display: snapshot.pfInPjCount === 1 ? '1 despesa' : `${snapshot.pfInPjCount} despesas` },
            moneyMetric('total_pessoal', snapshot.pfInPjCents),
          ],
          actions: [
            { kind: 'review_transactions', label: 'Revisar despesas pessoais na PJ' },
            { kind: 'open_lesson', label: 'Por que separar as contas PF e PJ?', params: { lessonSlug: 'separar-pf-pj' } },
          ],
          dedupeKey: `pf_in_pj:${snapshot.period}`,
        },
      ];
    }

    return [];
  }
}
