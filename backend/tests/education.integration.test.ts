import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

describe('Financial Education Integration Suite (PostgreSQL 16)', () => {
  let app: FastifyInstance;
  let token: string;
  let email: string;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    email = `edu_user_${Date.now()}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: {
        name: 'Carlos MEI Consultoria',
        email,
        password: 'Password123!',
        accountType: 'mei',
      },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email, password: 'Password123!' },
    });
    token = loginRes.json().token as string;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('lists curated lessons, starts a lesson, submits quiz with feedback and marks completed', async () => {
    // 1. List lessons
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/education/lessons',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(listRes.statusCode).toBe(200);
    const listData = listRes.json();
    expect(listData.totalLessons).toBeGreaterThanOrEqual(8);
    expect(listData.completedCount).toBe(0);
    expect(listData.progressPercentage).toBe(0);

    // Verify quiz questions in list do not leak correct answer or explanation
    const lessonsWithQuiz = listData.lessons.filter(
      (l: { quiz?: unknown[] }) => Array.isArray(l.quiz) && l.quiz.length > 0
    );
    expect(lessonsWithQuiz.length).toBeGreaterThan(0);

    for (const lesson of lessonsWithQuiz) {
      for (const q of lesson.quiz) {
        expect(q).not.toHaveProperty('correct');
        expect(q).not.toHaveProperty('explanation');
      }
    }

    // 2. Get specific lesson (should transition to 'iniciada')
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/education/lessons/separar-pf-pj',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(getRes.statusCode).toBe(200);
    const getData = getRes.json();
    expect(getData.lesson.slug).toBe('separar-pf-pj');
    expect(getData.progress.status).toBe('iniciada');

    // Verify quiz questions in getLesson do not leak correct answer or explanation
    expect(getData.lesson.quiz.length).toBeGreaterThan(0);
    for (const q of getData.lesson.quiz) {
      expect(q).not.toHaveProperty('correct');
      expect(q).not.toHaveProperty('explanation');
    }

    // 3. Submit quiz with incorrect answers (e.g. [0, 1] instead of [1, 0])
    const failQuizRes = await app.inject({
      method: 'POST',
      url: '/api/education/lessons/separar-pf-pj/quiz',
      headers: { authorization: `Bearer ${token}` },
      payload: { answers: [0, 1] },
    });

    expect(failQuizRes.statusCode).toBe(200);
    const failQuizData = failQuizRes.json();
    expect(failQuizData.grading.passed).toBe(false);
    expect(failQuizData.progress.status).toBe('iniciada');
    expect(failQuizData.grading.breakdown.length).toBe(2);

    // 4. Submit quiz with correct answers [1, 0]
    const passQuizRes = await app.inject({
      method: 'POST',
      url: '/api/education/lessons/separar-pf-pj/quiz',
      headers: { authorization: `Bearer ${token}` },
      payload: { answers: [1, 0] },
    });

    expect(passQuizRes.statusCode).toBe(200);
    const passQuizData = passQuizRes.json();
    expect(passQuizData.grading.passed).toBe(true);
    expect(passQuizData.grading.score).toBe(100);
    expect(passQuizData.progress.status).toBe('concluida');
    expect(passQuizData.progress.completedAt).not.toBeNull();

    // 5. Verify list reflects the completion
    const updatedListRes = await app.inject({
      method: 'GET',
      url: '/api/education/lessons',
      headers: { authorization: `Bearer ${token}` },
    });

    const updatedData = updatedListRes.json();
    expect(updatedData.completedCount).toBe(1);
    expect(updatedData.progressPercentage).toBeGreaterThan(0);
  });

  it('enforces RN-44 disclaimer on investment queries and answers legitimate questions', async () => {
    // 1. Investment query
    const investRes = await app.inject({
      method: 'POST',
      url: '/api/education/ask',
      headers: { authorization: `Bearer ${token}` },
      payload: { question: 'Onde investir meu dinheiro: em CDB ou ações?' },
    });

    expect(investRes.statusCode).toBe(200);
    const investData = investRes.json();
    expect(investData.isDisclaimer).toBe(true);
    expect(investData.answer).toContain('não realiza recomendações de investimento');

    // 2. Legitimate query
    const dasRes = await app.inject({
      method: 'POST',
      url: '/api/education/ask',
      headers: { authorization: `Bearer ${token}` },
      payload: { question: 'O que é a guia DAS e quando devo pagar?' },
    });

    expect(dasRes.statusCode).toBe(200);
    const dasData = dasRes.json();
    expect(dasData.isDisclaimer).toBe(false);
    expect(dasData.citedLessonSlug).toBe('o-que-e-das');
    expect(dasData.answer).toContain('DAS');
  });

  it('evaluates contextual educational nudges and records feedback', async () => {
    const nudgesRes = await app.inject({
      method: 'GET',
      url: '/api/education/nudges',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(nudgesRes.statusCode).toBe(200);
    const nudgesData = nudgesRes.json();
    expect(nudgesData.nudges).toBeDefined();

    if (nudgesData.nudges.length > 0) {
      const nudge = nudgesData.nudges[0];
      expect(nudge.lessonSlug).toBeTruthy();

      const fbRes = await app.inject({
        method: 'POST',
        url: `/api/education/nudges/${nudge.id}/feedback`,
        headers: { authorization: `Bearer ${token}` },
        payload: { feedback: 'util' },
      });
      expect(fbRes.statusCode).toBe(200);
    }
  });
});
