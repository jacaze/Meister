import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';

export interface ProvisionWorkspaceInput {
  readonly userId: string;
  readonly accountType?: 'mei' | 'pessoa_fisica';
  readonly workspaceName?: string;
  // Falso no cadastro pela tela nova: o perfil é escolhido depois, no onboarding (tarefa 17)
  readonly completeOnboarding?: boolean;
}

export interface ProvisionWorkspaceResult {
  readonly scope: WorkspaceScope;
  readonly workspaceId: string;
  readonly pfEntityId: string;
  readonly pjEntityId?: string;
}

export async function provisionWorkspace(
  input: ProvisionWorkspaceInput,
  client = prisma
): Promise<ProvisionWorkspaceResult> {
  const name = input.workspaceName?.trim() || 'Meu Workspace';
  const isMei = input.accountType === 'mei';
  const completeOnboarding = input.completeOnboarding ?? true;

  const workspace = await client.workspace.create({
    data: {
      name,
      plan: 'free',
      profile: completeOnboarding ? (isMei ? 'negocio' : 'individual') : null,
      onboardingCompletedAt: completeOnboarding ? new Date() : null,
      members: {
        create: {
          userId: input.userId,
          role: 'owner',
        },
      },
      entities: {
        create: [
          {
            kind: 'pf',
            name: 'Pessoal',
            ownerUserId: input.userId,
            active: true,
          },
          ...(isMei
            ? [
                {
                  kind: 'pj',
                  name: 'Meu MEI',
                  isMei: true,
                  ownerUserId: input.userId,
                  active: true,
                },
              ]
            : []),
        ],
      },
    },
    include: {
      entities: true,
    },
  });

  const pf = workspace.entities.find((e) => e.kind === 'pf')!;
  const pj = workspace.entities.find((e) => e.kind === 'pj');

  const scope: WorkspaceScope = {
    workspaceId: workspace.id,
    actorUserId: input.userId,
    role: 'owner',
    defaultEntityIds: {
      pf: pf.id,
      ...(pj ? { pj: pj.id } : {}),
    },
  };

  return {
    scope,
    workspaceId: workspace.id,
    pfEntityId: pf.id,
    pjEntityId: pj?.id,
  };
}
