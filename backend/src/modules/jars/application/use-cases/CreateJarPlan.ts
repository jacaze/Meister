import prisma from '../../../../config/prisma.js';
import {
  NotFoundError,
  ValidationError,
  assertCanWrite,
  type WorkspaceScope,
} from '../../../../shared/index.js';
import { JAR_TEMPLATES, type JarTemplate } from '../../domain/templates.js';

export interface CreateJarPlanInput {
  readonly entityId?: string;
  readonly name?: string;
  readonly templateSlug?: string;
  readonly baseMode?: 'mes_atual' | 'mes_anterior' | 'media_3_meses';
  readonly customJars?: Array<{
    readonly slug: string;
    readonly name: string;
    readonly percent?: number;
    readonly fixedAmount?: string;
    readonly rollover?: boolean;
    readonly goalAmount?: string;
    readonly goalDate?: string;
  }>;
}

export async function createJarPlan(
  scope: WorkspaceScope,
  input: CreateJarPlanInput
) {
  assertCanWrite(scope);

  const entityId = input.entityId ?? scope.defaultEntityIds.pf;
  const entity = await prisma.entity.findFirst({
    where: { id: entityId, workspaceId: scope.workspaceId, active: true },
  });

  if (!entity) {
    throw new NotFoundError('Entidade não encontrada');
  }

  // Deactivate any existing active plan for this entity
  await prisma.jarPlan.updateMany({
    where: { entityId, workspaceId: scope.workspaceId, active: true },
    data: { active: false },
  });

  let template: JarTemplate | undefined;
  if (input.templateSlug) {
    template = JAR_TEMPLATES.find((t) => t.slug === input.templateSlug);
    if (!template) {
      throw new ValidationError(`Template de potes inválido: ${input.templateSlug}`);
    }
  }

  const jarsToCreate = template
    ? template.jars.map((j, idx) => ({
        slug: j.slug,
        name: j.name,
        percent: j.percent ?? null,
        fixedAmount: j.fixedAmount ? Number(j.fixedAmount) : null,
        rollover: j.rollover,
        sort: idx,
        defaultCategorySlugs: j.defaultCategorySlugs ?? [],
      }))
    : (input.customJars ?? []).map((j, idx) => ({
        slug: j.slug,
        name: j.name,
        percent: j.percent ?? null,
        fixedAmount: j.fixedAmount ? Number(j.fixedAmount) : null,
        rollover: Boolean(j.rollover),
        sort: idx,
        defaultCategorySlugs: [] as readonly string[],
      }));

  // Validate percent jars sum to 100%
  const percentJars = jarsToCreate.filter((j) => j.percent !== null && j.percent !== undefined);
  if (percentJars.length > 0) {
    const sumPercent = percentJars.reduce((acc, j) => acc + (j.percent ?? 0), 0);
    if (Math.abs(sumPercent - 100.0) > 0.01) {
      throw new ValidationError(`A soma dos percentuais dos potes deve ser exatamente 100% (atual: ${sumPercent.toFixed(2)}%)`);
    }
  }

  const planName = input.name?.trim() || (template ? template.name : 'Plano de Potes');

  const createdPlan = await prisma.jarPlan.create({
    data: {
      workspaceId: scope.workspaceId,
      entityId,
      name: planName,
      template: template?.slug ?? 'personalizado',
      baseMode: input.baseMode ?? 'mes_atual',
      active: true,
      jars: {
        create: jarsToCreate.map((j) => ({
          slug: j.slug,
          name: j.name,
          percent: j.percent,
          fixedAmount: j.fixedAmount,
          rollover: j.rollover,
          sort: j.sort,
        })),
      },
    },
    include: {
      jars: true,
    },
  });

  // Map default categories to jars if template specified
  if (template) {
    const categories = await prisma.category.findMany({
      where: { workspaceId: scope.workspaceId },
    });

    const categoryMap = new Map(categories.map((c) => [c.slug, c.id]));

    for (const jarDef of jarsToCreate) {
      const jarEntity = createdPlan.jars.find((j) => j.slug === jarDef.slug);
      if (!jarEntity) continue;

      for (const catSlug of jarDef.defaultCategorySlugs) {
        const catId = categoryMap.get(catSlug);
        if (catId) {
          await prisma.jarCategory.upsert({
            where: {
              planId_categoryId: {
                planId: createdPlan.id,
                categoryId: catId,
              },
            },
            create: {
              planId: createdPlan.id,
              jarId: jarEntity.id,
              categoryId: catId,
            },
            update: {
              jarId: jarEntity.id,
            },
          });
        }
      }
    }
  }

  return createdPlan;
}
