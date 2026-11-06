import { z } from 'zod';
import prisma from '../../../../config/prisma.js';
import {
  NotFoundError,
  ValidationError,
  assertCanWrite,
  type WorkspaceScope,
} from '../../../../shared/index.js';

export const updateJarPlanBaseModeSchema = z.object({
  baseMode: z.enum(['mes_atual', 'mes_anterior', 'media_3_meses']),
});

export type UpdateJarPlanBaseModeInput = z.infer<typeof updateJarPlanBaseModeSchema>;

/**
 * Troca só a base de cálculo do plano ativo, preservando potes, vínculos de categoria e saldo
 * acumulado (recriar o plano para isso apagava a configuração da pessoa).
 */
export async function updateJarPlanBaseMode(
  scope: WorkspaceScope,
  planId: string,
  input: unknown
) {
  assertCanWrite(scope);

  const parsed = updateJarPlanBaseModeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('Base de cálculo inválida. Use mes_atual, mes_anterior ou media_3_meses');
  }

  const plan = await prisma.jarPlan.findFirst({
    where: { id: planId, workspaceId: scope.workspaceId, active: true },
  });
  if (!plan) {
    throw new NotFoundError('Plano de potes não encontrado');
  }

  const updated = await prisma.jarPlan.update({
    where: { id: plan.id },
    data: { baseMode: parsed.data.baseMode },
  });

  return { id: updated.id, baseMode: updated.baseMode };
}
