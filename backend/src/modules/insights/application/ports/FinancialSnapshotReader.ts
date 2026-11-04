import type { WorkspaceScope } from '../../../../shared/index.js';
import type { FinancialSnapshot } from '../../domain/FinancialSnapshot.js';

export interface FinancialSnapshotReader {
  readSnapshot(
    scope: WorkspaceScope,
    entityId?: string,
    referenceDate?: Date
  ): Promise<FinancialSnapshot>;
}
