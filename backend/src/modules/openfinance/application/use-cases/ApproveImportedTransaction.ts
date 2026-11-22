import prisma from '../../../../config/prisma.js';
import { NotFoundError, ValidationError, type WorkspaceScope } from '../../../../shared/index.js';
import { createTransaction, setTransactionNonIncome, type NonIncomeReason } from '../../../ledger/public.js';
import { findFallbackCategoryId } from '../../../catalog/public.js';

export interface ApproveImportInput {
  readonly bankTransactionId: string;
  readonly categoryId?: string;
  readonly entityId?: string;
  readonly viaPersonalAccount?: boolean;
  /** "Não é renda": a entrada é registrada como perna única de transferência (fora de receita/potes/limite MEI). */
  readonly nonIncomeReason?: NonIncomeReason;
}

export async function approveImportedTransaction(
  scope: WorkspaceScope,
  input: ApproveImportInput
) {
  const item = await prisma.bankTransaction.findFirst({
    where: {
      id: input.bankTransactionId,
      connection: { workspaceId: scope.workspaceId },
    },
    include: { bankAccount: { select: { entityId: true } } },
  });

  if (!item) {
    throw new NotFoundError('Transação importada não encontrada.');
  }

  if (item.status === 'importada') {
    throw new ValidationError('Esta transação já foi aprovada e lançada anteriormente.');
  }

  // Entidade: a informada, senão a da conta conectada. Conta conectada sem entidade precisa ser classificada antes.
  // Importação de extrato (OFX/CSV) não tem conta e segue o padrão do ledger.
  const entityId = input.entityId ?? item.bankAccount?.entityId ?? undefined;
  if (item.bankAccount && !entityId) {
    throw new ValidationError(
      'Defina de quem é esta conta bancária (pessoal ou empresa) antes de aprovar.',
      undefined,
      'ACCOUNT_ENTITY_REQUIRED'
    );
  }

  // Categoria: a escolhida, senão a sugerida, senão "Outras Despesas/Receitas" do workspace
  // (por slug). Sem ela, o lançamento fica sem categoria; nunca uma categoria arbitrária.
  const type = item.direction === 'in' ? 'receita' : 'despesa';
  if (input.nonIncomeReason && type !== 'receita') {
    throw new ValidationError(
      'Só entradas podem ser marcadas como "não é renda".',
      undefined,
      'NON_INCOME_ONLY_FOR_INCOME'
    );
  }
  const categoryId =
    input.categoryId || item.suggestedCategoryId || (await findFallbackCategoryId(scope, type));

  // 1. Create transaction in ledger
  const tx = await createTransaction(scope, {
    type,
    amount: String(item.amount),
    description: item.description.slice(0, 1000),
    occurredOn: item.occurredOn.toISOString().slice(0, 10),
    categoryId: categoryId || undefined,
    entityId,
    // O dinheiro saiu/entrou na conta conectada; se o gasto for de outra entidade, nasce o acerto
    paidByEntityId: item.bankAccount?.entityId ?? null,
    viaPersonalAccount: input.viaPersonalAccount,
    origin: 'importacao',
    sourceRef: `${item.provider}:${item.externalId}`,
  });

  // 2. "Não é renda": marca pelo caso de uso do ledger. Se falhar, o item segue pendente e a nova
  // tentativa reaproveita o lançamento (idempotente por sourceRef) antes de marcar.
  const result = input.nonIncomeReason
    ? await setTransactionNonIncome(scope, tx.id, { reason: input.nonIncomeReason })
    : tx;

  // 3. Mark bank transaction as imported
  await prisma.bankTransaction.update({
    where: { id: item.id },
    data: {
      status: 'importada',
      importedTransactionId: tx.id,
    },
  });

  return result;
}

export async function ignoreImportedTransaction(
  scope: WorkspaceScope,
  bankTransactionId: string
) {
  const item = await prisma.bankTransaction.findFirst({
    where: {
      id: bankTransactionId,
      connection: { workspaceId: scope.workspaceId },
    },
  });

  if (!item) {
    throw new NotFoundError('Transação importada não encontrada.');
  }

  return prisma.bankTransaction.update({
    where: { id: item.id },
    data: { status: 'ignorada' },
  });
}
