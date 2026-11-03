import prisma from '../../../../config/prisma.js';
import {
  LocalDate,
  Money,
  YearMonth,
  type WorkspaceScope,
} from '../../../../shared/index.js';
import { DasCalculator, type MeiActivity } from '../../domain/services/DasCalculator.js';
import { DasScheduler } from '../../domain/services/DasScheduler.js';

export async function ensureDasCharges(
  scope: WorkspaceScope,
  entityId?: string
) {
  const targetEntityId = entityId ?? scope.defaultEntityIds.pj;
  if (!targetEntityId) {
    return [];
  }

  const entity = await prisma.entity.findFirst({
    where: {
      id: targetEntityId,
      workspaceId: scope.workspaceId,
      active: true,
    },
  });

  if (!entity || !entity.isMei) {
    return [];
  }

  const currentYm = YearMonth.fromDate(LocalDate.now());
  const startYm = entity.openedOn
    ? YearMonth.fromDate(LocalDate.fromParts(
        new Date(entity.openedOn).getUTCFullYear(),
        new Date(entity.openedOn).getUTCMonth() + 1,
        1
      ))
    : YearMonth.fromParts(currentYm.year, 1);

  // Generate competencies up to current month (or previous month)
  const competencies: YearMonth[] = [];
  let cur = startYm.isBefore(YearMonth.fromParts(currentYm.year, 1))
    ? YearMonth.fromParts(currentYm.year, 1)
    : startYm;

  while (!cur.isAfter(currentYm)) {
    competencies.push(cur);
    cur = cur.addMonths(1);
  }

  const createdCharges = [];

  for (const comp of competencies) {
    const compStr = comp.toIsoString();
    const existing = await prisma.dasCharge.findUnique({
      where: {
        entityId_competence: {
          entityId: entity.id,
          competence: compStr,
        },
      },
    });

    if (!existing) {
      const fiscalParam = await prisma.fiscalParameters.findUnique({
        where: { year: comp.year },
      });
      const minWage = fiscalParam
        ? Money.fromDecimalString(fiscalParam.minimumWage.toString())
        : Money.fromDecimalString('1621.00');

      const amount = DasCalculator.compute((entity.activity as MeiActivity) || 'servicos', {
        minimumWage: minWage,
        inssPct: fiscalParam ? Number(fiscalParam.inssPct) : 0.05,
        icmsAmount: fiscalParam ? Money.fromDecimalString(fiscalParam.icmsAmount.toString()) : undefined,
        issAmount: fiscalParam ? Money.fromDecimalString(fiscalParam.issAmount.toString()) : undefined,
      });

      const dueDate = DasScheduler.getDueDate(compStr);

      const created = await prisma.dasCharge.create({
        data: {
          workspaceId: scope.workspaceId,
          entityId: entity.id,
          competence: compStr,
          dueDate: new Date(`${dueDate.toIsoDate()}T00:00:00.000Z`),
          amount: Number(amount.toDecimalString()),
          status: 'pendente',
        },
      });
      createdCharges.push(created);
    } else {
      createdCharges.push(existing);
    }
  }

  return createdCharges;
}
