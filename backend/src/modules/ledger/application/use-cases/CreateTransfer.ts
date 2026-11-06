import prisma from '../../../../config/prisma.js';
import {
  LocalDate,
  Money,
  NotFoundError,
  ValidationError,
  assertCanWrite,
  newId,
  type WorkspaceScope,
} from '../../../../shared/index.js';

export interface CreateTransferInput {
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly amount: string | number;
  readonly occurredOn: string;
  readonly description?: string;
}

export async function createTransfer(
  scope: WorkspaceScope,
  input: CreateTransferInput
) {
  assertCanWrite(scope);

  if (input.fromAccountId === input.toAccountId) {
    throw new ValidationError('As contas de origem e destino devem ser diferentes');
  }

  const amt = Money.fromDecimalString(String(input.amount).trim());
  if (!amt.isPositive()) {
    throw new ValidationError('O valor da transferência deve ser maior que zero');
  }

  const [fromAccount, toAccount] = await Promise.all([
    prisma.financialAccount.findFirst({
      where: { id: input.fromAccountId, workspaceId: scope.workspaceId },
      include: { entity: true },
    }),
    prisma.financialAccount.findFirst({
      where: { id: input.toAccountId, workspaceId: scope.workspaceId },
      include: { entity: true },
    }),
  ]);

  if (!fromAccount || !toAccount) {
    throw new NotFoundError('Conta de origem ou destino não encontrada no workspace');
  }

  // Regra unificada de pró-labore: Transferências de PJ para PF devem ser registradas como Pró-labore
  if (fromAccount.entity?.kind === 'pj' && toAccount.entity?.kind === 'pf') {
    throw new ValidationError(
      'Transferências da conta PJ para a conta PF devem ser registradas como Pró-labore na rota de retiradas de titular'
    );
  }

  let localDate: LocalDate;
  try {
    localDate = LocalDate.fromIsoDate(input.occurredOn);
  } catch {
    throw new ValidationError('Data inválida');
  }

  const transferGroupId = newId();
  const txDateDb = new Date(`${localDate.toIsoDate()}T00:00:00.000Z`);
  const desc = input.description?.trim() || `Transferência de ${fromAccount.name} para ${toAccount.name}`;

  return prisma.$transaction(async (tx) => {
    const legOut = await tx.transaction.create({
      data: {
        workspaceId: scope.workspaceId,
        entityId: fromAccount.entityId,
        financialAccountId: fromAccount.id,
        type: 'despesa',
        direction: 'out',
        amount: Number(amt.toDecimalString()),
        description: desc,
        transactionDate: txDateDb,
        transferGroupId,
        transferType: 'transfer',
        status: 'confirmado',
      },
    });

    const legIn = await tx.transaction.create({
      data: {
        workspaceId: scope.workspaceId,
        entityId: toAccount.entityId,
        financialAccountId: toAccount.id,
        type: 'receita',
        direction: 'in',
        amount: Number(amt.toDecimalString()),
        description: desc,
        transactionDate: txDateDb,
        transferGroupId,
        transferType: 'transfer',
        status: 'confirmado',
      },
    });

    return { legOut, legIn, transferGroupId };
  });
}

export interface RegisterOwnerWithdrawalInput {
  readonly amount: string | number;
  readonly occurredOn: string;
  readonly description?: string;
}

export async function registerOwnerWithdrawal(
  scope: WorkspaceScope,
  input: RegisterOwnerWithdrawalInput
) {
  assertCanWrite(scope);

  const pjEntityId = scope.defaultEntityIds.pj;
  const pfEntityId = scope.defaultEntityIds.pf;

  if (!pjEntityId) {
    throw new ValidationError('Para registrar pró-labore é necessário ter uma entidade PJ configurada');
  }

  const amt = Money.fromDecimalString(String(input.amount).trim());
  if (!amt.isPositive()) {
    throw new ValidationError('O valor do pró-labore deve ser maior que zero');
  }

  const localDate = LocalDate.fromIsoDate(input.occurredOn);
  const txDateDb = new Date(`${localDate.toIsoDate()}T00:00:00.000Z`);
  const transferGroupId = newId();
  const desc = input.description?.trim() || 'Retirada de Pró-labore';

  // Find or create 'pro-labore' category in PF
  const proLaboreCat = await prisma.category.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      slug: 'pro-labore',
      type: 'receita',
    },
  });

  return prisma.$transaction(async (tx) => {
    // PJ Leg (Retirada / despesa PJ)
    const legPj = await tx.transaction.create({
      data: {
        workspaceId: scope.workspaceId,
        entityId: pjEntityId,
        type: 'despesa',
        direction: 'out',
        amount: Number(amt.toDecimalString()),
        description: desc,
        transactionDate: txDateDb,
        transferGroupId,
        transferType: 'pro_labore',
        status: 'confirmado',
      },
    });

    // PF Leg (Receita PF de pró-labore)
    const legPf = await tx.transaction.create({
      data: {
        workspaceId: scope.workspaceId,
        entityId: pfEntityId,
        categoryId: proLaboreCat?.id ?? null,
        type: 'receita',
        direction: 'in',
        amount: Number(amt.toDecimalString()),
        description: desc,
        transactionDate: txDateDb,
        transferGroupId,
        transferType: 'pro_labore',
        status: 'confirmado',
      },
    });

    return { legPj, legPf, transferGroupId };
  });
}
