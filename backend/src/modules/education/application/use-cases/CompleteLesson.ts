import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import { LessonRegistry } from '../../domain/LessonRegistry.js';

export async function completeLesson(scope: WorkspaceScope, slug: string): Promise<{ success: boolean; completedAt: string }> {
  const lesson = LessonRegistry.getBySlug(slug);
  if (!lesson) {
    const error = new Error(`Lição [${slug}] não encontrada.`);
    (error as unknown as { statusCode: number }).statusCode = 404;
    throw error;
  }

  const now = new Date();
  const record = await prisma.lessonProgress.upsert({
    where: {
      userId_lessonSlug: {
        userId: scope.actorUserId,
        lessonSlug: slug,
      },
    },
    update: {
      status: 'concluida',
      completedAt: now,
    },
    create: {
      userId: scope.actorUserId,
      workspaceId: scope.workspaceId,
      lessonSlug: slug,
      lessonVersion: lesson.version,
      status: 'concluida',
      completedAt: now,
    },
  });

  return {
    success: true,
    completedAt: (record.completedAt || now).toISOString(),
  };
}
