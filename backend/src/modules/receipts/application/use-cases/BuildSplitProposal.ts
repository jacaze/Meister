import { Money, type WorkspaceScope } from '../../../../shared/index.js';
import prisma from '../../../../config/prisma.js';
import type { FiscalReceiptItem } from '../../domain/ReceiptItem.js';
import { suggestCategoryFromKeywords } from '../../domain/ReceiptItem.js';
import { getJarsStatus } from '../../../jars/public.js';

export interface ProposedSplitItem {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly categorySlug: string;
  readonly amount: string;
  readonly description: string;
  readonly items: readonly string[];
  readonly jarName?: string;
  readonly jarStatus?: 'ok' | 'atencao' | 'estourado';
}

export interface SplitProposalResult {
  readonly isSplit: boolean;
  readonly total: string;
  readonly dominantCategoryId: string;
  readonly dominantCategoryName: string;
  readonly splits: readonly ProposedSplitItem[];
}

export async function buildSplitProposal(
  scope: WorkspaceScope,
  input: {
    readonly items: readonly FiscalReceiptItem[];
    readonly total: string;
    readonly discount?: string;
    readonly entityId?: string;
  }
): Promise<SplitProposalResult> {
  const totalMoney = Money.fromDecimalString(input.total);

  // Fetch expense categories of workspace
  const categories = await prisma.category.findMany({
    where: { workspaceId: scope.workspaceId, type: 'despesa' },
  });

  const defaultCategory =
    categories.find((c) => c.slug === 'mercadoria-insumos') ||
    categories.find((c) => c.slug === 'outras-despesas') ||
    categories[0];

  // Fetch current jars status to calculate jar impacts
  const jarsStatus = await getJarsStatus(scope, {
    entityId: input.entityId ?? scope.defaultEntityIds.pj ?? scope.defaultEntityIds.pf,
  }).catch(() => null);

  if (input.items.length === 0) {
    return {
      isSplit: false,
      total: totalMoney.toDecimalString(),
      dominantCategoryId: defaultCategory?.id || '',
      dominantCategoryName: defaultCategory?.name || 'Geral',
      splits: [],
    };
  }

  // 1. Group items by resolved category
  interface CategoryBucket {
    categoryId: string;
    categoryName: string;
    categorySlug: string;
    items: string[];
    centsSum: bigint;
  }

  const buckets = new Map<string, CategoryBucket>();

  for (const item of input.items) {
    let resolvedSlug = item.categorySlug;
    if (!resolvedSlug) {
      resolvedSlug = suggestCategoryFromKeywords(item.description) || defaultCategory?.slug || 'outras-despesas';
    }

    const matchedCat =
      categories.find((c) => c.slug === resolvedSlug) ||
      defaultCategory;

    const catId = matchedCat?.id || 'default';
    const catName = matchedCat?.name || 'Geral';
    const catSlug = matchedCat?.slug || 'outras-despesas';

    const itemMoney = Money.fromDecimalString(item.total);

    if (!buckets.has(catId)) {
      buckets.set(catId, {
        categoryId: catId,
        categoryName: catName,
        categorySlug: catSlug,
        items: [item.description],
        centsSum: itemMoney.cents,
      });
    } else {
      const bucket = buckets.get(catId)!;
      bucket.items.push(item.description);
      bucket.centsSum += itemMoney.cents;
    }
  }

  const bucketList = Array.from(buckets.values());

  // 2. Adjust for discounts or rounding differences using Largest Remainder Method
  const totalBucketCents = bucketList.reduce((acc, b) => acc + b.centsSum, 0n);
  const targetCents = totalMoney.cents;

  let allocatedAmounts: Money[] = [];

  if (totalBucketCents === targetCents || totalBucketCents === 0n) {
    allocatedAmounts = bucketList.map((b) => Money.fromCents(b.centsSum));
  } else {
    // Proportional allocation of target total among buckets
    const ratios = bucketList.map((b) => Number(b.centsSum) / Number(totalBucketCents));
    allocatedAmounts = totalMoney.allocate(ratios);
  }

  // 3. Map to ProposedSplitItem with Jars impact
  const proposedSplits: ProposedSplitItem[] = bucketList.map((bucket, idx) => {
    const allocated = allocatedAmounts[idx] ?? Money.fromCents(bucket.centsSum);

    // Find jar mapped to this category
    const jar = jarsStatus?.jars.find((j) => j.categoryIds.includes(bucket.categoryId));

    return {
      categoryId: bucket.categoryId,
      categoryName: bucket.categoryName,
      categorySlug: bucket.categorySlug,
      amount: allocated.toDecimalString(),
      description: bucket.items.slice(0, 3).join(', ') + (bucket.items.length > 3 ? '...' : ''),
      items: bucket.items,
      jarName: jar?.name,
      jarStatus: jar?.status,
    };
  });

  // Sort splits by amount descending
  proposedSplits.sort((a, b) => Number(b.amount) - Number(a.amount));

  const isSplit = proposedSplits.length >= 2;
  const dominant = proposedSplits[0];

  return {
    isSplit,
    total: totalMoney.toDecimalString(),
    dominantCategoryId: dominant?.categoryId || defaultCategory?.id || '',
    dominantCategoryName: dominant?.categoryName || defaultCategory?.name || 'Geral',
    splits: proposedSplits,
  };
}
