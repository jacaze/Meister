import { Money, formatBRL, formatPercent } from '../../../shared/index.js';
import type { Metric } from './Finding.js';

/** Métrica monetária: `value` em decimal exato (pode ser negativo), `display` em pt-BR ("R$ 1.234,56"). */
export function moneyMetric(key: string, cents: bigint): Metric {
  return { key, kind: 'money', value: Money.formatCents(cents), display: formatBRL(cents) };
}

/** Métrica percentual com vírgula decimal ("75,0%"). */
export function percentMetric(key: string, value: number, fractionDigits = 1): Metric {
  return { key, kind: 'percent', value, display: formatPercent(value, fractionDigits) };
}
