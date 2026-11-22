import prisma from '../../../../config/prisma.js';
import { assertOwner, ValidationError, type WorkspaceScope } from '../../../../shared/index.js';
import { seedDefaultCategories } from '../../../catalog/public.js';

export type WorkspaceProfile = 'individual' | 'negocio' | 'familia' | 'familia_negocio';
export type BusinessType = 'mei' | 'pj' | 'autonomo';

export interface CompleteOnboardingInput {
  readonly profile: WorkspaceProfile;
  // Negócios a ADICIONAR; os que já existem são mantidos
  readonly businesses: ReadonlyArray<{ readonly type: BusinessType; readonly name: string }>;
}

const PROFILES_WITH_BUSINESS: ReadonlySet<WorkspaceProfile> = new Set(['negocio', 'familia_negocio']);

function entityData(type: BusinessType) {
  if (type === 'autonomo') return { kind: 'autonomo', isMei: false };
  return { kind: 'pj', isMei: type === 'mei' };
}

/**
 * Configura o workspace conforme o caso escolhido (tarefa 17): cria as entidades dos negócios e marca o
 * onboarding como concluído. Autônomo é entidade própria, sem regras de MEI. Família só registra o
 * perfil; o convite do cônjuge é a tarefa 15.
 */
export async function completeOnboarding(scope: WorkspaceScope, input: CompleteOnboardingInput) {
  assertOwner(scope);

  const existing = await prisma.entity.findMany({
    where: { workspaceId: scope.workspaceId, active: true },
    select: { kind: true, name: true, isMei: true },
  });
  const isDuplicate = (type: BusinessType, name: string) => {
    const { kind } = entityData(type);
    return existing.some((e) => e.kind === kind && e.name.trim().toLowerCase() === name.trim().toLowerCase());
  };
  const toCreate = input.businesses.filter((b, i, all) =>
    !isDuplicate(b.type, b.name) &&
    all.findIndex((o) => o.type === b.type && o.name.trim().toLowerCase() === b.name.trim().toLowerCase()) === i
  );

  const businessCount = existing.filter((e) => e.kind !== 'pf').length + toCreate.length;
  if (PROFILES_WITH_BUSINESS.has(input.profile) && businessCount === 0) {
    throw new ValidationError('Informe ao menos um negócio (MEI, empresa ou atividade autônoma).');
  }

  const workspace = await prisma.$transaction(async (tx) => {
    for (const business of toCreate) {
      await tx.entity.create({
        data: {
          workspaceId: scope.workspaceId,
          name: business.name.trim(),
          ownerUserId: scope.actorUserId,
          active: true,
          ...entityData(business.type),
        },
      });
    }
    const current = await tx.workspace.findUniqueOrThrow({
      where: { id: scope.workspaceId },
      select: { onboardingCompletedAt: true },
    });
    return tx.workspace.update({
      where: { id: scope.workspaceId },
      data: { profile: input.profile, onboardingCompletedAt: current.onboardingCompletedAt ?? new Date() },
      select: { id: true, profile: true, onboardingCompletedAt: true },
    });
  });

  if (toCreate.length > 0) {
    // Categorias de negócio (idempotente: só cria as que faltam)
    await seedDefaultCategories({ workspaceId: scope.workspaceId, userId: scope.actorUserId, isMei: true });
  }
  await syncLegacyAccountType(scope);

  return { profile: workspace.profile, onboardingCompleted: true };
}

/** Mantém user.accountType (usado por telas antigas, como o atalho do DAS) coerente com as entidades. */
export async function syncLegacyAccountType(scope: WorkspaceScope) {
  const hasMei = await prisma.entity.count({
    where: { workspaceId: scope.workspaceId, kind: 'pj', isMei: true, active: true },
  });
  await prisma.user.update({
    where: { id: scope.actorUserId },
    data: { accountType: hasMei > 0 ? 'mei' : 'pessoa_fisica' },
  });
}
