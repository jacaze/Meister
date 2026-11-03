import prisma from '../../../../config/prisma.js';
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

  return prisma.dasCharge.update({
    where: { id: charge.id },
    data: {
      status: 'pendente',
      paidOn: null,
      paidAmount: null,
    },
  });
}
