import type { Lesson } from './Lesson.js';

export interface QuestionGrading {
  readonly questionId: string;
  readonly question: string;
  readonly chosenIndex: number;
  readonly correctIndex: number;
  readonly isCorrect: boolean;
  readonly explanation: string;
}

export interface QuizGradingResult {
  readonly totalQuestions: number;
  readonly correctCount: number;
  readonly score: number; // 0 to 100
  readonly passed: boolean;
  readonly breakdown: readonly QuestionGrading[];
}

export class QuizGrader {
  static grade(lesson: Lesson, answers: readonly number[]): QuizGradingResult {
    const questions = lesson.quiz;
    if (questions.length === 0) {
      return {
        totalQuestions: 0,
        correctCount: 0,
        score: 100,
        passed: true,
        breakdown: [],
      };
    }

    let correctCount = 0;
    const breakdown: QuestionGrading[] = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q) continue;
      const chosen = answers[i] ?? -1;
      const isCorrect = chosen === q.correct;
      if (isCorrect) correctCount += 1;

      breakdown.push({
        questionId: q.id,
        question: q.question,
        chosenIndex: chosen,
        correctIndex: q.correct,
        isCorrect,
        explanation: q.explanation,
      });
    }

    const score = Math.round((correctCount / questions.length) * 100);
    const passed = score >= 60;

    return {
      totalQuestions: questions.length,
      correctCount,
      score,
      passed,
      breakdown,
    };
  }
}
