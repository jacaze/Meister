import { z } from 'zod';
import prisma from '../../../../config/prisma.js';
import {
  NotFoundError,
  ValidationError,
  assertCanWrite,
  type WorkspaceScope,
} from '../../../../shared/index.js';

export const mapCategoriesSchema = z.object({
  planId: z.string().min(1, 'ID do plano é obrigatório'),
  jarId: z.string().min(1, 'ID do pote é obrigatório'),
  categoryIds: z.array(z.string()).default([]),
});

export const batchMapCategoriesSchema = z.object({
  planId: z.string().min(1, 'ID do plano é obrigatório'),
  mappings: z.array(
    z.object({
      jarId: z.string().min(1, 'ID do pote é obrigatório'),
      categoryIds: z.array(z.string()).default([]),
    })
  ).min(1, 'Lista de mapeamentos não pode ser vazia'),
});

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

  const parsed = mapCategoriesSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || 'Dados de entrada inválidos');
  }

  const { planId, jarId } = parsed.data;
  // Deduplica IDs de categorias
  const uniqueCategoryIds = [...new Set(parsed.data.categoryIds)];

  const plan = await prisma.jarPlan.findFirst({
    where: { id: planId, workspaceId: scope.workspaceId },
  });
  if (!plan) {
    throw new NotFoundError('Plano de potes não encontrado');
  }

  const jar = await prisma.jar.findFirst({
    where: { id: jarId, planId: plan.id },
  });
  if (!jar) {
    throw new NotFoundError('Pote não encontrado');
  }

  // Validação estrita de posse das categorias no workspace (sobre IDs únicos)
  if (uniqueCategoryIds.length > 0) {
    const validCount = await prisma.category.count({
      where: {
        id: { in: uniqueCategoryIds },
        workspaceId: scope.workspaceId,
      },
    });
    if (validCount !== uniqueCategoryIds.length) {
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
    if (uniqueCategoryIds.length > 0) {
      await tx.jarCategory.deleteMany({
        where: {
          planId: plan.id,
          categoryId: { in: uniqueCategoryIds },
        },
      });

      for (const categoryId of uniqueCategoryIds) {
        await tx.jarCategory.create({
          data: {
            planId: plan.id,
            jarId: jar.id,
            categoryId,
          },
        });
      }
    }

    return { success: true, count: uniqueCategoryIds.length };
  });
}

export async function batchMapCategories(
  scope: WorkspaceScope,
  input: BatchMapCategoriesInput
) {
  assertCanWrite(scope);

  const parsed = batchMapCategoriesSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || 'Dados de entrada inválidos');
  }

  const { planId, mappings } = parsed.data;

  const plan = await prisma.jarPlan.findFirst({
    where: { id: planId, workspaceId: scope.workspaceId },
    include: { jars: true },
  });
  if (!plan) {
    throw new NotFoundError('Plano de potes não encontrado');
  }

  const validJarIds = new Set(plan.jars.map((j) => j.id));

  // Deduplica categorias por pote e valida potes
  const normalizedMappings: { jarId: string; categoryIds: string[] }[] = [];
  const seenCategories = new Set<string>();

  for (const m of mappings) {
    if (!validJarIds.has(m.jarId)) {
      throw new NotFoundError(`Pote ${m.jarId} não pertence ao plano`);
    }

    const uniqueForJar = [...new Set(m.categoryIds)];
    for (const catId of uniqueForJar) {
      if (seenCategories.has(catId)) {
        throw new ValidationError('A mesma categoria não pode ser vinculada a múltiplos potes no mesmo plano');
      }
      seenCategories.add(catId);
    }

    normalizedMappings.push({
      jarId: m.jarId,
      categoryIds: uniqueForJar,
    });
  }

  // Validação estrita de posse de todas as categorias únicas enviadas
  const allUniqueCategoryIds = Array.from(seenCategories);
  if (allUniqueCategoryIds.length > 0) {
    const validCount = await prisma.category.count({
      where: {
        id: { in: allUniqueCategoryIds },
        workspaceId: scope.workspaceId,
      },
    });
    if (validCount !== allUniqueCategoryIds.length) {
      throw new ValidationError('Uma ou mais categorias não pertencem a este workspace');
    }
  }

  return prisma.$transaction(async (tx) => {
    // Limpa todos os vínculos dos potes envolvidos no lote
    const jarIdsInBatch = normalizedMappings.map((m) => m.jarId);
    await tx.jarCategory.deleteMany({
      where: {
        planId: plan.id,
        jarId: { in: jarIdsInBatch },
      },
    });

    // Se alguma das categorias já pertencia a outro pote fora do lote, remove também
    if (allUniqueCategoryIds.length > 0) {
      await tx.jarCategory.deleteMany({
        where: {
          planId: plan.id,
          categoryId: { in: allUniqueCategoryIds },
        },
      });
    }

    // Insere os novos vínculos atômicos
    let totalMapped = 0;
    for (const mapping of normalizedMappings) {
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
