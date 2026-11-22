import type { Prisma } from '@prisma/client';

/**
 * Filtro de "lançamentos válidos" para toda leitura que soma, conta ou lista transactions fora do ledger:
 * exclui apagados (soft delete) e os que ainda não foram confirmados (pendentes de revisão).
 * Combine com `excludeNonIncomeWhere()` via spread; ambos são compatíveis (só este não usa OR).
 */
export function validTransactionsWhere(): Prisma.TransactionWhereInput {
  return { deletedAt: null, status: 'confirmado' };
}
