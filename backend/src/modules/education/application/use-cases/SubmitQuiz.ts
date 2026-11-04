import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import { LessonRegistry } from '../../domain/LessonRegistry.js';
import { QuizGrader, type QuizGradingResult } from '../../domain/QuizGrader.js';

export interface SubmitQuizResult {
  readonly grading: QuizGradingResult;
  readonly progress: {
    readonly status: 'iniciada' | 'concluida';
    readonly highestScore: number;
    readonly attempts: number;
    readonly completedAt: string | null;
  };
}

export async function submitQuiz(
  scope: WorkspaceScope,
  slug: string,
  answers: readonly number[]
): Promise<SubmitQuizResult> {
  const lesson = LessonRegistry.getBySlug(slug);
  if (!lesson) {
    const error = new Error(`Lição [${slug}] não encontrada.`);
    (error as unknown as { statusCode: number }).statusCode = 404;
    throw error;
  }

  const grading = QuizGrader.grade(lesson, answers);

  const existing = await prisma.lessonProgress.findUnique({
    where: {
      userId_lessonSlug: {
        userId: scope.actorUserId,
        lessonSlug: slug,
      },
    },
  });

  const previousScore = existing?.quizScore ?? 0;
  const highestScore = Math.max(previousScore, grading.score);
  const attempts = (existing?.quizAttempts ?? 0) + 1;
  const isCompleted = grading.passed || existing?.status === 'concluida';
  const completedAt = isCompleted ? (existing?.completedAt ?? new Date()) : null;

  const updated = await prisma.lessonProgress.upsert({
    where: {
      userId_lessonSlug: {
        userId: scope.actorUserId,
        lessonSlug: slug,
      },
    },
    update: {
      quizScore: highestScore,
      quizAttempts: attempts,
      status: isCompleted ? 'concluida' : 'iniciada',
      completedAt: completedAt ?? undefined,
    },
    create: {
      userId: scope.actorUserId,
      workspaceId: scope.workspaceId,
      lessonSlug: slug,
      lessonVersion: lesson.version,
      quizScore: highestScore,
      quizAttempts: attempts,
      status: isCompleted ? 'concluida' : 'iniciada',
      completedAt: completedAt ?? undefined,
    },
  });

  return {
    grading,
    progress: {
      status: updated.status as 'iniciada' | 'concluida',
      highestScore: updated.quizScore ?? grading.score,
      attempts: updated.quizAttempts,
      completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
    },
  };
}
