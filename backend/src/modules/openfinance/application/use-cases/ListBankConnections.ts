import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';

export interface BankConnectionSummary {
  readonly id: string;
  readonly provider: string;
  readonly institution: string;
  readonly status: string;
  readonly itemId: string | null;
  readonly lastSyncAt: string | null;
  readonly accounts: Array<{
    readonly id: string;
    readonly name: string;
    readonly kind: string;
  }>;
  readonly totalTransactions: number;
  readonly pendingReviewCount: number;
}

export async function listBankConnections(
  scope: WorkspaceScope
): Promise<BankConnectionSummary[]> {
  const connections = await prisma.bankConnection.findMany({
    where: { workspaceId: scope.workspaceId },
    include: {
      accounts: {
        select: {
          id: true,
          name: true,
          kind: true,
        },
      },
      transactions: {
        select: {
          id: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return connections.map((conn) => ({
    id: conn.id,
    provider: conn.provider,
    institution: conn.institution,
    status: conn.status,
    itemId: conn.itemId,
    lastSyncAt: conn.lastSyncAt ? conn.lastSyncAt.toISOString() : null,
    accounts: conn.accounts,
    totalTransactions: conn.transactions.length,
    pendingReviewCount: conn.transactions.filter((t) => t.status === 'nova').length,
  }));
}
