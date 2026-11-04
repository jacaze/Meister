import type { Finding } from '../Finding.js';
import type { FinancialSnapshot } from '../FinancialSnapshot.js';

export interface Detector {
  readonly id: string;
  readonly version: string;
  run(snapshot: FinancialSnapshot, today: Date): Finding[];
}
