// Aviso de acerto (tarefa 18): o lançamento é de uma entidade, mas o dinheiro é de outra.
import { entityLabel, type EntityOption } from './bankAccountEntity.ts';

export function settlementHint(
  type: 'receita' | 'despesa',
  owner: EntityOption | undefined,
  payer: EntityOption | undefined
): string | null {
  if (!owner || !payer || owner.id === payer.id) return null;
  const [debtor, creditor] = type === 'despesa' ? [owner, payer] : [payer, owner];
  return `Vai gerar um acerto: ${entityLabel(debtor)} deve a ${entityLabel(creditor)}.`;
}
