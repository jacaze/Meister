import prisma from '../../../../config/prisma.js';
import {
  LocalDate,
  Money,
  type WorkspaceScope,
} from '../../../../shared/index.js';
import { ensureDasCharges } from './EnsureDasCharges.js';

export interface ListDasQuery {
  readonly entityId?: string;
  readonly year?: number;
}

export async function listDas(
  scope: WorkspaceScope,
  query: ListDasQuery = {}
) {
  const targetEntityId = query.entityId ?? scope.defaultEntityIds.pj;
  if (!targetEntityId) {
    return {
      items: [],
      totais: { pago: '0.00', pendente: '0.00', atrasado: '0.00' },
      pgmeiUrl: 'https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao',
    };
  }

  // Ensure DAS are generated first
  await ensureDasCharges(scope, targetEntityId);

  const charges = await prisma.dasCharge.findMany({
    where: {
      workspaceId: scope.workspaceId,
      entityId: targetEntityId,
      ...(query.year ? { competence: { startsWith: `${query.year}-` } } : {}),
    },
    orderBy: { competence: 'asc' },
  });

  const today = LocalDate.now();

  let totalPago = Money.zero();
  let totalPendente = Money.zero();
  let totalAtrasado = Money.zero();

  const items = charges.map((c) => {
    const amountMoney = Money.fromDecimalString(c.amount.toString());
    const dueLocalDate = LocalDate.fromIsoDate(c.dueDate.toISOString().slice(0, 10));

    let status = c.status;
    if (status !== 'pago') {
      if (today.isAfter(dueLocalDate)) {
        status = 'atrasado';
      } else {
        status = 'pendente';
      }
    }

    if (status === 'pago') {
      totalPago = totalPago.add(c.paidAmount ? Money.fromDecimalString(c.paidAmount.toString()) : amountMoney);
    } else if (status === 'atrasado') {
      totalAtrasado = totalAtrasado.add(amountMoney);
    } else {
      totalPendente = totalPendente.add(amountMoney);
    }

    return {
      id: c.id,
      entityId: c.entityId,
      competence: c.competence,
      dueDate: dueLocalDate.toIsoDate(),
      amount: amountMoney.toDecimalString(),
      status,
      paidOn: c.paidOn ? c.paidOn.toISOString().slice(0, 10) : null,
      paidAmount: c.paidAmount ? Money.fromDecimalString(c.paidAmount.toString()).toDecimalString() : null,
    };
  });

  return {
    items,
    totais: {
      pago: totalPago.toDecimalString(),
      pendente: totalPendente.toDecimalString(),
      atrasado: totalAtrasado.toDecimalString(),
    },
    pgmeiUrl: 'https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao',
  };
}
