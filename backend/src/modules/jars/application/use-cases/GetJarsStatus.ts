import prisma from '../../../../config/prisma.js';
import {
  LocalDate,
  Money,
  YearMonth,
  type WorkspaceScope,
} from '../../../../shared/index.js';
import { JarAllocator, type JarBand } from '../../domain/services/JarAllocator.js';
import { createJarPlan } from './CreateJarPlan.js';

export interface GetJarsStatusQuery {
  readonly entityId?: string;
  readonly month?: string; // YYYY-MM
}

export interface JarStatusItemDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly percent?: number | null;
  readonly fixedAmount?: string | null;
  readonly alocado: string;
  readonly carregado: string;
  readonly totalDisponivelParaGasto: string;
  readonly usado: string;
  readonly disponivel: string;
  readonly percentUsado: number;
  readonly status: JarBand;
  readonly categoryIds: readonly string[];
}

export interface JarsStatusResponseDto {
  readonly planId: string;
  readonly planName: string;
  readonly entityId: string;
  readonly month: string;
  readonly baseMode: string;
  readonly templateSlug: string;
  readonly base: string;
  readonly baseInsuficiente: boolean;
  readonly jars: readonly JarStatusItemDto[];
  readonly semPoteUsado: string;
}

export async function getJarsStatus(
  scope: WorkspaceScope,
  query: GetJarsStatusQuery = {}
): Promise<JarsStatusResponseDto> {
  const entityId = query.entityId ?? scope.defaultEntityIds.pf;
  const currentYm = query.month
    ? YearMonth.fromIsoString(query.month)
    : YearMonth.fromDate(LocalDate.now());
  const monthStr = currentYm.toIsoString();

  let plan = await prisma.jarPlan.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      entityId,
      active: true,
    },
    include: {
      jars: {
        orderBy: { sort: 'asc' },
      },
      categories: true,
    },
  });

  if (!plan) {
    const entity = await prisma.entity.findFirst({
      where: { id: entityId, workspaceId: scope.workspaceId },
    });
    const templateSlug = entity?.kind === 'pj' ? 'mei-empresa' : 'seis-potes';
    await createJarPlan(scope, { entityId, templateSlug });

    plan = await prisma.jarPlan.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        entityId,
        active: true,
      },
      include: {
        jars: {
          orderBy: { sort: 'asc' },
        },
        categories: true,
      },
    });
  }

  if (!plan) {
    throw new Error('Falha ao inicializar plano de potes');
  }

  // 1. Base de cálculo conforme o baseMode do plano
  const startOfMonth = new Date(`${currentYm.startDate.toIsoDate()}T00:00:00.000Z`);
  const endOfMonth = new Date(`${currentYm.endDate.toIsoDate()}T23:59:59.999Z`);
  const base = await computeJarBase(scope.workspaceId, entityId, currentYm, plan.baseMode);

  // 2. Map categories to Jars
  const categoryToJarMap = new Map<string, string>();
  for (const jc of plan.categories) {
    categoryToJarMap.set(jc.categoryId, jc.jarId);
  }

  // 3. Find expenses in period and aggregate by jar
  const expenseTxs = await prisma.transaction.findMany({
    where: {
      workspaceId: scope.workspaceId,
      entityId,
      type: 'despesa',
      status: 'confirmado',
      deletedAt: null,
      transactionDate: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
    },
    include: {
      splits: true,
    },
  });

  const usedMap = new Map<string, Money>();
  let semPoteUsado = Money.zero();

  for (const tx of expenseTxs) {
    if (tx.splits && tx.splits.length > 0) {
      for (const split of tx.splits) {
        const splitAmount = Money.fromDecimalString(split.amount.toString());
        const jarId = categoryToJarMap.get(split.categoryId);
        if (jarId) {
          const current = usedMap.get(jarId) ?? Money.zero();
          usedMap.set(jarId, current.add(splitAmount));
        } else {
          semPoteUsado = semPoteUsado.add(splitAmount);
        }
      }
    } else {
      const txAmount = Money.fromDecimalString(tx.amount.toString());
      const jarId = tx.categoryId ? categoryToJarMap.get(tx.categoryId) : undefined;
      if (jarId) {
        const current = usedMap.get(jarId) ?? Money.zero();
        usedMap.set(jarId, current.add(txAmount));
      } else {
        semPoteUsado = semPoteUsado.add(txAmount);
      }
    }
  }

  // 4. Carried in from previous snapshot (if rollover enabled)
  const carriedMap = new Map<string, Money>();
  const prevMonthStr = currentYm.addMonths(-1).toIsoString();
  const prevSnapshots = await prisma.jarPeriodSnapshot.findMany({
    where: {
      planId: plan.id,
      period: prevMonthStr,
    },
  });
  for (const snap of prevSnapshots) {
    const jar = plan.jars.find((j) => j.id === snap.jarId);
    if (jar && jar.rollover) {
      carriedMap.set(snap.jarId, Money.fromDecimalString(snap.carriedOver.toString()));
    }
  }

  const jarDefinitions = plan.jars.map((j) => ({
    id: j.id,
    slug: j.slug,
    name: j.name,
    percent: j.percent ? Number(j.percent) : null,
    fixedAmount: j.fixedAmount ? Money.fromDecimalString(j.fixedAmount.toString()) : null,
    rollover: j.rollover,
    categoryIds: plan!.categories.filter((c) => c.jarId === j.id).map((c) => c.categoryId),
  }));

  const result = JarAllocator.allocate(
    {
      base,
      jars: jarDefinitions,
      carriedIn: carriedMap,
      used: usedMap,
    },
    semPoteUsado
  );

  const jarsDto: JarStatusItemDto[] = result.items.map((it) => {
    const origJar = plan!.jars.find((j) => j.id === it.id);
    return {
      id: it.id,
      slug: it.slug,
      name: it.name,
      percent: origJar?.percent ? Number(origJar.percent) : null,
      fixedAmount: origJar?.fixedAmount ? Money.fromDecimalString(origJar.fixedAmount.toString()).toDecimalString() : null,
      alocado: it.alocado.toDecimalString(),
      carregado: it.carregado.toDecimalString(),
      totalDisponivelParaGasto: it.totalDisponivelParaGasto.toDecimalString(),
      usado: it.usado.toDecimalString(),
      disponivel: it.disponivel.toDecimalString(),
      percentUsado: it.percentUsado,
      status: it.status,
      categoryIds: it.categoryIds,
    };
  });

  return {
    planId: plan.id,
    planName: plan.name,
    entityId,
    month: monthStr,
    baseMode: plan.baseMode,
    templateSlug: plan.template,
    base: result.base.toDecimalString(),
    baseInsuficiente: result.baseInsuficiente,
    jars: jarsDto,
    semPoteUsado: semPoteUsado.toDecimalString(),
  };
}

/** Receita confirmada de um mês, sem contar transferências entre contas próprias. */
async function monthRevenue(workspaceId: string, entityId: string, ym: YearMonth): Promise<Money> {
  const rows = await prisma.transaction.findMany({
    where: {
      workspaceId,
      entityId,
      type: 'receita',
      status: 'confirmado',
      deletedAt: null,
      // transfer_type é nulo nas receitas comuns: NOT sozinho descartaria essas linhas no SQL.
      OR: [{ transferType: null }, { transferType: { not: 'transfer' } }],
      transactionDate: {
        gte: new Date(`${ym.startDate.toIsoDate()}T00:00:00.000Z`),
        lte: new Date(`${ym.endDate.toIsoDate()}T23:59:59.999Z`),
      },
    },
    select: { amount: true },
  });
  return Money.sum(rows.map((tx) => Money.fromDecimalString(tx.amount.toString())));
}

/**
 * mes_atual: receita do mês consultado; mes_anterior: do mês anterior;
 * media_3_meses: média dos 3 meses anteriores ao consultado.
 */
export async function computeJarBase(
  workspaceId: string,
  entityId: string,
  month: YearMonth,
  baseMode: string
): Promise<Money> {
  if (baseMode === 'mes_anterior') {
    return monthRevenue(workspaceId, entityId, month.addMonths(-1));
  }
  if (baseMode === 'media_3_meses') {
    const months = await Promise.all(
      [1, 2, 3].map((delta) => monthRevenue(workspaceId, entityId, month.addMonths(-delta)))
    );
    return Money.sum(months).mulRatio(1, 3);
  }
  return monthRevenue(workspaceId, entityId, month);
}
