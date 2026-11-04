import prisma from '../../../config/prisma.js';
import type { WorkspaceScope } from '../../../shared/index.js';
import { Money } from '../../../shared/index.js';
import type { FinancialSnapshotReader } from '../application/ports/FinancialSnapshotReader.js';
import type {
  FinancialSnapshot,
  MonthlySummary,
  JarSnapshot,
  LimitSnapshot,
  CategorySnapshot,
} from '../domain/FinancialSnapshot.js';
import { getMeiLimit } from '../../fiscal/public.js';
import { getJarsStatus } from '../../jars/public.js';

export class PrismaFinancialSnapshotReader implements FinancialSnapshotReader {
  async readSnapshot(
    scope: WorkspaceScope,
    entityId?: string,
    referenceDate: Date = new Date()
  ): Promise<FinancialSnapshot> {
    const targetEntityId = entityId ?? scope.defaultEntityIds.pj ?? scope.defaultEntityIds.pf;

    // 1. Entity details
    const entity = targetEntityId
      ? await prisma.entity.findUnique({ where: { id: targetEntityId } })
      : null;
    const isMei = entity?.isMei ?? Boolean(scope.defaultEntityIds.pj);

    // 2. Categories
    const categoriesRaw = await prisma.category.findMany({
      where: { workspaceId: scope.workspaceId },
    });
    const categories: CategorySnapshot[] = categoriesRaw.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      type: c.type,
    }));

    // 3. Jars status
    let jars: JarSnapshot[] = [];
    try {
      const jarsRes = await getJarsStatus(scope, { entityId: targetEntityId });
      jars = jarsRes.jars.map((j) => ({
        id: j.id,
        name: j.name,
        categoryIds: j.categoryIds,
        alocadoCents: Money.fromDecimalString(j.alocado).cents,
        usadoCents: Money.fromDecimalString(j.usado).cents,
        percentUsado: j.percentUsado,
        status: j.status,
      }));
    } catch {
      // Jars not configured
    }

    // 4. MEI Limit status
    let limit: LimitSnapshot | undefined;
    if (isMei && targetEntityId) {
      try {
        const meiRes = await getMeiLimit(scope, { entityId: targetEntityId });
        if (meiRes) {
          limit = {
            ano: meiRes.ano,
            limiteCents: Money.fromDecimalString(meiRes.limite).cents,
            faturamentoAnoCents: Money.fromDecimalString(meiRes.faturamentoAno).cents,
            percentualUtilizado: meiRes.percentualUtilizado,
            restanteCents: Money.fromDecimalString(meiRes.restante).cents,
            status: meiRes.status,
          };
        }
      } catch {
        // Limit calculation optional
      }
    }

    // 5. Historical & Current Month Transactions (last 6 months)
    const refYear = referenceDate.getFullYear();
    const refMonth = referenceDate.getMonth(); // 0..11
    const period = `${refYear}-${String(refMonth + 1).padStart(2, '0')}`;
    const dayOfMonth = referenceDate.getDate();
    const daysInMonth = new Date(refYear, refMonth + 1, 0).getDate();

    // Start of 6 months ago
    const sixMonthsAgo = new Date(refYear, refMonth - 5, 1);
    const endOfMonth = new Date(refYear, refMonth + 1, 0, 23, 59, 59);

    const txs = await prisma.transaction.findMany({
      where: {
        workspaceId: scope.workspaceId,
        entityId: targetEntityId ?? undefined,
        transactionDate: {
          gte: sixMonthsAgo,
          lte: endOfMonth,
        },
        type: { in: ['receita', 'despesa'] },
      },
      include: {
        splits: true,
        category: true,
      },
    });

    // Bucketing transactions by month
    const monthBuckets = new Map<string, {
      incomeCents: bigint;
      expenseCents: bigint;
      catExpenses: Map<string, bigint>;
    }>();

    let pfInPjCount = 0;
    let pfInPjCents = 0n;

    for (const tx of txs) {
      const txMonth = tx.transactionDate.toISOString().slice(0, 7); // 'YYYY-MM'
      if (!monthBuckets.has(txMonth)) {
        monthBuckets.set(txMonth, {
          incomeCents: 0n,
          expenseCents: 0n,
          catExpenses: new Map(),
        });
      }
      const bucket = monthBuckets.get(txMonth)!;
      const amountMoney = Money.fromDecimalString(String(tx.amount));

      if (tx.type === 'receita') {
        bucket.incomeCents += amountMoney.cents;
      } else if (tx.type === 'despesa') {
        bucket.expenseCents += amountMoney.cents;

        // If splits, attribute by split category
        if (tx.splits && tx.splits.length > 0) {
          for (const sp of tx.splits) {
            const spMoney = Money.fromDecimalString(String(sp.amount));
            const prev = bucket.catExpenses.get(sp.categoryId) ?? 0n;
            bucket.catExpenses.set(sp.categoryId, prev + spMoney.cents);
          }
        } else if (tx.categoryId) {
          const prev = bucket.catExpenses.get(tx.categoryId) ?? 0n;
          bucket.catExpenses.set(tx.categoryId, prev + amountMoney.cents);
        }

        // Check PF in PJ
        if (isMei && txMonth === period) {
          const catSlug = tx.category?.slug ?? '';
          if (
            tx.viaPersonalAccount ||
            ['lazer', 'saude', 'vestuario', 'educacao-pessoal'].includes(catSlug)
          ) {
            pfInPjCount += 1;
            pfInPjCents += amountMoney.cents;
          }
        }
      }
    }

    // Current month summary
    const currentData = monthBuckets.get(period) ?? {
      incomeCents: 0n,
      expenseCents: 0n,
      catExpenses: new Map(),
    };
    const currentCatExpenses: Record<string, bigint> = {};
    for (const [k, v] of currentData.catExpenses.entries()) {
      currentCatExpenses[k] = v;
    }

    const currentMonth: MonthlySummary = {
      month: period,
      totalIncomeCents: currentData.incomeCents,
      totalExpenseCents: currentData.expenseCents,
      netResultCents: currentData.incomeCents - currentData.expenseCents,
      categoryExpenses: currentCatExpenses,
    };

    // Historical closed months (strictly before current month, descending)
    const historicalMonths: MonthlySummary[] = [];
    for (let i = 1; i <= 5; i++) {
      const pastD = new Date(refYear, refMonth - i, 1);
      const mStr = `${pastD.getFullYear()}-${String(pastD.getMonth() + 1).padStart(2, '0')}`;
      const data = monthBuckets.get(mStr);
      if (data) {
        const catMap: Record<string, bigint> = {};
        for (const [k, v] of data.catExpenses.entries()) {
          catMap[k] = v;
        }
        historicalMonths.push({
          month: mStr,
          totalIncomeCents: data.incomeCents,
          totalExpenseCents: data.expenseCents,
          netResultCents: data.incomeCents - data.expenseCents,
          categoryExpenses: catMap,
        });
      }
    }

    return {
      workspaceId: scope.workspaceId,
      entityId: targetEntityId,
      isMei,
      period,
      dayOfMonth,
      daysInMonth,
      currentMonth,
      historicalMonths,
      categories,
      jars,
      limit,
      pfInPjCount,
      pfInPjCents,
    };
  }
}
