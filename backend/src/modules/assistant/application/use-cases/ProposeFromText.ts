import type { Prisma } from '@prisma/client';
import prisma from '../../../../config/prisma.js';
import { assertCanWrite, SystemClock, type Clock, type WorkspaceScope } from '../../../../shared/index.js';
import { validateExtraction, type CategoryInfo } from '../../domain/post-validations.js';
import type { LlmExtractor } from '../ports/llm-extractor.js';
import { GeminiExtractor } from '../../infra/gemini-extractor.js';

export interface ProposeFromTextInput {
  readonly text: string;
  readonly sourceRef?: string;
  readonly extractor?: LlmExtractor;
  readonly clock?: Clock;
}

export type ProposeOutcome =
  | {
      readonly kind: 'proposal';
      readonly proposalId: string;
      readonly draft: {
        readonly type: 'receita' | 'despesa';
        readonly amount: string;
        readonly description: string;
        readonly date: string;
        readonly categoryId: string | null;
        readonly categoryName: string;
        readonly paymentMethod: string | null;
        readonly scope: 'pj' | 'pf';
      };
      readonly confidence: number;
      readonly ambiguousFields: readonly string[];
      readonly expiresAt: string;
    }
  | {
      readonly kind: 'question';
      readonly proposalId?: string;
      readonly field: string;
      readonly questionText: string;
    }
  | {
      readonly kind: 'query';
      readonly queryKind: string;
    }
  | {
      readonly kind: 'not_a_transaction';
      readonly message: string;
    }
  | {
      readonly kind: 'refused';
      readonly reason: string;
    };

export async function proposeFromText(
  scope: WorkspaceScope,
  input: ProposeFromTextInput
): Promise<ProposeOutcome> {
  assertCanWrite(scope);

  const clock = input.clock ?? new SystemClock();
  const startTime = Date.now();

  // 1. Fetch categories for workspace
  const categoriesRaw = await prisma.category.findMany({
    where: { workspaceId: scope.workspaceId },
    select: { id: true, slug: true, name: true, type: true },
  });

  const categories: CategoryInfo[] = categoriesRaw.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    type: c.type as 'receita' | 'despesa',
  }));

  // 2. Call LLM Extractor
  const extractor = input.extractor ?? new GeminiExtractor();
  const extraction = await extractor.extractFromText({
    text: input.text,
    categories,
    referenceDateIso: clock.today().toIsoDate(),
  });

  // 3. Post-validation
  const validation = validateExtraction(extraction, input.text, {
    categories,
    hasPjEntity: Boolean(scope.defaultEntityIds.pj),
    clock,
  });

  const latencyMs = Date.now() - startTime;

  // 4. Handle outcomes
  if (validation.kind === 'valid') {
    const data = validation.data;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    const targetEntityId =
      data.scope === 'pj' && scope.defaultEntityIds.pj
        ? scope.defaultEntityIds.pj
        : scope.defaultEntityIds.pf;

    const draft = {
      entityId: targetEntityId,
      type: data.type,
      amount: data.amount,
      description: data.description,
      occurredOn: data.date.toIsoDate(),
      transactionDate: data.date.toIsoDate(),
      categoryId: data.categoryId,
      paymentMethod: data.paymentMethod,
      scope: data.scope,
    };

    const proposal = await prisma.proposal.create({
      data: {
        workspaceId: scope.workspaceId,
        userId: scope.actorUserId,
        draft,
        confidence: data.confidence,
        ambiguous: data.ambiguousFields,
        status: 'aberta',
        source: 'texto',
        sourceRef: input.sourceRef ?? null,
        expiresAt,
      },
    });

    // Audit run
    await prisma.aiRun.create({
      data: {
        proposalId: proposal.id,
        kind: 'text',
        model: process.env.LLM_MODEL || 'gemini-2.5-flash',
        promptVersion: 'v1.0',
        inputHash: `hash_${input.text.length}_${Date.now()}`,
        output: extraction as unknown as Prisma.InputJsonValue,
        latencyMs,
        outcome: 'success',
      },
    });

    const categoryObj = categories.find((c) => c.id === data.categoryId);

    return {
      kind: 'proposal',
      proposalId: proposal.id,
      draft: {
        type: data.type,
        amount: data.amount,
        description: data.description,
        date: data.date.toIsoDate(),
        categoryId: data.categoryId,
        categoryName: categoryObj ? categoryObj.name : 'Sem categoria',
        paymentMethod: data.paymentMethod,
        scope: data.scope,
      },
      confidence: data.confidence,
      ambiguousFields: data.ambiguousFields,
      expiresAt: expiresAt.toISOString(),
    };
  }

  if (validation.kind === 'question') {
    return {
      kind: 'question',
      field: validation.field,
      questionText: validation.questionText,
    };
  }

  if (validation.kind === 'query') {
    return {
      kind: 'query',
      queryKind: validation.queryKind,
    };
  }

  if (validation.kind === 'not_a_transaction') {
    return {
      kind: 'not_a_transaction',
      message: validation.message,
    };
  }

  return {
    kind: 'refused',
    reason: validation.reason,
  };
}
