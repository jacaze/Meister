import prisma from '../../../../config/prisma.js';
import {
  LocalDate,
  Money,
  type WorkspaceScope,
} from '../../../../shared/index.js';
import { MeiLimitCalculator, type MeiLimitBand } from '../../domain/services/MeiLimitCalculator.js';

export interface GetMeiLimitQuery {
  readonly entityId?: string;
  readonly year?: number;
}

export interface MeiLimitDto {
  readonly ano: number;
  readonly limite: string;
  readonly limiteComTolerancia: string;
  readonly mesesAtividade: number;
  readonly proporcional: boolean;
  readonly faturamentoAno: string;
  readonly percentualUtilizado: number;
  readonly restante: string;
  readonly status: MeiLimitBand;
  readonly perfilIncompleto: boolean;
  readonly parametrosEstimados: boolean;
}

export async function getMeiLimit(
  scope: WorkspaceScope,
  query: GetMeiLimitQuery = {}
): Promise<MeiLimitDto | null> {
  const currentYear = query.year ?? LocalDate.now().year;

  const targetEntityId = query.entityId ?? scope.defaultEntityIds.pj;
  if (!targetEntityId) {
    return null;
  }

  const entity = await prisma.entity.findFirst({
    where: {
      id: targetEntityId,
      workspaceId: scope.workspaceId,
      active: true,
    },
  });

  if (!entity || !entity.isMei) {
    return null;
  }

  const fiscalParam = await prisma.fiscalParameters.findUnique({
    where: { year: currentYear },
  });

  const fallbackParam = fiscalParam ?? (await prisma.fiscalParameters.findFirst({
    orderBy: { year: 'desc' },
  }));

  const annualLimit = fallbackParam
    ? Money.fromDecimalString(fallbackParam.meiAnnualLimit.toString())
    : Money.fromDecimalString('81000.00');

  const monthlyRef = fallbackParam
    ? Money.fromDecimalString(fallbackParam.meiMonthlyReference.toString())
    : Money.fromDecimalString('6750.00');

  const tolerancePct = fallbackParam
    ? Number(fallbackParam.tolerancePct)
    : 0.2;

  const startOfYear = new Date(Date.UTC(currentYear, 0, 1));
  const endOfYear = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999));

  const txs = await prisma.transaction.findMany({
    where: {
      workspaceId: scope.workspaceId,
      entityId: entity.id,
      type: 'receita',
      status: 'confirmado',
      deletedAt: null,
      transactionDate: {
        gte: startOfYear,
        lte: endOfYear,
      },
    },
    select: { amount: true },
  });

  let totalFaturamento = Money.zero();
  for (const tx of txs) {
    totalFaturamento = totalFaturamento.add(Money.fromDecimalString(tx.amount.toString()));
  }

  let openedOn: { year: number; month: number } | null = null;
  if (entity.openedOn) {
    const d = new Date(entity.openedOn);
    openedOn = {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
    };
  }

  const isProfileComplete = Boolean(entity.cnpj && entity.openedOn && entity.activity);

  const result = MeiLimitCalculator.compute({
    year: currentYear,
    openedOn,
    faturamentoAno: totalFaturamento,
    meiAnnualLimit: annualLimit,
    meiMonthlyReference: monthlyRef,
    tolerancePct,
    isProfileComplete,
  });

  return {
    ano: result.ano,
    limite: result.limite.toDecimalString(),
    limiteComTolerancia: result.limiteComTolerancia.toDecimalString(),
    mesesAtividade: result.mesesAtividade,
    proporcional: result.proporcional,
    faturamentoAno: result.faturamentoAno.toDecimalString(),
    percentualUtilizado: result.percentualUtilizado,
    restante: result.restante.toDecimalString(),
    status: result.status,
    perfilIncompleto: result.perfilIncompleto,
    parametrosEstimados: !fiscalParam,
  };
}
