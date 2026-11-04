export interface MonthlySummary {
  readonly month: string; // 'YYYY-MM'
  readonly totalIncomeCents: bigint;
  readonly totalExpenseCents: bigint;
  readonly netResultCents: bigint;
  readonly categoryExpenses: Record<string, bigint>; // categoryId or slug -> cents
}

export interface JarSnapshot {
  readonly id: string;
  readonly name: string;
  readonly categoryIds: readonly string[];
  readonly alocadoCents: bigint;
  readonly usadoCents: bigint;
  readonly percentUsado: number;
  readonly status: 'ok' | 'atencao' | 'estourado';
}

export interface LimitSnapshot {
  readonly ano: number;
  readonly limiteCents: bigint;
  readonly faturamentoAnoCents: bigint;
  readonly percentualUtilizado: number;
  readonly restanteCents: bigint;
  readonly status: string;
}

export interface CategorySnapshot {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly type: string;
}

export interface FinancialSnapshot {
  readonly workspaceId: string;
  readonly entityId?: string;
  readonly isMei: boolean;
  readonly period: string; // 'YYYY-MM'
  readonly dayOfMonth: number;
  readonly daysInMonth: number;
  readonly currentMonth: MonthlySummary;
  readonly historicalMonths: readonly MonthlySummary[]; // up to 12 closed months descending (most recent first)
  readonly categories: readonly CategorySnapshot[];
  readonly jars: readonly JarSnapshot[];
  readonly limit?: LimitSnapshot;
  readonly pfInPjCount: number;
  readonly pfInPjCents: bigint;
}

export function calculateMedianCents(values: readonly bigint[]): bigint {
  if (values.length === 0) return 0n;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid]!;
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2n;
}
