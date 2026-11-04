import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import { LessonRegistry } from '../../domain/LessonRegistry.js';
import type { Lesson } from '../../domain/Lesson.js';
import type { LessonProgressDto } from './ListLessons.js';

export interface GetLessonResult {
  readonly lesson: Lesson;
  readonly progress: LessonProgressDto;
}

export async function getLesson(scope: WorkspaceScope, slug: string): Promise<GetLessonResult> {
  const lesson = LessonRegistry.getBySlug(slug);
  if (!lesson) {
    const error = new Error(`Lição [${slug}] não encontrada.`);
    (error as unknown as { statusCode: number }).statusCode = 404;
    throw error;
  }

  // Get or initialize user progress
  let progressRecord = await prisma.lessonProgress.findUnique({
    where: {
      userId_lessonSlug: {
        userId: scope.actorUserId,
        lessonSlug: slug,
      },
    },
  });

  if (!progressRecord) {
    progressRecord = await prisma.lessonProgress.create({
      data: {
        userId: scope.actorUserId,
        workspaceId: scope.workspaceId,
        lessonSlug: slug,
        lessonVersion: lesson.version,
        status: 'iniciada',
      },
    });
  }

  const progress: LessonProgressDto = {
    status: progressRecord.status as 'iniciada' | 'concluida',
    quizScore: progressRecord.quizScore,
    quizAttempts: progressRecord.quizAttempts,
    completedAt: progressRecord.completedAt ? progressRecord.completedAt.toISOString() : null,
  };

  return {
    lesson,
    progress,
  };
}
