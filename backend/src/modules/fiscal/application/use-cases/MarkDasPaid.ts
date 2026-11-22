import prisma from '../../../../config/prisma.js';
import { findFallbackCategoryId, listCategories } from '../../../catalog/public.js';
import { createTransaction, deleteTransaction } from '../../../ledger/public.js';
import {
  LocalDate,
  Money,
  NotFoundError,
  ValidationError,
  assertCanWrite,
  type WorkspaceScope,
} from '../../../../shared/index.js';

export interface MarkDasPaidInput {
  readonly dasId: string;
  readonly paidOn: string; // YYYY-MM-DD
  readonly paidAmount?: string;
}

// Vínculo estável guia -> despesa: o sourceRef é único por workspace, então repetir não duplica
export const dasSourceRef = (chargeId: string): string => `das:${chargeId}`;

// "2026-10" -> "DAS 10/2026"
function dasDescription(competence: string): string {
  const [year, month] = competence.split('-');
  return `DAS ${month}/${year}`;
}

async function resolveDasCategoryId(scope: WorkspaceScope): Promise<string> {
  const categories = await listCategories(scope, { type: 'despesa' });
  const das = categories.find((c) => c.slug === 'impostos-das');
  if (das) return das.id;
  const fallback = await findFallbackCategoryId(scope, 'despesa');
  if (!fallback) throw new ValidationError('Categoria de impostos (DAS) não encontrada no workspace');
  return fallback;
}

export async function markDasPaid(
  scope: WorkspaceScope,
  input: MarkDasPaidInput
) {
  assertCanWrite(scope);

  const charge = await prisma.dasCharge.findFirst({
    where: {
      id: input.dasId,
      workspaceId: scope.workspaceId,
    },
  });

  if (!charge) {
    throw new NotFoundError('Cobrança de DAS não encontrada');
  }

  let paidDate: LocalDate;
  try {
    paidDate = LocalDate.fromIsoDate(input.paidOn);
  } catch {
    throw new ValidationError('Data de pagamento inválida');
  }

  if (paidDate.isAfter(LocalDate.now())) {
    throw new ValidationError('Data de pagamento não pode ser no futuro');
  }

  const paidAmount = input.paidAmount
    ? Money.fromDecimalString(input.paidAmount)
    : Money.fromDecimalString(charge.amount.toString());

  // Despesa primeiro (idempotente pelo sourceRef): se falhar, a guia continua pendente e o retry é seguro
  await createTransaction(scope, {
    entityId: charge.entityId,
    type: 'despesa',
    amount: paidAmount.toDecimalString(),
    description: dasDescription(charge.competence),
    occurredOn: paidDate.toIsoDate(),
    categoryId: await resolveDasCategoryId(scope),
    paymentMethod: 'boleto',
    origin: 'manual',
    sourceRef: dasSourceRef(charge.id),
  });

  return prisma.dasCharge.update({
    where: { id: charge.id },
    data: {
      status: 'pago',
      paidOn: new Date(`${paidDate.toIsoDate()}T00:00:00.000Z`),
      paidAmount: Number(paidAmount.toDecimalString()),
    },
  });
}

export async function unmarkDasPaid(
  scope: WorkspaceScope,
  dasId: string
) {
  assertCanWrite(scope);

  const charge = await prisma.dasCharge.findFirst({
    where: {
      id: dasId,
      workspaceId: scope.workspaceId,
    },
  });

  if (!charge) {
    throw new NotFoundError('Cobrança de DAS não encontrada');
  }

  // Remove (soft delete pelo ledger) a despesa vinculada; se já foi apagada, desfazer segue normalmente
  const linked = await prisma.transaction.findFirst({
    where: { workspaceId: scope.workspaceId, sourceRef: dasSourceRef(charge.id), deletedAt: null },
    select: { id: true },
  });
  if (linked) {
    try {
      await deleteTransaction(scope, linked.id);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
  }

  return prisma.dasCharge.update({
    where: { id: charge.id },
    data: {
      status: 'pendente',
      paidOn: null,
      paidAmount: null,
    },
  });
}
