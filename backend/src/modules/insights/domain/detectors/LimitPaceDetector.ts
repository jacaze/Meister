import type { Detector } from './Detector.js';
import type { Finding } from '../Finding.js';
import type { FinancialSnapshot } from '../FinancialSnapshot.js';
import { moneyMetric, percentMetric } from '../metrics.js';

export class LimitPaceDetector implements Detector {
  readonly id = 'limit_pace';
  readonly version = '1.0';

  run(snapshot: FinancialSnapshot, _today: Date): Finding[] {
    if (!snapshot.isMei || !snapshot.limit) {
      return [];
    }

    const limit = snapshot.limit;
    const percent = limit.percentualUtilizado;

    // Trigger only if percent is significant (>= 75%)
    if (percent < 75) {
      return [];
    }

    const severity = percent >= 100 ? 'alerta' : percent >= 90 ? 'atencao' : 'info';

    return [
      {
        detectorId: this.id,
        detectorVersion: this.version,
        entityId: snapshot.entityId,
        period: String(limit.ano),
        severity,
        confidence: 'alta',
        impactAmountCents: limit.faturamentoAnoCents,
        metrics: [
          percentMetric('percentual_utilizado', percent),
          moneyMetric('faturamento_acumulado', limit.faturamentoAnoCents),
          moneyMetric('teto_anual', limit.limiteCents),
          moneyMetric('disponivel_restante', limit.restanteCents),
        ],
        actions: [
          { kind: 'open_limit', label: 'Consultar Termômetro MEI' },
          { kind: 'open_lesson', label: 'O que fazer ao atingir 80% do MEI?', params: { lessonSlug: 'limite-mei-80' } },
        ],
        dedupeKey: `limit_pace:${limit.ano}:${severity}`,
      },
    ];
  }
}
