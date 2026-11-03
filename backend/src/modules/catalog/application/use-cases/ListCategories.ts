import type { TransactionType } from '@prisma/client';
import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';

export interface ListCategoriesFilter {
  readonly type?: TransactionType;
  readonly includeArchived?: boolean;
}

export async function listCategories(
  scope: WorkspaceScope,
  filter: ListCategoriesFilter = {}
) {
  return prisma.category.findMany({
    where: {
      workspaceId: scope.workspaceId,
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { name: 'asc' },
  });
}
