import { LocalDate, Money, SystemClock, type Clock } from '../../../shared/index.js';
import type { Extraction } from './extraction-schema.js';
import { PtBrDateResolver } from './pt-br-date-resolver.js';

export interface CategoryInfo {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly type: 'receita' | 'despesa';
}

export interface ValidationContext {
  readonly categories: readonly CategoryInfo[];
  readonly defaultEntityId?: string;
  readonly hasPjEntity: boolean;
  readonly clock?: Clock;
}

export type PostValidationOutcome =
  | { readonly kind: 'valid'; readonly data: ValidatedProposalData }
  | { readonly kind: 'question'; readonly field: string; readonly questionText: string }
  | { readonly kind: 'not_a_transaction'; readonly message: string }
  | { readonly kind: 'query'; readonly queryKind: string }
  | { readonly kind: 'refused'; readonly reason: string };

export interface ValidatedProposalData {
  readonly type: 'receita' | 'despesa';
  readonly amount: string;
  readonly amountCents: bigint;
  readonly date: LocalDate;
  readonly description: string;
  readonly categoryId: string | null;
  readonly categorySlug: string | null;
  readonly paymentMethod: 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'outro' | null;
  readonly scope: 'pj' | 'pf';
  readonly confidence: number;
  readonly ambiguousFields: string[];
  readonly isPossibleDuplicate?: boolean;
}

export function validateExtraction(
  extraction: Extraction,
  rawText: string,
  ctx: ValidationContext
): PostValidationOutcome {
  const clock = ctx.clock ?? new SystemClock();

  // PV-10: Limit checks
  if (rawText.length > 1000) {
    return {
      kind: 'refused',
      reason: 'Mensagem muito longa (limite de 1.000 caracteres).',
    };
  }

  // Check intent
  if (extraction.intent === 'consulta' && extraction.query) {
    return {
      kind: 'query',
      queryKind: extraction.query,
    };
  }

  if (extraction.intent === 'outro' || extraction.documentKind === 'nao_e_documento') {
    return {
      kind: 'not_a_transaction',
      message: 'Não identifiquei um lançamento financeiro na mensagem enviada.',
    };
  }

  // PV-06 & PV-01: Amount & Type checks
  if (!extraction.type) {
    return {
      kind: 'question',
      field: 'type',
      questionText: 'Isso foi uma receita (entrada) ou uma despesa (saída)?',
    };
  }

  if (!extraction.amount) {
    return {
      kind: 'question',
      field: 'amount',
      questionText: 'Qual foi o valor exato desse lançamento?',
    };
  }

  let money: Money;
  try {
    money = Money.fromDecimalString(extraction.amount);
    if (!money.isPositive()) {
      return {
        kind: 'question',
        field: 'amount',
        questionText: 'O valor do lançamento precisa ser maior que zero. Qual é o valor?',
      };
    }
  } catch {
    return {
      kind: 'question',
      field: 'amount',
      questionText: 'Não entendi o formato do valor. Pode informar em reais (ex: 50,00)?',
    };
  }

  // PV-02: Date resolution
  const dateResolver = new PtBrDateResolver(clock);
  let resolvedDate: LocalDate | null = null;

  if (extraction.dateExpression) {
    resolvedDate = dateResolver.resolve(extraction.dateExpression);
  }
  if (!resolvedDate && extraction.dateIso) {
    resolvedDate = dateResolver.resolve(extraction.dateIso);
  }
  if (!resolvedDate) {
    resolvedDate = clock.today();
  }

  // PV-03: Date plausibility [today - 400 days, today + 1 day]
  const today = clock.today();
  const minDate = today.addDays(-400);
  const maxDate = today.addDays(1);

  if (resolvedDate.isBefore(minDate) || resolvedDate.isAfter(maxDate)) {
    return {
      kind: 'question',
      field: 'date',
      questionText: `A data informada (${resolvedDate.toIsoDate()}) parece incomum. Qual é a data correta?`,
    };
  }

  // PV-04: Category matching
  let matchedCategory: CategoryInfo | null = null;
  if (extraction.categorySlug) {
    const slugClean = extraction.categorySlug.toLowerCase().trim();
    matchedCategory =
      ctx.categories.find(
        (c) => (c.slug === slugClean || c.name.toLowerCase() === slugClean) && c.type === extraction.type
      ) ?? null;
  }

  // PV-05: Scope PJ vs PF
  let targetScope: 'pj' | 'pf' = 'pf';
  if (ctx.hasPjEntity) {
    if (extraction.scope === 'pj') {
      targetScope = 'pj';
    } else if (extraction.scope === 'indefinido') {
      // Default to PJ if account has PJ, or flag ambiguous
      targetScope = 'pj';
    }
  }

  // PV-07: Low confidence
  const ambiguousFields: string[] = [...extraction.ambiguous];
  if (extraction.confidence < 0.6) {
    ambiguousFields.push('low_confidence');
  }

  const description =
    extraction.description ||
    extraction.merchant ||
    (extraction.type === 'receita' ? 'Receita lançada via assistente' : 'Despesa lançada via assistente');

  return {
    kind: 'valid',
    data: {
      type: extraction.type,
      amount: extraction.amount,
      amountCents: money.cents,
      date: resolvedDate,
      description,
      categoryId: matchedCategory ? matchedCategory.id : null,
      categorySlug: matchedCategory ? matchedCategory.slug : null,
      paymentMethod: extraction.paymentMethod,
      scope: targetScope,
      confidence: extraction.confidence,
      ambiguousFields,
    },
  };
}
