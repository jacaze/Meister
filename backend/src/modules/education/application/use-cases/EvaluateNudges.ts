import prisma from '../../../../config/prisma.js';
import { NotFoundError, type WorkspaceScope } from '../../../../shared/index.js';
import { LessonRegistry } from '../../domain/LessonRegistry.js';

export interface EducationalNudge {
  readonly id: string;
  readonly trigger: string;
  readonly lessonSlug: string;
  readonly lessonTitle: string;
  readonly message: string;
  readonly ctaText: string;
  readonly dedupeKey: string;
}

export async function evaluateNudges(scope: WorkspaceScope): Promise<readonly EducationalNudge[]> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const period = `${currentYear}-${currentMonth}`;

  // 1. Check rate limits: <= 1 nudge per day, <= 3 per week
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const nudgesLast24h = await prisma.nudgeLog.count({
    where: {
      userId: scope.actorUserId,
      sentAt: { gte: oneDayAgo },
    },
  });

  if (nudgesLast24h >= 1) {
    return [];
  }

  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const nudgesLastWeek = await prisma.nudgeLog.count({
    where: {
      userId: scope.actorUserId,
      sentAt: { gte: oneWeekAgo },
    },
  });

  if (nudgesLastWeek >= 3) {
    return [];
  }

  // 2. Fetch existing dedupe keys
  const pastNudges = await prisma.nudgeLog.findMany({
    where: { userId: scope.actorUserId },
    select: { dedupeKey: true },
  });
  const sentDedupeKeys = new Set(pastNudges.map((n) => n.dedupeKey));

  // 3. Evaluate candidate triggers
  const candidates: Array<{
    trigger: string;
    lessonSlug: string;
    message: string;
    dedupePeriod: string;
  }> = [];

  // A. Check Fiscal Limit (PJ revenue)
  const pjEntity = await prisma.entity.findFirst({
    where: { workspaceId: scope.workspaceId, kind: 'pj', active: true },
  });

  if (pjEntity) {
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

    const yearIncomeAgg = await prisma.transaction.aggregate({
      where: {
        workspaceId: scope.workspaceId,
        entityId: pjEntity.id,
        type: 'receita',
        transactionDate: { gte: startOfYear, lte: endOfYear },
      },
      _sum: { amount: true },
    });

    const totalIncome = Number(yearIncomeAgg._sum.amount ?? 0);
    const attentionThreshold = 64800; // 80% de R$ 81.000,00

    if (totalIncome >= attentionThreshold) {
      candidates.push({
        trigger: 'limit_band_atencao',
        lessonSlug: 'limite-mei-80',
        message: 'Você atingiu 80% do limite anual do MEI. Veja o que acontece se ultrapassar e como se preparar.',
        dedupePeriod: String(currentYear),
      });
    }
  }

  // B. Check Personal expenses in PJ
  const personalInPj = await prisma.transaction.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      entity: { kind: 'pj' },
      category: { slug: { in: ['moradia', 'lazer', 'saude', 'supermercado'] } },
    },
  });

  if (personalInPj) {
    candidates.push({
      trigger: 'pf_expense_in_pj',
      lessonSlug: 'separar-pf-pj',
      message: 'Identificamos gastos pessoais lançados na empresa. Entenda os riscos fiscais e a regra de ouro.',
      dedupePeriod: period,
    });
  }

  // C. Check DAS status
  const pendingDas = await prisma.dasCharge.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      status: 'pendente',
    },
  });

  if (pendingDas) {
    candidates.push({
      trigger: 'first_das',
      lessonSlug: 'o-que-e-das',
      message: 'Você tem guia do DAS pendente. Entenda os direitos garantidos e como pagar sem multas.',
      dedupePeriod: period,
    });
  }

  // D. Check Jars Plan
  const hasJarPlan = await prisma.jarPlan.findFirst({
    where: { workspaceId: scope.workspaceId, active: true },
  });

  if (hasJarPlan) {
    candidates.push({
      trigger: 'jar_plan_created',
      lessonSlug: 'metodo-dos-potes',
      message: 'Organize suas contas com o Método dos Potes: aprenda a dar destino a cada centavo faturado.',
      dedupePeriod: String(currentYear),
    });
  }

  // E. Fallback on onboarding: General separating accounts
  candidates.push({
    trigger: 'onboarding',
    lessonSlug: 'separar-pf-pj',
    message: 'Boas-vindas ao MEIster! Comece dominando a separação das contas PF e PJ.',
    dedupePeriod: 'once',
  });

  // 4. Select first unsent candidate
  for (const c of candidates) {
    const dedupeKey = `${scope.actorUserId}:${c.trigger}:${c.dedupePeriod}`;
    if (!sentDedupeKeys.has(dedupeKey)) {
      const lesson = LessonRegistry.getBySlug(c.lessonSlug);
      if (lesson) {
        // Record nudge log
        const record = await prisma.nudgeLog.create({
          data: {
            userId: scope.actorUserId,
            workspaceId: scope.workspaceId,
            trigger: c.trigger,
            lessonSlug: c.lessonSlug,
            channel: 'web',
            dedupeKey,
          },
        });

        return [
          {
            id: record.id,
            trigger: c.trigger,
            lessonSlug: c.lessonSlug,
            lessonTitle: lesson.title,
            message: c.message,
            ctaText: 'Ver Micro-Lição (2 min)',
            dedupeKey,
          },
        ];
      }
    }
  }

  return [];
}

export async function recordNudgeFeedback(
  nudgeId: string,
  feedback: 'util' | 'inutil'
): Promise<void> {
  const existing = await prisma.nudgeLog.findUnique({
    where: { id: nudgeId },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundError('Nudge educacional não encontrado.');
  }
  await prisma.nudgeLog.update({
    where: { id: nudgeId },
    data: { feedback },
  });
}
