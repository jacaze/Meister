import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import { LessonRegistry } from '../../domain/LessonRegistry.js';
import type { Lesson } from '../../domain/Lesson.js';
import type { PublicQuizQuestion } from './GetLesson.js';

export interface LessonProgressDto {
  readonly status: 'nao_iniciada' | 'iniciada' | 'concluida';
  readonly quizScore: number | null;
  readonly quizAttempts: number;
  readonly completedAt: string | null;
}

export interface LessonListItemDto extends Omit<Lesson, 'content' | 'quiz'> {
  readonly quiz?: readonly PublicQuizQuestion[];
  readonly progress: LessonProgressDto;
}

export interface ListLessonsResult {
  readonly lessons: readonly LessonListItemDto[];
  readonly totalLessons: number;
  readonly completedCount: number;
  readonly progressPercentage: number;
  readonly averageQuizScore: number | null;
}

export async function listLessons(scope: WorkspaceScope): Promise<ListLessonsResult> {
  const allLessons = LessonRegistry.listAll();

  const userProgressList = await prisma.lessonProgress.findMany({
    where: {
      userId: scope.actorUserId,
    },
  });

  const progressMap = new Map<string, typeof userProgressList[0]>();
  for (const p of userProgressList) {
    progressMap.set(p.lessonSlug, p);
  }

  let completedCount = 0;
  let totalScoreSum = 0;
  let scoredCount = 0;

  const lessons: LessonListItemDto[] = allLessons.map((l) => {
    const prog = progressMap.get(l.slug);
    const status = (prog?.status as 'iniciada' | 'concluida') || 'nao_iniciada';
    const quizScore = prog?.quizScore ?? null;
    const quizAttempts = prog?.quizAttempts ?? 0;
    const completedAt = prog?.completedAt ? prog.completedAt.toISOString() : null;

    if (status === 'concluida') {
      completedCount += 1;
    }
    if (quizScore !== null) {
      totalScoreSum += quizScore;
      scoredCount += 1;
    }

    // Return without full markdown content to keep list lightweight and sanitize quiz
    const { content: _content, quiz, ...rest } = l;
    const publicQuiz: readonly PublicQuizQuestion[] = (quiz || []).map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
    }));

    return {
      ...rest,
      quiz: publicQuiz,
      progress: {
        status,
        quizScore,
        quizAttempts,
        completedAt,
      },
    };
  });

  const totalLessons = allLessons.length;
  const progressPercentage = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const averageQuizScore = scoredCount > 0 ? Math.round(totalScoreSum / scoredCount) : null;

  return {
    lessons,
    totalLessons,
    completedCount,
    progressPercentage,
    averageQuizScore,
  };
}
