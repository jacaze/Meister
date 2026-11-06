import { ValidationError } from '../../../shared/index.js';
import type { Lesson } from './Lesson.js';

export interface QuestionGrading {
  readonly questionId: string;
  readonly question: string;
  readonly chosenIndex: number;
  readonly isCorrect: boolean;
  /** Só vem quando a pessoa acertou a questão ou foi aprovada no quiz. */
  readonly correctIndex?: number;
  readonly explanation?: string;
}

export interface QuizGradingResult {
  readonly totalQuestions: number;
  readonly correctCount: number;
  readonly score: number; // 0 to 100
  readonly passed: boolean;
  readonly breakdown: readonly QuestionGrading[];
}

/**
 * Corrige o quiz sem entregar o gabarito de graça: exige uma resposta válida por questão e só
 * revela resposta certa e explicação das questões acertadas — ou de todas, se for aprovado.
 */
export class QuizGrader {
  static grade(lesson: Lesson, answers: readonly number[]): QuizGradingResult {
    const questions = lesson.quiz;
    if (answers.length !== questions.length) {
      throw new ValidationError(`Responda as ${questions.length} questões do quiz.`);
    }
    questions.forEach((q, i) => {
      const chosen = answers[i]!;
      if (!Number.isInteger(chosen) || chosen < 0 || chosen >= q.options.length) {
        throw new ValidationError(`Resposta inválida na questão ${i + 1}.`);
      }
    });

    if (questions.length === 0) {
      return {
        totalQuestions: 0,
        correctCount: 0,
        score: 100,
        passed: true,
        breakdown: [],
      };
    }

    const results = questions.map((q, i) => ({ q, chosen: answers[i]!, isCorrect: answers[i] === q.correct }));
    const correctCount = results.filter((r) => r.isCorrect).length;
    const score = Math.round((correctCount / questions.length) * 100);
    const passed = score >= 60;

    const breakdown: QuestionGrading[] = results.map(({ q, chosen, isCorrect }) => ({
      questionId: q.id,
      question: q.question,
      chosenIndex: chosen,
      isCorrect,
      ...(passed || isCorrect ? { correctIndex: q.correct, explanation: q.explanation } : {}),
    }));

    return {
      totalQuestions: questions.length,
      correctCount,
      score,
      passed,
      breakdown,
    };
  }
}
