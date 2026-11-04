import prisma from '../../../../config/prisma.js';
import { NotFoundError, type WorkspaceScope } from '../../../../shared/index.js';

export async function dismissInsight(
  scope: WorkspaceScope,
  insightId: string
) {
  const insight = await prisma.insight.findFirst({
    where: { id: insightId, workspaceId: scope.workspaceId },
  });

  if (!insight) {
    throw new NotFoundError('Insight não encontrado.');
  }

  return prisma.insight.update({
    where: { id: insight.id },
    data: { status: 'dispensada' },
  });
}

export async function submitFeedback(
  scope: WorkspaceScope,
  input: {
    readonly insightId: string;
    readonly value: 'util' | 'inutil';
    readonly reason?: string;
  }
) {
  const insight = await prisma.insight.findFirst({
    where: { id: input.insightId, workspaceId: scope.workspaceId },
  });

  if (!insight) {
    throw new NotFoundError('Insight não encontrado.');
  }

  const feedback = await prisma.insightFeedback.create({
    data: {
      insightId: insight.id,
      userId: scope.actorUserId,
      value: input.value,
      reason: input.reason,
    },
  });

  // Adaptation rule: if >= 3 'inutil' for the same detector within 30 days, snooze detector for 60 days
  if (input.value === 'inutil') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const negativeCount = await prisma.insightFeedback.count({
      where: {
        userId: scope.actorUserId,
        value: 'inutil',
        createdAt: { gte: thirtyDaysAgo },
        insight: { detectorId: insight.detectorId },
      },
    });

    if (negativeCount >= 3) {
      const snoozeUntil = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      await prisma.insightPreference.upsert({
        where: {
          userId_detectorId: {
            userId: scope.actorUserId,
            detectorId: insight.detectorId,
          },
        },
        create: {
          userId: scope.actorUserId,
          detectorId: insight.detectorId,
          snoozedUntil: snoozeUntil,
        },
        update: {
          snoozedUntil: snoozeUntil,
        },
      });
    }
  }

  return feedback;
}
