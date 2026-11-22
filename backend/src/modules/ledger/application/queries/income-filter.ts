import type { Prisma } from '@prisma/client';
import { NON_INCOME_REASONS } from '../../domain/NonIncome.js';

/**
 * Filtro para leituras de receita que não usam `transfer_group_id`: tira as entradas "não é renda".
 * `transfer_type` é nulo nas receitas comuns, e NOT/notIn sozinho descartaria essas linhas no SQL.
 */
export function excludeNonIncomeWhere(): Prisma.TransactionWhereInput {
  return { OR: [{ transferType: null }, { transferType: { notIn: [...NON_INCOME_REASONS] } }] };
}
