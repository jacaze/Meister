import type { PaymentMethod, TransactionOrigin, TransactionType } from '@prisma/client';
import prisma from '../../../../config/prisma.js';
import {
  LocalDate,
  Money,
  NotFoundError,
  ValidationError,
  assertCanWrite,
  defaultEventBus,
  type WorkspaceScope,
} from '../../../../shared/index.js';
import { createTransactionSchema } from '../schemas/ledger-schemas.js';

export interface CreateSplitInput {
  readonly categoryId: string;
  readonly amount: string | number;
  readonly description?: string;
}

export interface CreateTransactionInput {
  readonly entityId?: string;
  readonly type: TransactionType | 'transferencia' | 'aporte' | 'retirada';
  readonly amount: string | number;
  readonly description: string;
  readonly occurredOn?: string; // YYYY-MM-DD or transactionDate
  readonly transactionDate?: string;
  readonly categoryId?: string | null;
  readonly splits?: readonly CreateSplitInput[];
  readonly financialAccountId?: string | null;
  readonly paymentMethod?: PaymentMethod | null;
  readonly origin?: TransactionOrigin;
  readonly status?: 'confirmado' | 'pendente_revisao';
  readonly sourceRef?: string | null;
  readonly viaPersonalAccount?: boolean;
}

export async function createTransaction(
  scope: WorkspaceScope,
  input: CreateTransactionInput
) {
  assertCanWrite(scope);

  createTransactionSchema.parse(input);

  // 1. Idempotency by sourceRef
  let existingDeletedId: string | null = null;
  if (input.sourceRef) {
    const existing = await prisma.transaction.findUnique({
      where: {
        workspaceId_sourceRef: {
          workspaceId: scope.workspaceId,
          sourceRef: input.sourceRef,
        },
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        splits: true,
      },
    });
    if (existing) {
      if (!existing.deletedAt) {
        return existing;
      }
      existingDeletedId = existing.id;
    }
  }

  // 2. Validate Amount
  const amountStr = String(input.amount).trim();
  const amountMoney = Money.fromDecimalString(amountStr);
  if (!amountMoney.isPositive()) {
    throw new ValidationError('O valor da transação deve ser positivo e maior que zero');
  }

  // 3. Validate Description
  const description = input.description ? input.description.trim() : '';
  if (!description) {
    throw new ValidationError('A descrição da transação é obrigatória');
  }
  if (description.length > 255) {
    throw new ValidationError('A descrição pode ter no máximo 255 caracteres');
  }

  // 4. Validate Date
  const rawDate = input.occurredOn || input.transactionDate;
  if (!rawDate) {
    throw new ValidationError('A data da transação é obrigatória');
  }
  let localDate: LocalDate;
  try {
    localDate = LocalDate.fromIsoDate(rawDate);
  } catch {
    throw new ValidationError('Data da transação inválida (use o formato AAAA-MM-DD)');
  }

  // 5. Resolve Entity
  const entityId: string =
    input.entityId ??
    (input.type === 'receita' && scope.defaultEntityIds.pj
      ? scope.defaultEntityIds.pj
      : scope.defaultEntityIds.pf);

  const entity = await prisma.entity.findFirst({
    where: { id: entityId, workspaceId: scope.workspaceId, active: true },
  });
  if (!entity) {
    throw new NotFoundError('Entidade não encontrada no workspace');
  }

  // 6. Validate Category & Splits
  const status = input.status ?? 'confirmado';
  const categoryId = input.categoryId ?? null;

  if (input.splits && input.splits.length > 0) {
    if (input.splits.length < 2) {
      throw new ValidationError('Um lançamento dividido deve ter no mínimo 2 divisões (splits)');
    }

    let splitSum = Money.zero();
    for (const split of input.splits) {
      const splitAmt = Money.fromDecimalString(String(split.amount).trim());
      if (!splitAmt.isPositive()) {
        throw new ValidationError('O valor de cada divisão deve ser maior que zero');
      }
      splitSum = splitSum.add(splitAmt);

      const cat = await prisma.category.findFirst({
        where: { id: split.categoryId, workspaceId: scope.workspaceId },
      });
      if (!cat) {
        throw new ValidationError('Categoria do split inválida');
      }
      if (input.type === 'receita' || input.type === 'despesa') {
        if (cat.type !== input.type) {
          throw new ValidationError(`Categoria "${cat.name}" não é compatível com o tipo ${input.type}`);
        }
      }
    }

    if (splitSum.cents !== amountMoney.cents) {
      throw new ValidationError(
        `A soma dos splits (R$ ${splitSum.toDecimalString()}) deve ser exatamente igual ao valor da transação (R$ ${amountMoney.toDecimalString()})`
      );
    }
  } else {
    if (categoryId) {
      const cat = await prisma.category.findFirst({
        where: { id: categoryId, workspaceId: scope.workspaceId },
      });
      if (!cat) {
        throw new ValidationError('Categoria não encontrada');
      }
      if (status === 'confirmado' && (input.type === 'receita' || input.type === 'despesa') && cat.type !== input.type) {
        throw new ValidationError(`Categoria "${cat.name}" não é do tipo ${input.type}`);
      }
    } else if (status === 'confirmado' && (input.type === 'receita' || input.type === 'despesa')) {
      throw new ValidationError('A categoria é obrigatória');
    }
  }

  const txDateDb = new Date(`${localDate.toIsoDate()}T00:00:00.000Z`);

  let created;
  let isRestorationWinner = false;
  if (existingDeletedId) {
    const restoreResult = await prisma.$transaction(async (tx) => {
      const claimed = await tx.transaction.updateMany({
        where: { id: existingDeletedId, deletedAt: { not: null } },
        data: { deletedAt: null },
      });

      const includeConfig = {
        category: { select: { id: true, name: true, slug: true } },
        splits: true,
      };

      if (claimed.count === 0) {
        // Outra requisição simultânea já restaurou este lançamento: devolve o estado atual
        const existingTx = await tx.transaction.findUniqueOrThrow({
          where: { id: existingDeletedId },
          include: includeConfig,
        });
        return { tx: existingTx, won: false };
      }

      // Sempre limpa splits antigos para evitar corrupção de dados ao restaurar
      await tx.transactionSplit.deleteMany({
        where: { transactionId: existingDeletedId },
      });

      const updated = await tx.transaction.update({
        where: { id: existingDeletedId },
        data: {
          entityId,
          userId: scope.actorUserId,
          type: (input.type === 'receita' || input.type === 'despesa') ? input.type : 'despesa',
          description,
          amount: Number(amountMoney.toDecimalString()),
          paymentMethod: input.paymentMethod ?? null,
          transactionDate: txDateDb,
          origin: input.origin ?? 'manual',
          status,
          categoryId: (input.splits && input.splits.length > 0) ? null : categoryId,
          viaPersonalAccount: Boolean(input.viaPersonalAccount),
          splits: (input.splits && input.splits.length > 0)
            ? {
                create: input.splits.map((s, idx) => ({
                  categoryId: s.categoryId,
                  amount: Number(Money.fromDecimalString(String(s.amount)).toDecimalString()),
                  description: s.description?.trim() || null,
                  position: idx,
                })),
              }
            : undefined,
          audits: {
            create: {
              workspaceId: scope.workspaceId,
              actor: scope.actorUserId,
              action: 'restore',
              after: {
                amount: amountMoney.toDecimalString(),
                type: input.type,
                description,
                date: localDate.toIsoDate(),
              },
            },
          },
        },
        include: includeConfig,
      });

      return { tx: updated, won: true };
    });

    created = restoreResult.tx;
    isRestorationWinner = restoreResult.won;
  } else {
    try {
      created = await prisma.transaction.create({
        data: {
          workspaceId: scope.workspaceId,
          entityId,
          userId: scope.actorUserId,
          type: (input.type === 'receita' || input.type === 'despesa') ? input.type : 'despesa',
          description,
          amount: Number(amountMoney.toDecimalString()),
          paymentMethod: input.paymentMethod ?? null,
          transactionDate: txDateDb,
          origin: input.origin ?? 'manual',
          status,
          categoryId: (input.splits && input.splits.length > 0) ? null : categoryId,
          sourceRef: input.sourceRef ?? null,
          viaPersonalAccount: Boolean(input.viaPersonalAccount),
          splits: (input.splits && input.splits.length > 0)
            ? {
                create: input.splits.map((s, idx) => ({
                  categoryId: s.categoryId,
                  amount: Number(Money.fromDecimalString(String(s.amount)).toDecimalString()),
                  description: s.description?.trim() || null,
                  position: idx,
                })),
              }
            : undefined,
          audits: {
            create: {
              workspaceId: scope.workspaceId,
              actor: scope.actorUserId,
              action: 'create',
              after: {
                amount: amountMoney.toDecimalString(),
                type: input.type,
                description,
                date: localDate.toIsoDate(),
              },
            },
          },
        },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          splits: true,
        },
      });
    } catch (err: unknown) {
      const prismaErr = err as { code?: string } | null;
      if (prismaErr?.code === 'P2002' && input.sourceRef) {
        const race = await prisma.transaction.findUnique({
          where: {
            workspaceId_sourceRef: {
              workspaceId: scope.workspaceId,
              sourceRef: input.sourceRef,
            },
          },
          include: {
            category: { select: { id: true, name: true, slug: true } },
            splits: true,
          },
        });
        if (race) {
          return race;
        }
      }
      throw err;
    }
  }

  if (!existingDeletedId || isRestorationWinner) {
    defaultEventBus.publish({
      name: 'transaction.created',
      occurredAt: new Date(),
      payload: {
        workspaceId: scope.workspaceId,
        entityId,
        transactionId: created.id,
        type: created.type,
        amount: amountMoney.toDecimalString(),
        occurredOn: localDate.toIsoDate(),
        status: created.status,
      },
    });
  }

  return created;
}
