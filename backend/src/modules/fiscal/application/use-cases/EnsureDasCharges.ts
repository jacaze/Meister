import type { DasCharge } from '@prisma/client';
import prisma from '../../../../config/prisma.js';
import {
  DEFAULT_TIMEZONE,
  LocalDate,
  Money,
  SystemClock,
  YearMonth,
  type Clock,
  type WorkspaceScope,
} from '../../../../shared/index.js';
import { DasCalculator, type MeiActivity } from '../../domain/services/DasCalculator.js';
import { DasScheduler } from '../../domain/services/DasScheduler.js';

export interface EnsureDasChargesOptions {
  readonly clock?: Clock;
  readonly timeZone?: string;
}

export interface EnsureDasChargesStats {
  readonly charges: DasCharge[];
  readonly createdCount: number;
  readonly alreadyExistedCount: number;
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Generates missing monthly DAS charges for a single active MEI entity up to the current month.
 */
export async function ensureDasChargesWithStats(
  scope: WorkspaceScope,
  entityId?: string,
  options?: EnsureDasChargesOptions
): Promise<EnsureDasChargesStats> {
  const targetEntityId = entityId ?? scope.defaultEntityIds.pj;
  if (!targetEntityId) {
    return { charges: [], createdCount: 0, alreadyExistedCount: 0 };
  }

  const entity = await prisma.entity.findFirst({
    where: {
      id: targetEntityId,
      workspaceId: scope.workspaceId,
      active: true,
    },
  });

  if (!entity || !entity.isMei) {
    return { charges: [], createdCount: 0, alreadyExistedCount: 0 };
  }

  const clock = options?.clock ?? new SystemClock();
  const timeZone = options?.timeZone ?? DEFAULT_TIMEZONE;
  const currentYm = clock.currentYearMonth(timeZone);

  const startYm = entity.openedOn
    ? YearMonth.fromDate(
        LocalDate.fromParts(
          new Date(entity.openedOn).getUTCFullYear(),
          new Date(entity.openedOn).getUTCMonth() + 1,
          1
        )
      )
    : YearMonth.fromParts(currentYm.year, 1);

  // Generate competencies up to current month
  const competencies: YearMonth[] = [];
  let cur = startYm.isBefore(YearMonth.fromParts(currentYm.year, 1))
    ? YearMonth.fromParts(currentYm.year, 1)
    : startYm;

  while (!cur.isAfter(currentYm)) {
    competencies.push(cur);
    cur = cur.addMonths(1);
  }

  const charges: DasCharge[] = [];
  let createdCount = 0;
  let alreadyExistedCount = 0;

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

    if (existing) {
      charges.push(existing);
      alreadyExistedCount += 1;
      continue;
    }

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

    try {
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
      charges.push(created);
      createdCount += 1;
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        const concurrentExisting = await prisma.dasCharge.findUnique({
          where: {
            entityId_competence: {
              entityId: entity.id,
              competence: compStr,
            },
          },
        });
        if (concurrentExisting) {
          charges.push(concurrentExisting);
          alreadyExistedCount += 1;
          continue;
        }
      }
      throw err;
    }
  }

  return { charges, createdCount, alreadyExistedCount };
}

export async function ensureDasCharges(
  scope: WorkspaceScope,
  entityId?: string,
  options?: EnsureDasChargesOptions
) {
  const result = await ensureDasChargesWithStats(scope, entityId, options);
  return result.charges;
}
