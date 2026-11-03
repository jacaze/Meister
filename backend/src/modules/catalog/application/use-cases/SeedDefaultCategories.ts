import prisma from '../../../../config/prisma.js';
import { DEFAULT_CATEGORIES } from '../../domain/default-categories.js';

export interface SeedDefaultCategoriesInput {
  readonly workspaceId: string;
  readonly userId?: string;
  readonly isMei?: boolean;
}

export async function seedDefaultCategories(
  input: SeedDefaultCategoriesInput,
  client = prisma
) {
  const categoriesToSeed = DEFAULT_CATEGORIES.filter((cat) => {
    if (!input.isMei && cat.entityKind === 'pj') {
      return false;
    }
    return true;
  });

  const createdCategories = [];

  for (const cat of categoriesToSeed) {
    const existing = await client.category.findUnique({
      where: {
        workspaceId_type_slug: {
          workspaceId: input.workspaceId,
          type: cat.type,
          slug: cat.slug,
        },
      },
    });

    if (!existing) {
      const created = await client.category.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          slug: cat.slug,
          name: cat.name,
          type: cat.type,
          isDefault: true,
        },
      });
      createdCategories.push(created);
    } else {
      createdCategories.push(existing);
    }
  }

  return createdCategories;
}
