import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import type { UserDataExport, ConsentKind } from '../../domain/ComplianceTypes.js';
import { writeAuditLog } from './WriteAuditLog.js';

export async function exportUserData(scope: WorkspaceScope): Promise<UserDataExport> {
  const user = await prisma.user.findUnique({
    where: { id: scope.actorUserId },
    include: {
      memberships: {
        include: {
          workspace: {
            include: {
              entities: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new Error('Usuário não encontrado.');
  }

  // 1. Transactions
  const transactions = await prisma.transaction.findMany({
    where: { workspaceId: scope.workspaceId },
    include: { category: true },
    orderBy: { transactionDate: 'desc' },
  });

  // 2. Categories
  const categories = await prisma.category.findMany({
    where: { workspaceId: scope.workspaceId },
    orderBy: { name: 'asc' },
  });

  // 3. Jars
  const jars = await prisma.jar.findMany({
    where: { plan: { workspaceId: scope.workspaceId } },
  });

  // 4. DAS Charges
  const dasCharges = await prisma.dasCharge.findMany({
    where: { workspaceId: scope.workspaceId },
    orderBy: { competence: 'desc' },
  });

  // 5. Lessons Progress
  const lessonProgress = await prisma.lessonProgress.findMany({
    where: { userId: scope.actorUserId },
  });

  // 6. Consents
  const consents = await prisma.userConsent.findMany({
    where: { userId: scope.actorUserId },
  });

  await writeAuditLog({
    workspaceId: scope.workspaceId,
    userId: scope.actorUserId,
    actor: user.email,
    action: 'compliance.export',
    target: user.id,
  });

  return {
    exportedAt: new Date().toISOString(),
    legalDisclaimer:
      'Exportação de dados pessoais e transacionais gerada conforme os princípios da LGPD (Lei Geral de Proteção de Dados, Lei nº 13.709/2018). Todos os segredos e credenciais de autenticação foram omitidos por motivos de segurança.',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      accountType: user.accountType,
      timezone: user.timezone,
      createdAt: user.createdAt.toISOString(),
    },
    workspaces: user.memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      entities: m.workspace.entities.map((e) => ({
        id: e.id,
        kind: e.kind,
        name: e.name,
        cnpj: e.cnpj,
        legalName: e.legalName,
        tradeName: e.tradeName,
        isMei: e.isMei,
      })),
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      entityId: t.entityId,
      type: t.type,
      amount: String(t.amount),
      description: t.description,
      transactionDate: t.transactionDate.toISOString().slice(0, 10),
      paymentMethod: t.paymentMethod,
      categoryName: t.category?.name ?? null,
      status: t.status,
      viaPersonalAccount: t.viaPersonalAccount,
    })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      slug: c.slug,
    })),
    jars: jars.map((j) => ({
      id: j.id,
      name: j.name,
      slug: j.slug,
      percent: j.percent ? Number(j.percent) : null,
      fixedAmount: j.fixedAmount ? String(j.fixedAmount) : null,
      rollover: j.rollover,
    })),
    dasCharges: dasCharges.map((d) => ({
      id: d.id,
      competence: d.competence,
      amount: String(d.amount),
      status: d.status,
      dueDate: d.dueDate.toISOString().slice(0, 10),
    })),
    lessonProgress: lessonProgress.map((lp) => ({
      lessonSlug: lp.lessonSlug,
      status: lp.status,
      quizScore: lp.quizScore,
      completedAt: lp.completedAt ? lp.completedAt.toISOString() : null,
    })),
    consents: consents.map((c) => ({
      kind: c.kind as ConsentKind,
      version: c.version,
      accepted: c.accepted,
      acceptedAt: c.createdAt.toISOString(),
      ipAddress: c.ipAddress,
    })),
  };
}
