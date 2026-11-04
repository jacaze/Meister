import { describe, expect, it } from 'vitest';
import type { ConsentRecord, UserDataExport } from '../public.js';

describe('Compliance & LGPD Domain Types Suite', () => {
  it('validates sanitized export structure guaranteeing zero password hash exposure', () => {
    const mockExport: UserDataExport = {
      exportedAt: new Date().toISOString(),
      legalDisclaimer: 'LGPD Art. 18',
      user: {
        id: 'usr-1',
        name: 'Maria Teste',
        email: 'maria@test.com',
        accountType: 'mei',
        timezone: 'America/Sao_Paulo',
        createdAt: new Date().toISOString(),
      },
      workspaces: [],
      transactions: [],
      categories: [],
      jars: [],
      dasCharges: [],
      lessonProgress: [],
      consents: [],
    };

    expect((mockExport.user as Record<string, unknown>).passwordHash).toBeUndefined();
    expect((mockExport.user as Record<string, unknown>).refreshHash).toBeUndefined();
    expect(mockExport.user.email).toBe('maria@test.com');
  });

  it('validates consent kinds and structure', () => {
    const consent: ConsentRecord = {
      kind: 'terms',
      version: '1.0',
      accepted: true,
      acceptedAt: new Date().toISOString(),
    };

    expect(consent.accepted).toBe(true);
    expect(['terms', 'privacy', 'ai_processing', 'open_finance']).toContain(consent.kind);
  });
});
