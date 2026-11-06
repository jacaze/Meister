import prisma from '../../../../config/prisma.js';
import {
  NotFoundError,
  ValidationError,
  assertCanWrite,
  type WorkspaceScope,
} from '../../../../shared/index.js';

export interface MapCategoriesInput {
  readonly planId: string;
  readonly jarId: string;
  readonly categoryIds: readonly string[];
}

export interface BatchMapCategoriesInput {
  readonly planId: string;
  readonly mappings: readonly {
    readonly jarId: string;
    readonly categoryIds: readonly string[];
  }[];
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

  // Validação estrita de posse das categorias no workspace
  if (input.categoryIds.length > 0) {
    const validCount = await prisma.category.count({
      where: {
        id: { in: [...input.categoryIds] },
        workspaceId: scope.workspaceId,
      },
    });
    if (validCount !== input.categoryIds.length) {
      throw new ValidationError('Uma ou mais categorias não pertencem a este workspace');
    }
  }

  return prisma.$transaction(async (tx) => {
    // 1. Remove todos os vínculos atuais deste pote específico
    await tx.jarCategory.deleteMany({
      where: {
        planId: plan.id,
        jarId: jar.id,
      },
    });

    // 2. Se houver categorias a vincular, remove de outros potes do mesmo plano e insere
    if (input.categoryIds.length > 0) {
      await tx.jarCategory.deleteMany({
        where: {
          planId: plan.id,
          categoryId: { in: [...input.categoryIds] },
        },
      });

      for (const categoryId of input.categoryIds) {
        await tx.jarCategory.create({
          data: {
            planId: plan.id,
            jarId: jar.id,
            categoryId,
          },
        });
      }
    }

    return { success: true, count: input.categoryIds.length };
  });
}

export async function batchMapCategories(
  scope: WorkspaceScope,
  input: BatchMapCategoriesInput
) {
  assertCanWrite(scope);

  const plan = await prisma.jarPlan.findFirst({
    where: { id: input.planId, workspaceId: scope.workspaceId },
    include: { jars: true },
  });
  if (!plan) {
    throw new NotFoundError('Plano de potes não encontrado');
  }

  const validJarIds = new Set(plan.jars.map((j) => j.id));
  const allCategoryIds = input.mappings.flatMap((m) => m.categoryIds);

  for (const m of input.mappings) {
    if (!validJarIds.has(m.jarId)) {
      throw new NotFoundError(`Pote ${m.jarId} não pertence ao plano`);
    }
  }

  // Validação estrita de posse de todas as categorias
  if (allCategoryIds.length > 0) {
    const uniqueCatIds = [...new Set(allCategoryIds)];
    const validCount = await prisma.category.count({
      where: {
        id: { in: uniqueCatIds },
        workspaceId: scope.workspaceId,
      },
    });
    if (validCount !== uniqueCatIds.length) {
      throw new ValidationError('Uma ou mais categorias não pertencem a este workspace');
    }
  }

  return prisma.$transaction(async (tx) => {
    // Limpa todos os vínculos dos potes envolvidos no lote
    const jarIdsInBatch = input.mappings.map((m) => m.jarId);
    await tx.jarCategory.deleteMany({
      where: {
        planId: plan.id,
        jarId: { in: jarIdsInBatch },
      },
    });

    // Insere os novos vínculos atômicos
    let totalMapped = 0;
    for (const mapping of input.mappings) {
      for (const categoryId of mapping.categoryIds) {
        await tx.jarCategory.create({
          data: {
            planId: plan.id,
            jarId: mapping.jarId,
            categoryId,
          },
        });
        totalMapped++;
      }
    }

    return { success: true, count: totalMapped };
  });
}
