export type InsightSeverity = 'info' | 'atencao' | 'alerta';
export type InsightConfidence = 'alta' | 'estimativa';

export type MetricKind = 'money' | 'percent' | 'count' | 'days' | 'date' | 'enum';

export interface Metric {
  readonly key: string;
  readonly kind: MetricKind;
  readonly value: string | number;
  readonly display: string; // Formatted by the server (e.g. "R$ 1.250,00", "42%", "15 dias")
}

export type ActionKind =
  | 'open_jar_plan'
  | 'open_jar_mapping'
  | 'open_lesson'
  | 'review_transactions'
  | 'open_das'
  | 'open_limit'
  | 'complete_profile'
  | 'open_review_inbox';

export interface InsightAction {
  readonly kind: ActionKind;
  readonly label: string;
  readonly params?: Record<string, string | number>;
}

export interface EvidenceRef {
  readonly categoryId?: string;
  readonly transactionIds?: readonly string[];
  readonly periodStart?: string;
  readonly periodEnd?: string;
}

export interface Finding {
  readonly detectorId: string;
  readonly detectorVersion: string;
  readonly entityId?: string;
  readonly period: string;
  readonly severity: InsightSeverity;
  readonly confidence: InsightConfidence;
  readonly metrics: readonly Metric[];
  readonly impactAmountCents: bigint;
  readonly actions: readonly InsightAction[];
  readonly evidence?: EvidenceRef;
  readonly dedupeKey: string;
  readonly positive?: boolean;
}
