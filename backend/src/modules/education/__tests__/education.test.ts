import { describe, expect, it } from 'vitest';
import {
  LessonRegistry,
  QuizGrader,
  EducationPolicyGuard,
  type Lesson,
} from '../public.js';

describe('Financial Education Module Unit Tests', () => {
  it('validates all curated lessons and loads only reviewed lessons', () => {
    const lessons = LessonRegistry.listAll();
    expect(lessons.length).toBeGreaterThanOrEqual(8);

    for (const lesson of lessons) {
      expect(lesson.slug).toBeTruthy();
      expect(lesson.title).toBeTruthy();
      expect(lesson.version).toBeGreaterThanOrEqual(1);
      expect(lesson.status).toBe('revisada');
      expect(lesson.reviewedBy).toBeTruthy();
      expect(lesson.reviewedAt).toBeTruthy();
      expect(lesson.estimatedMinutes).toBeGreaterThan(0);
      expect(lesson.quiz.length).toBeGreaterThanOrEqual(1);

      for (const q of lesson.quiz) {
        expect(q.question).toBeTruthy();
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.correct).toBeGreaterThanOrEqual(0);
        expect(q.correct).toBeLessThan(q.options.length);
        expect(q.explanation).toBeTruthy();
      }
    }
  });

  it('renders dynamic fiscal placeholders without hardcoded literal numbers in raw markdown', () => {
    const lesson = LessonRegistry.getBySlug('limite-mei-80');
    expect(lesson).not.toBeNull();
    expect(lesson!.content).toContain('R$ 81.000,00');
    expect(lesson!.content).toContain('R$ 64.800,00');
    expect(lesson!.content).toContain('R$ 97.200,00');
    expect(lesson!.content).not.toContain('{{limite_mei}}');
  });

  it('grades quizzes accurately and provides complete feedback with explanations', () => {
    const sampleLesson: Lesson = {
      slug: 'test-lesson',
      title: 'Teste',
      version: 1,
      status: 'revisada',
      reviewedBy: 'Contador',
      reviewedAt: '2026-11-01',
      estimatedMinutes: 2,
      triggers: [],
      summary: 'Resumo',
      content: 'Conteudo',
      quiz: [
        {
          id: 'q1',
          question: 'Pergunta 1',
          options: ['A', 'B', 'C'],
          correct: 1, // 'B'
          explanation: 'B é a correta porque sim',
        },
        {
          id: 'q2',
          question: 'Pergunta 2',
          options: ['X', 'Y'],
          correct: 0, // 'X'
          explanation: 'X é a correta',
        },
      ],
    };

    // 1. All correct -> 100%
    const perfectResult = QuizGrader.grade(sampleLesson, [1, 0]);
    expect(perfectResult.totalQuestions).toBe(2);
    expect(perfectResult.correctCount).toBe(2);
    expect(perfectResult.score).toBe(100);
    expect(perfectResult.passed).toBe(true);
    expect(perfectResult.breakdown[0]!.isCorrect).toBe(true);

    // 2. Partial correct -> 50% (< 60% is not passed)
    const halfResult = QuizGrader.grade(sampleLesson, [1, 1]);
    expect(halfResult.correctCount).toBe(1);
    expect(halfResult.score).toBe(50);
    expect(halfResult.passed).toBe(false);
    expect(halfResult.breakdown[1]!.isCorrect).toBe(false);
    // Reprovado: a questão errada não revela resposta certa nem explicação; a acertada sim.
    expect(halfResult.breakdown[1]!.explanation).toBeUndefined();
    expect(halfResult.breakdown[1]!.correctIndex).toBeUndefined();
    expect(halfResult.breakdown[0]!.explanation).toBe('B é a correta porque sim');

    // Aprovado: gabarito completo.
    expect(perfectResult.breakdown[1]!.explanation).toBe('X é a correta');
    expect(perfectResult.breakdown[1]!.correctIndex).toBe(0);

    // Respostas faltando ou fora das opções são recusadas (antes [] devolvia o gabarito inteiro).
    expect(() => QuizGrader.grade(sampleLesson, [])).toThrow(/Responda as 2 questões/);
    expect(() => QuizGrader.grade(sampleLesson, [1])).toThrow();
    expect(() => QuizGrader.grade(sampleLesson, [1, 5])).toThrow(/questão 2/);
  });

  it('enforces RN-44 policy guard rejecting speculative investment questions', () => {
    const cryptoQuestion = 'Devo investir o caixa da minha empresa em Bitcoin ou ações da Petrobras?';
    const response = EducationPolicyGuard.answerQuestion(cryptoQuestion);

    expect(response.isDisclaimer).toBe(true);
    expect(response.answer).toContain('não realiza recomendações de investimento');
  });

  it('answers legitimate questions using excerpts from reviewed lessons citing the source', () => {
    const dasQuestion = 'Como funciona o pagamento do DAS e quando ele vence?';
    const response = EducationPolicyGuard.answerQuestion(dasQuestion);

    expect(response.isDisclaimer).toBe(false);
    expect(response.citedLessonSlug).toBe('o-que-e-das');
    expect(response.citedLessonTitle).toContain('DAS MEI');
    expect(response.answer).toContain('dia 20');
  });

  it('returns fallback disclaimer when question has no matching lesson content', () => {
    const unrelatedQuestion = 'Qual é a velocidade média da nave Voyager 1 no espaço interestelar?';
    const response = EducationPolicyGuard.answerQuestion(unrelatedQuestion);

    expect(response.isDisclaimer).toBe(true);
    expect(response.answer).toContain('Não encontrei informações sobre este tema');
    expect(response.answer).toContain('recomendamos consultar um contador');
  });
});
