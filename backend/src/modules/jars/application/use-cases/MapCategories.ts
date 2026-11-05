import prisma from '../../../../config/prisma.js';
import {
  NotFoundError,
  assertCanWrite,
  type WorkspaceScope,
} from '../../../../shared/index.js';

export interface MapCategoriesInput {
  readonly planId: string;
  readonly jarId: string;
  readonly categoryIds: readonly string[];
}

export async function mapCategories(
  scope: WorkspaceScope,
  input: MapCategoriesInput
) {
  assertCanWrite(scope);

  const plan = await prisma.jarPlan.findFirst({
    where: { id: input.planId, workspaceId: scope.workspaceId },
  });
  if (!plan) {
    throw new NotFoundError('Plano de potes não encontrado');
  }

  const jar = await prisma.jar.findFirst({
    where: { id: input.jarId, planId: plan.id },
  });
  if (!jar) {
    throw new NotFoundError('Pote não encontrado');
  }

  // 1. Remove todos os vínculos atuais deste pote específico (para que categorias removidas sejam desvinculadas)
  await prisma.jarCategory.deleteMany({
    where: {
      planId: plan.id,
      jarId: jar.id,
    },
  });

  // 2. Se houver categorias a vincular, garante que saiam de outros potes e insere no pote de destino
  if (input.categoryIds.length > 0) {
    await prisma.jarCategory.deleteMany({
      where: {
        planId: plan.id,
        categoryId: { in: [...input.categoryIds] },
      },
    });

    for (const categoryId of input.categoryIds) {
      await prisma.jarCategory.create({
        data: {
          planId: plan.id,
          jarId: jar.id,
          categoryId,
        },
      });
    }
  }

  return { success: true, count: input.categoryIds.length };
}
