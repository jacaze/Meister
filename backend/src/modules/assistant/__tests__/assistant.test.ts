import { describe, expect, it } from 'vitest';
import { LocalDate, SystemClock } from '../../../shared/index.js';
import { PtBrDateResolver } from '../domain/pt-br-date-resolver.js';
import { validateExtraction } from '../domain/post-validations.js';
import { GeminiExtractor } from '../infra/gemini-extractor.js';
import type { Extraction } from '../domain/extraction-schema.js';

describe('Assistant Module — Date Resolver & Post-Validations', () => {
  const clock = new SystemClock();
  const resolver = new PtBrDateResolver(clock);
  const today = clock.today();

  it('resolves relative expressions in PT-BR', () => {
    expect(resolver.resolve('hoje')?.toIsoDate()).toBe(today.toIsoDate());
    expect(resolver.resolve('ontem')?.toIsoDate()).toBe(today.addDays(-1).toIsoDate());
    expect(resolver.resolve('anteontem')?.toIsoDate()).toBe(today.addDays(-2).toIsoDate());
    expect(resolver.resolve('amanhã')?.toIsoDate()).toBe(today.addDays(1).toIsoDate());
    expect(resolver.resolve('semana passada')?.toIsoDate()).toBe(today.addDays(-7).toIsoDate());
  });

  it('resolves explicit dates', () => {
    expect(resolver.resolve('2026-05-20')?.toIsoDate()).toBe('2026-05-20');
    expect(resolver.resolve('15/03/2026')?.toIsoDate()).toBe('2026-03-15');
  });

  it('post-validation questions when amount is missing or invalid', () => {
    const extraction: Extraction = {
      intent: 'lancamento',
      documentKind: 'texto_livre',
      type: 'despesa',
      amount: null,
      dateIso: null,
      dateExpression: 'hoje',
      description: 'Almoço',
      merchant: null,
      categorySlug: 'alimentacao',
      paymentMethod: 'pix',
      scope: 'pj',
      items: [],
      confidence: 0.9,
      ambiguous: ['amount'],
    };

    const outcome = validateExtraction(extraction, 'Gastei no almoço', {
      categories: [{ id: 'cat1', slug: 'alimentacao', name: 'Alimentação', type: 'despesa' }],
      hasPjEntity: true,
      clock,
    });

    expect(outcome.kind).toBe('question');
    if (outcome.kind === 'question') {
      expect(outcome.field).toBe('amount');
    }
  });

  it('post-validation accepts valid extraction and maps category', () => {
    const extraction: Extraction = {
      intent: 'lancamento',
      documentKind: 'texto_livre',
      type: 'despesa',
      amount: '50.00',
      dateIso: null,
      dateExpression: 'hoje',
      description: 'Almoço no restaurante',
      merchant: null,
      categorySlug: 'alimentacao',
      paymentMethod: 'cartao_debito',
      scope: 'pj',
      items: [],
      confidence: 0.95,
      ambiguous: [],
    };

    const outcome = validateExtraction(extraction, 'Gastei 50 no almoço com débito', {
      categories: [{ id: 'cat1', slug: 'alimentacao', name: 'Alimentação', type: 'despesa' }],
      hasPjEntity: true,
      clock,
    });

    expect(outcome.kind).toBe('valid');
    if (outcome.kind === 'valid') {
      expect(outcome.data.amount).toBe('50.00');
      expect(outcome.data.amountCents).toBe(5000n);
      expect(outcome.data.categoryId).toBe('cat1');
      expect(outcome.data.scope).toBe('pj');
    }
  });

  it('GeminiExtractor heuristic fallback parses simple Brazilian Portuguese spending', () => {
    const extractor = new GeminiExtractor();
    const categories = [
      { slug: 'alimentacao', name: 'Alimentação', type: 'despesa' as const },
      { slug: 'servicos', name: 'Serviços', type: 'receita' as const },
    ];

    const res = extractor.heuristicFallback('Recebi 1500 de consultoria via pix', categories);
    expect(res.intent).toBe('lancamento');
    expect(res.type).toBe('receita');
    expect(res.amount).toBe('1500.00');
    expect(res.paymentMethod).toBe('pix');
  });
});
