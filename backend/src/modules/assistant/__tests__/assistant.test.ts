import { describe, it, expect } from 'vitest';
import { PtBrDateResolver } from '../domain/pt-br-date-resolver.js';
import { validateExtraction } from '../domain/post-validations.js';
import { LocalDate } from '../../../shared/index.js';

class MockClock {
  today() {
    return LocalDate.fromParts(2026, 11, 4); // Wednesday
  }
}

describe('PtBrDateResolver', () => {
  const clock = new MockClock() as any;
  const resolver = new PtBrDateResolver(clock);

  it('resolves relative words correctly', () => {
    expect(resolver.resolve('hoje')?.toIsoDate()).toBe('2026-11-04');
    expect(resolver.resolve('ontem')?.toIsoDate()).toBe('2026-11-03');
    expect(resolver.resolve('anteontem')?.toIsoDate()).toBe('2026-11-02');
    expect(resolver.resolve('amanhã')?.toIsoDate()).toBe('2026-11-05');
  });

  it('resolves explicit DD/MM and DD/MM/YYYY', () => {
    expect(resolver.resolve('15/10')?.toIsoDate()).toBe('2026-10-15');
    expect(resolver.resolve('01/05/2026')?.toIsoDate()).toBe('2026-05-01');
  });

  it('resolves weekdays in the past', () => {
    // Current day is Wednesday (targetDow: 3). "segunda" was 2 days ago (2026-11-02)
    expect(resolver.resolve('segunda')?.toIsoDate()).toBe('2026-11-02');
  });
});

describe('validateExtraction', () => {
  const clock = new MockClock() as any;
  const categories = [
    { id: 'cat-1', slug: 'alimentacao', name: 'Alimentação', type: 'despesa' as const },
    { id: 'cat-2', slug: 'vendas', name: 'Vendas', type: 'receita' as const },
  ];

  it('validates a standard expense proposal', () => {
    const res = validateExtraction(
      {
        intent: 'lancamento',
        documentKind: 'texto_livre',
        type: 'despesa',
        amount: '45.00',
        dateIso: null,
        dateExpression: 'ontem',
        description: 'Almoço com cliente',
        merchant: null,
        categorySlug: 'alimentacao',
        paymentMethod: 'pix',
        scope: 'pj',
        items: [],
        confidence: 0.9,
        ambiguous: [],
      },
      'Almoço ontem 45 pix',
      { categories, hasPjEntity: true, clock }
    );

    expect(res.kind).toBe('valid');
    if (res.kind === 'valid') {
      expect(res.data.amountCents).toBe(4500n);
      expect(res.data.date.toIsoDate()).toBe('2026-11-03');
      expect(res.data.categoryId).toBe('cat-1');
      expect(res.data.scope).toBe('pj');
    }
  });

  it('prompts question when amount is missing', () => {
    const res = validateExtraction(
      {
        intent: 'lancamento',
        documentKind: 'texto_livre',
        type: 'despesa',
        amount: null,
        dateIso: null,
        dateExpression: null,
        description: 'Almoço',
        merchant: null,
        categorySlug: null,
        paymentMethod: null,
        scope: 'indefinido',
        items: [],
        confidence: 0.8,
        ambiguous: [],
      },
      'Gastei no almoço',
      { categories, hasPjEntity: true, clock }
    );

    expect(res.kind).toBe('question');
    if (res.kind === 'question') {
      expect(res.field).toBe('amount');
    }
  });
});
