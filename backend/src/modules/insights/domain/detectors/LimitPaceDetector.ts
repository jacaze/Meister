import type { Detector } from './Detector.js';
import type { Finding } from '../Finding.js';
import type { FinancialSnapshot } from '../FinancialSnapshot.js';
import { Money } from '../../../../shared/index.js';

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
    const faturamentoMoney = Money.fromCents(limit.faturamentoAnoCents);
    const limiteMoney = Money.fromCents(limit.limiteCents);
    const restanteMoney = Money.fromCents(limit.restanteCents);

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
          { key: 'percentual_utilizado', kind: 'percent', value: percent, display: `${percent.toFixed(1)}%` },
          { key: 'faturamento_acumulado', kind: 'money', value: faturamentoMoney.toDecimalString(), display: `R$ ${faturamentoMoney.toDecimalString().replace('.', ',')}` },
          { key: 'teto_anual', kind: 'money', value: limiteMoney.toDecimalString(), display: `R$ ${limiteMoney.toDecimalString().replace('.', ',')}` },
          { key: 'disponivel_restante', kind: 'money', value: restanteMoney.toDecimalString(), display: `R$ ${restanteMoney.toDecimalString().replace('.', ',')}` },
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
