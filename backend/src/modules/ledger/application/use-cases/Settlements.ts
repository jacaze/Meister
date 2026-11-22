import type { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../../../config/prisma.js';
import {
  assertCanWrite,
  Money,
  NotFoundError,
  ValidationError,
  type WorkspaceScope,
} from '../../../../shared/index.js';
import { settlementFor } from '../../domain/SettlementRule.js';

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Entidade cujo dinheiro pagou/recebeu o lançamento. Valida que é do workspace. Compatibilidade:
 * `viaPersonalAccount` em lançamento de negócio sem pagador explícito significa "pago com a PF".
 */
export async function resolvePaidByEntityId(
  scope: WorkspaceScope,
  input: {
    readonly entity: { readonly id: string; readonly kind: string };
    readonly paidByEntityId?: string | null;
    readonly viaPersonalAccount?: boolean;
  },
  client: Client = prisma
): Promise<string | null> {
  if (input.paidByEntityId) {
    const payer = await client.entity.findFirst({
      where: { id: input.paidByEntityId, workspaceId: scope.workspaceId, active: true },
      select: { id: true },
    });
    if (!payer) throw new NotFoundError('Entidade pagadora não encontrada no workspace');
    return payer.id;
  }
  if (input.viaPersonalAccount && input.entity.kind !== 'pf') return scope.defaultEntityIds.pf;
  return null;
}

/**
 * Mantém o acerto do lançamento coerente após criar, editar ou apagar:
 * aberto é criado/atualizado/removido; acertado é reaberto se os termos mudaram e cancelado se o
 * lançamento sumiu (o histórico do acerto fica).
 */
export async function syncTransactionSettlement(transactionId: string, client: Client = prisma): Promise<void> {
  const tx = await client.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      workspaceId: true,
      type: true,
      entityId: true,
      paidByEntityId: true,
      amount: true,
      deletedAt: true,
      settlement: true,
    },
  });
  if (!tx) return;
  const existing = tx.settlement;
  const terms = tx.deletedAt
    ? null
    : settlementFor({
        type: tx.type,
        entityId: tx.entityId,
        paidByEntityId: tx.paidByEntityId,
        amount: Money.fromDecimalString(tx.amount.toString()),
      });

  if (!terms) {
    if (!existing) return;
    if (existing.status === 'aberto') {
      await client.settlement.delete({ where: { id: existing.id } });
    } else if (existing.status === 'acertado') {
      await client.settlement.update({ where: { id: existing.id }, data: { status: 'cancelado' } });
    }
    return;
  }

  const data = {
    debtorEntityId: terms.debtorEntityId,
    creditorEntityId: terms.creditorEntityId,
    amount: terms.amount.toDecimalString(),
  };
  if (!existing) {
    await client.settlement.create({ data: { workspaceId: tx.workspaceId, transactionId: tx.id, ...data } });
    return;
  }
  const changed =
    existing.debtorEntityId !== data.debtorEntityId ||
    existing.creditorEntityId !== data.creditorEntityId ||
    !Money.fromDecimalString(existing.amount.toString()).equals(terms.amount);
  if (!changed && existing.status !== 'cancelado') return;
  await client.settlement.update({
    where: { id: existing.id },
    data: { ...data, status: 'aberto', settledVia: null, settledAt: null, settledBy: null },
  });
}

export interface SettlementView {
  readonly id: string;
  readonly transactionId: string;
  readonly debtorEntityId: string;
  readonly creditorEntityId: string;
  readonly amount: string;
  readonly status: string;
  readonly settledVia: string | null;
  readonly settledAt: string | null;
  readonly description: string;
  readonly transactionDate: string;
}

const settlementInclude = { transaction: { select: { description: true, transactionDate: true } } } as const;

function toView(s: Prisma.SettlementGetPayload<{ include: typeof settlementInclude }>): SettlementView {
  return {
    id: s.id,
    transactionId: s.transactionId,
    debtorEntityId: s.debtorEntityId,
    creditorEntityId: s.creditorEntityId,
    amount: Money.fromDecimalString(s.amount.toString()).toDecimalString(),
    status: s.status,
    settledVia: s.settledVia,
    settledAt: s.settledAt ? s.settledAt.toISOString() : null,
    description: s.transaction.description,
    transactionDate: s.transaction.transactionDate.toISOString().slice(0, 10),
  };
}

export async function listSettlements(scope: WorkspaceScope, filter: { readonly status?: string } = {}) {
  const status = filter.status && ['aberto', 'acertado', 'cancelado'].includes(filter.status) ? filter.status : undefined;
  const rows = await prisma.settlement.findMany({
    where: { workspaceId: scope.workspaceId, ...(status ? { status } : {}) },
    include: settlementInclude,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const items = rows.map(toView);

  // Saldo líquido por par de entidades, só com os abertos (A deve a B menos B deve a A)
  const net = new Map<string, bigint>();
  for (const s of rows) {
    if (s.status !== 'aberto') continue;
    const cents = Money.fromDecimalString(s.amount.toString()).cents;
    const [a, b] = [s.debtorEntityId, s.creditorEntityId].sort();
    const key = `${a}|${b}`;
    const sign = s.debtorEntityId === a ? 1n : -1n;
    net.set(key, (net.get(key) ?? 0n) + sign * cents);
  }
  const balances = [...net.entries()]
    .filter(([, cents]) => cents !== 0n)
    .map(([key, cents]) => {
      const [a, b] = key.split('|') as [string, string];
      return cents > 0n
        ? { debtorEntityId: a, creditorEntityId: b, total: Money.fromCents(cents).toDecimalString() }
        : { debtorEntityId: b, creditorEntityId: a, total: Money.fromCents(-cents).toDecimalString() };
    });

  return { items, balances };
}

async function findOwn(scope: WorkspaceScope, id: string) {
  const s = await prisma.settlement.findFirst({ where: { id, workspaceId: scope.workspaceId } });
  if (!s) throw new NotFoundError('Acerto não encontrado.');
  return s;
}

export async function settleSettlement(scope: WorkspaceScope, id: string, via: 'transferencia' | 'abatimento') {
  assertCanWrite(scope);
  const s = await findOwn(scope, id);
  if (s.status === 'cancelado') throw new ValidationError('Este acerto foi cancelado porque o lançamento foi apagado.');
  const updated = await prisma.settlement.update({
    where: { id: s.id },
    data: { status: 'acertado', settledVia: via, settledAt: new Date(), settledBy: scope.actorUserId },
    include: settlementInclude,
  });
  return toView(updated);
}

export async function reopenSettlement(scope: WorkspaceScope, id: string) {
  assertCanWrite(scope);
  const s = await findOwn(scope, id);
  if (s.status === 'cancelado') throw new ValidationError('Este acerto foi cancelado porque o lançamento foi apagado.');
  const updated = await prisma.settlement.update({
    where: { id: s.id },
    data: { status: 'aberto', settledVia: null, settledAt: null, settledBy: null },
    include: settlementInclude,
  });
  return toView(updated);
}
