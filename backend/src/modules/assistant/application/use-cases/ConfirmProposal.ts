import type { PaymentMethod } from '@prisma/client';
import prisma from '../../../../config/prisma.js';
import {
  assertCanWrite,
  NotFoundError,
  ValidationError,
  type WorkspaceScope,
} from '../../../../shared/index.js';
import { createTransaction } from '../../../ledger/public.js';
import { getMeiLimit } from '../../../fiscal/public.js';
import { getJarsStatus } from '../../../jars/public.js';

export interface ConfirmProposalResult {
  readonly proposalId: string;
  readonly transactionId: string;
  readonly amount: string;
  readonly description: string;
  readonly type: string;
  readonly date: string;
  readonly impact?: {
    readonly jarName?: string;
    readonly jarPercentUsed?: number;
    readonly isJarWarning?: boolean;
    readonly meiAnnualLimit?: number;
    readonly meiAccumulatedGross?: number;
    readonly meiPercentUsed?: number;
    readonly meiBand?: string;
  };
}

export async function confirmProposal(
  scope: WorkspaceScope,
  proposalId: string
): Promise<ConfirmProposalResult> {
  assertCanWrite(scope);

  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, workspaceId: scope.workspaceId },
  });

  if (!proposal) {
    throw new NotFoundError('Proposta não encontrada.');
  }

  // Idempotency: if already confirmed, return current transaction details
  if (proposal.status === 'confirmada' && proposal.confirmedTransactionId) {
    const existingTx = await prisma.transaction.findUnique({
      where: { id: proposal.confirmedTransactionId },
    });
    if (existingTx) {
      return {
        proposalId: proposal.id,
        transactionId: existingTx.id,
        amount: String(existingTx.amount),
        description: existingTx.description,
        type: existingTx.type,
        date: existingTx.transactionDate.toISOString().slice(0, 10),
      };
    }
  }

  if (proposal.status === 'cancelada') {
    throw new ValidationError('Esta proposta foi cancelada anteriormente.');
  }

  if (proposal.status === 'expirada' || new Date() > proposal.expiresAt) {
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: { status: 'expirada' },
    });
    throw new ValidationError('Esta proposta expirou (limite de 15 minutos). Envie o lançamento novamente.');
  }

  const draft = proposal.draft as {
    entityId?: string;
    type: 'receita' | 'despesa';
    amount: string;
    description: string;
    occurredOn?: string;
    transactionDate?: string;
    categoryId?: string | null;
    paymentMethod?: PaymentMethod | null;
    viaPersonalAccount?: boolean;
  };

  let targetCategoryId = draft.categoryId;
  if (!targetCategoryId) {
    const fallbackCategory = await prisma.category.findFirst({
      where: { workspaceId: scope.workspaceId, type: draft.type },
    });
    if (fallbackCategory) {
      targetCategoryId = fallbackCategory.id;
    }
  }

  // 1. Create transaction in ledger with idempotency key sourceRef: `proposal:<id>`
  const tx = await createTransaction(scope, {
    entityId: draft.entityId,
    type: draft.type,
    amount: draft.amount,
    description: draft.description,
    occurredOn: draft.occurredOn || draft.transactionDate,
    transactionDate: draft.transactionDate || draft.occurredOn,
    categoryId: targetCategoryId,
    paymentMethod: draft.paymentMethod,
    origin: 'telegram',
    sourceRef: `proposal:${proposal.id}`,
  });

  // 2. Mark proposal as confirmed
  await prisma.proposal.update({
    where: { id: proposal.id },
    data: {
      status: 'confirmada',
      confirmedTransactionId: tx.id,
    },
  });

  // 3. Calculate impacts (fail-safe: errors in impact calculations won't revert transaction)
  let impact: ConfirmProposalResult['impact'] = undefined;
  try {
    let jarName: string | undefined;
    let jarPercentUsed: number | undefined;
    let isJarWarning: boolean | undefined;

    if (draft.categoryId) {
      const jarMapping = await prisma.jarCategory.findFirst({
        where: { categoryId: draft.categoryId },
        include: { jar: true },
      });

      if (jarMapping && jarMapping.jar) {
        jarName = jarMapping.jar.name;
        const jarsStatus = await getJarsStatus(scope, { entityId: draft.entityId });
        const targetJarStatus = jarsStatus.jars.find((j) => j.id === jarMapping.jarId);
        if (targetJarStatus) {
          jarPercentUsed = targetJarStatus.percentUsado;
          isJarWarning = targetJarStatus.status === 'atencao' || targetJarStatus.status === 'estourado';
        }
      }
    }

    let meiAnnualLimit: number | undefined;
    let meiAccumulatedGross: number | undefined;
    let meiPercentUsed: number | undefined;
    let meiBand: string | undefined;

    if (scope.defaultEntityIds.pj) {
      const mei = await getMeiLimit(scope, { entityId: scope.defaultEntityIds.pj });
      if (mei) {
        meiAnnualLimit = Number(mei.limite);
        meiAccumulatedGross = Number(mei.faturamentoAno);
        meiPercentUsed = mei.percentualUtilizado;
        meiBand = mei.status;
      }
    }

    impact = {
      jarName,
      jarPercentUsed,
      isJarWarning,
      meiAnnualLimit,
      meiAccumulatedGross,
      meiPercentUsed,
      meiBand,
    };
  } catch (err) {
    console.warn('[ConfirmProposal] Error evaluating financial impacts:', err);
  }

  return {
    proposalId: proposal.id,
    transactionId: tx.id,
    amount: draft.amount,
    description: draft.description,
    type: draft.type,
    date: draft.transactionDate || new Date().toISOString().slice(0, 10),
    impact,
  };
}
