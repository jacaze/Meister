import type { TransactionType } from '@prisma/client';
import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import { FALLBACK_CATEGORY_SLUG } from '../../domain/default-categories.js';

/**
 * Id da categoria padrão "Outras Despesas"/"Outras Receitas" do workspace, achada pelo slug
 * estável. Devolve null (e não outra categoria qualquer) quando ela não existe ou está arquivada.
 */
export async function findFallbackCategoryId(
  scope: WorkspaceScope,
  type: TransactionType
): Promise<string | null> {
  const category = await prisma.category.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      type,
      slug: FALLBACK_CATEGORY_SLUG[type],
      archivedAt: null,
    },
    select: { id: true },
  });
  return category?.id ?? null;
}
