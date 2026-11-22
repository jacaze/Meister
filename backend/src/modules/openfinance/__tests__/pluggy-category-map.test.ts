import { describe, expect, it } from 'vitest';
import {
  isPluggyTransferCategory,
  suggestSlugFromPluggyCategory,
} from '../domain/pluggy-category-map.js';
import { DEFAULT_CATEGORIES, FALLBACK_CATEGORY_SLUG } from '../../catalog/public.js';

describe('suggestSlugFromPluggyCategory', () => {
  it.each([
    ['Groceries', 'out', 'alimentacao'],
    ['Food and drinks', 'out', 'alimentacao'],
    ['Eating out', 'out', 'alimentacao'],
    ['Restaurants', 'out', 'alimentacao'],
    ['Transportation', 'out', 'transporte'],
    ['Gas stations', 'out', 'transporte'],
    ['Taxi and ride-hailing', 'out', 'transporte'],
    ['Electricity', 'out', 'moradia'],
    ['Rent', 'out', 'moradia'],
    ['Pharmacy', 'out', 'saude'],
    ['University', 'out', 'educacao'],
    ['Video streaming', 'out', 'lazer'],
    ['Donations', 'out', 'doacoes'],
    ['Fixed income', 'out', 'investimentos'],
    ['Bank fees', 'out', 'outras-despesas'],
    ['Income', 'in', 'outras-receitas'],
    ['Salary', 'in', 'outras-receitas'],
  ] as const)('%s (%s) -> %s', (category, direction, slug) => {
    expect(suggestSlugFromPluggyCategory(category, direction)).toBe(slug);
  });

  it('ignora caixa e espaços extras', () => {
    expect(suggestSlugFromPluggyCategory('  food   AND drinks ', 'out')).toBe('alimentacao');
  });

  it('respeita a direção: despesa não vira receita e vice-versa', () => {
    expect(suggestSlugFromPluggyCategory('Groceries', 'in')).toBeNull();
    expect(suggestSlugFromPluggyCategory('Shopping', 'in')).toBeNull();
    expect(suggestSlugFromPluggyCategory('Income', 'out')).toBeNull();
  });

  it.each([
    'Transfers',
    'Transfer - PIX',
    'Transfer - TED',
    'Same person transfer - PIX',
    'Third-party transfers',
    'Credit card payment',
    'Loans and Financing',
    'Categoria inexistente',
    '',
  ])('sem pista: "%s"', (category) => {
    expect(suggestSlugFromPluggyCategory(category, 'out')).toBeNull();
    expect(suggestSlugFromPluggyCategory(category, 'in')).toBeNull();
  });

  it('categoria ausente devolve null', () => {
    expect(suggestSlugFromPluggyCategory(undefined, 'out')).toBeNull();
    expect(suggestSlugFromPluggyCategory(null, 'in')).toBeNull();
  });

  it('todo slug sugerido existe no catálogo padrão com o tipo da direção', () => {
    const names = [
      'Groceries', 'Food and drinks', 'Housing', 'Transportation', 'Healthcare', 'Education', 'Leisure',
      'Travel', 'Donations', 'Investments', 'Shopping', 'Taxes', 'Bank fees', 'Insurance', 'Services',
    ];
    for (const name of names) {
      const slug = suggestSlugFromPluggyCategory(name, 'out')!;
      expect(DEFAULT_CATEGORIES.find((c) => c.slug === slug)?.type, name).toBe('despesa');
    }
    const receita = suggestSlugFromPluggyCategory('Income', 'in')!;
    expect(DEFAULT_CATEGORIES.find((c) => c.slug === receita)?.type).toBe('receita');
  });
});

describe('isPluggyTransferCategory', () => {
  it('reconhece movimentações entre contas e pessoas', () => {
    for (const c of ['Transfers', 'Transfer - PIX', 'Same person transfer - TED', 'Third-party transfers', 'Credit card payment']) {
      expect(isPluggyTransferCategory(c), c).toBe(true);
    }
  });
  it('não confunde com despesa comum', () => {
    expect(isPluggyTransferCategory('Groceries')).toBe(false);
    expect(isPluggyTransferCategory('Bank fees')).toBe(false);
    expect(isPluggyTransferCategory(undefined)).toBe(false);
  });
});

describe('FALLBACK_CATEGORY_SLUG', () => {
  it('aponta para as categorias padrão "Outras" do tipo certo, pelo slug', () => {
    expect(FALLBACK_CATEGORY_SLUG).toEqual({ receita: 'outras-receitas', despesa: 'outras-despesas' });
    for (const [type, slug] of Object.entries(FALLBACK_CATEGORY_SLUG)) {
      expect(DEFAULT_CATEGORIES.find((c) => c.slug === slug)?.type).toBe(type);
    }
  });
});
