import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { ConflictError, SystemClock, ValidationError, type Clock, type WorkspaceScope } from '../shared/index.js';
import { provisionWorkspace, resolveScopeForUser, updateBusinessProfile } from '../modules/workspace/public.js';
import { listCategories, seedDefaultCategories } from '../modules/catalog/public.js';
import { createJarPlan } from '../modules/jars/public.js';
import { ensureDasCharges, getMeiLimit, markDasPaid } from '../modules/fiscal/public.js';
import {
  createTransaction,
  deleteTransaction,
  listSettlements,
  registerOwnerWithdrawal,
  settleSettlement,
} from '../modules/ledger/public.js';
import { runDetectors } from '../modules/insights/public.js';
import { buildDemoScenario } from './demo-scenario.js';

// Seed de demonstração para o servidor (Docker): roda com `node dist/scripts/seed-demo.js`, sem tsx.
// Credenciais vêm só do ambiente; nada de usuário/senha no código. Escrita de lançamentos só via ledger.

const MIN_PASSWORD_LENGTH = 10;
// CNPJ de demonstração com dígitos verificadores válidos
const DEMO_CNPJ = '33000167000101';

export interface SeedDemoConfig {
  readonly email: string;
  readonly password: string;
  readonly name: string;
  readonly reset: boolean;
}

export interface SeedDemoSummary {
  readonly workspaceId: string;
  readonly openedOn: string;
  readonly mesesAtividade: number;
  readonly proporcional: boolean;
  readonly percentualUtilizado: number;
  readonly status: string;
  readonly lancamentosNovos: number;
  readonly lancamentosTotal: number;
  readonly dasTotal: number;
  readonly proLabores: number;
  readonly acertosAbertos: number;
  readonly acertosAcertados: number;
  readonly insightsPj: number;
  readonly insightsPf: number;
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Valida variáveis e flags. Nunca devolve nem imprime a senha em mensagens de erro.
 * Exige confirmação explícita (--confirm ou SEED_DEMO=1) para não rodar por acidente.
 */
export function parseSeedDemoConfig(env: Env, argv: readonly string[]): SeedDemoConfig {
  const email = env.DEMO_USER_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError('DEMO_USER_EMAIL é obrigatória e deve ser um e-mail válido');
  }
  const password = env.DEMO_USER_PASSWORD;
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`DEMO_USER_PASSWORD é obrigatória e deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (!argv.includes('--confirm') && env.SEED_DEMO !== '1') {
    throw new ValidationError('Confirmação ausente: rode com --confirm (ou SEED_DEMO=1) para semear a demonstração');
  }
  const reset = argv.includes('--reset');
  if (reset && !argv.includes('--confirm-reset')) {
    throw new ValidationError('--reset apaga o workspace da demo: confirme com --confirm-reset');
  }
  return { email, password, name: env.DEMO_USER_NAME?.trim() || 'Lucas MEI', reset };
}

/** Parâmetros fiscais: único caminho de produção para eles (a migration não os insere). */
export async function seedFiscalParameters(clock: Clock = new SystemClock()): Promise<void> {
  const base = {
    meiAnnualLimit: '81000.00',
    meiMonthlyReference: '6750.00',
    tolerancePct: '0.2000',
    icmsAmount: '1.00',
    issAmount: '5.00',
    inssPct: '0.0500',
  };
  const wages: Record<number, string> = { 2025: '1518.00', 2026: '1621.00' };
  const currentYear = clock.today().year;
  const years = [...new Set([2025, 2026, currentYear])];
  for (const year of years) {
    const data = { year, ...base, minimumWage: wages[year] ?? wages[2026]! };
    await prisma.fiscalParameters.upsert({ where: { year }, create: data, update: data });
  }
}

async function resetDemoWorkspace(email: string): Promise<void> {
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
  if (!user) return;
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    include: { workspace: { include: { members: true } } },
  });
  // Só apaga workspace em que a demo é a única pessoa: nunca atinge dados de terceiros
  const ids = memberships
    .filter((m) => m.workspace.members.every((member) => member.userId === user.id))
    .map((m) => m.workspaceId);
  await prisma.$transaction([
    prisma.workspace.deleteMany({ where: { id: { in: ids } } }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);
}

async function ensureDemoUserAndScope(config: SeedDemoConfig): Promise<WorkspaceScope> {
  let user = await prisma.user.findFirst({ where: { email: { equals: config.email, mode: 'insensitive' } } });

  if (!user) {
    const passwordHash = await bcrypt.hash(config.password, 10);
    user = await prisma.user.create({
      data: {
        name: config.name,
        email: config.email,
        passwordHash,
        accountType: 'mei',
        emailVerifiedAt: new Date(),
      },
    });
    const provision = await provisionWorkspace({
      userId: user.id,
      accountType: 'mei',
      workspaceName: 'Workspace Demonstração',
    });
    await seedDefaultCategories({ workspaceId: provision.workspaceId, userId: user.id, isMei: true });
  }

  const scope = await resolveScopeForUser(user.id);
  if (!scope.defaultEntityIds.pj) {
    throw new ConflictError(
      'DEMO_USER_NOT_MEI',
      'O usuário informado já existe e não tem MEI: use outro DEMO_USER_EMAIL ou rode com --reset --confirm-reset'
    );
  }
  // Garante categorias mesmo se o usuário veio de uma execução interrompida
  await seedDefaultCategories({ workspaceId: scope.workspaceId, userId: user.id, isMei: true });
  return scope;
}

async function ensureAccountsAndJars(scope: WorkspaceScope, pjEntityId: string): Promise<void> {
  const accounts = [
    { entityId: pjEntityId, name: 'Conta PJ', openingBalance: '5000.00' },
    { entityId: scope.defaultEntityIds.pf, name: 'Conta PF', openingBalance: '1200.00' },
  ];
  for (const account of accounts) {
    const existing = await prisma.financialAccount.findFirst({
      where: { workspaceId: scope.workspaceId, entityId: account.entityId },
    });
    if (!existing) {
      await prisma.financialAccount.create({
        data: { workspaceId: scope.workspaceId, kind: 'banco', institution: 'Banco Demo', ...account },
      });
    }
  }

  const plan = await prisma.jarPlan.findFirst({ where: { workspaceId: scope.workspaceId, active: true } });
  if (!plan) {
    await createJarPlan(scope, { templateSlug: 'mei-empresa', entityId: pjEntityId });
  }
}

// Execuções antigas do seed lançavam o DAS à parte (demo:das:*); remove-as pelo ledger para não duplicar
async function removeLegacyDemoDasEntries(scope: WorkspaceScope): Promise<void> {
  const legacy = await prisma.transaction.findMany({
    where: { workspaceId: scope.workspaceId, sourceRef: { startsWith: 'demo:das:' }, deletedAt: null },
    select: { id: true },
  });
  for (const tx of legacy) {
    await deleteTransaction(scope, tx.id);
  }
}

export async function seedDemo(config: SeedDemoConfig, clock: Clock = new SystemClock()): Promise<SeedDemoSummary> {
  const today = clock.today();
  await seedFiscalParameters(clock);

  if (config.reset) {
    await resetDemoWorkspace(config.email);
  }

  const scope = await ensureDemoUserAndScope(config);
  const pjEntityId = scope.defaultEntityIds.pj!;
  const scenario = buildDemoScenario(today);

  // Perfil do MEI: só preenche se ainda não houver CNPJ (não sobrescreve nada existente)
  const pj = await prisma.entity.findFirst({ where: { id: pjEntityId, workspaceId: scope.workspaceId } });
  if (!pj?.cnpj) {
    await updateBusinessProfile(scope, {
      entityId: pjEntityId,
      cnpj: DEMO_CNPJ,
      legalName: 'Lucas MEI Soluções Tecnológicas',
      openedOn: scenario.openedOn.toIsoDate(),
      activity: 'servicos',
    });
  }

  await ensureAccountsAndJars(scope, pjEntityId);

  // DAS do ano até o mês corrente; meses já encerrados entram como pagos
  const charges = await ensureDasCharges(scope, pjEntityId, { clock });
  const currentCompetence = today.yearMonth().toIsoString();
  for (const charge of charges) {
    if (charge.competence >= currentCompetence) continue;
    const dueDate = charge.dueDate.toISOString().slice(0, 10);
    const paidOn = dueDate > today.toIsoDate() ? today.toIsoDate() : dueDate;
    // Marcar como pago já lança a despesa DAS no ledger (idempotente por das:<id>); não lançar à parte
    await markDasPaid(scope, { dasId: charge.id, paidOn });
  }
  await removeLegacyDemoDasEntries(scope);

  // Lançamentos: sempre pelo ledger, idempotentes pelo sourceRef
  const categories = await listCategories(scope);
  const categoryId = (type: string, slug: string): string => {
    const found = categories.find((c) => c.type === type && c.slug === slug);
    if (!found) throw new ConflictError('DEMO_CATEGORY_MISSING', `Categoria padrão ausente: ${slug}`);
    return found.id;
  };

  const all = [...scenario.entries];
  const refs = all.map((e) => e.key);
  const existing = await prisma.transaction.findMany({
    where: { workspaceId: scope.workspaceId, sourceRef: { in: refs }, deletedAt: null },
    select: { sourceRef: true },
  });
  const already = new Set(existing.map((t) => t.sourceRef));
  let created = 0;
  for (const entry of all) {
    if (already.has(entry.key)) continue;
    const tx = await createTransaction(scope, {
      entityId: entry.entity === 'pj' ? pjEntityId : scope.defaultEntityIds.pf,
      type: entry.type,
      amount: entry.amount.toDecimalString(),
      description: entry.description,
      occurredOn: entry.date.toIsoDate(),
      categoryId: categoryId(entry.type, entry.categorySlug),
      paymentMethod: entry.paymentMethod,
      origin: 'manual',
      sourceRef: entry.key,
      ...(entry.paidByPf ? { paidByEntityId: scope.defaultEntityIds.pf } : {}),
    });
    created += 1;
    if (entry.settled) {
      // Caso já quitado: só quita ao criar, para um rerun nunca desfazer o que o usuário reabriu
      const { items } = await listSettlements(scope, { status: 'aberto' });
      const open = items.find((s) => s.transactionId === tx.id);
      if (open) await settleSettlement(scope, open.id, 'transferencia');
    }
  }

  // Pró-labore: retirada do dono pelo ledger (despesa na PJ + receita na PF com o mesmo transferGroupId)
  for (const w of scenario.withdrawals) {
    const done = await prisma.transaction.count({
      where: {
        workspaceId: scope.workspaceId,
        entityId: pjEntityId,
        transferType: 'pro_labore',
        transactionDate: new Date(`${w.date.toIsoDate()}T00:00:00.000Z`),
        deletedAt: null,
      },
    });
    if (done > 0) continue;
    await registerOwnerWithdrawal(scope, {
      amount: w.amount.toDecimalString(),
      occurredOn: w.date.toIsoDate(),
      description: w.description,
    });
    created += 2;
  }

  // Insights das duas entidades, para a tela já abrir com conteúdo
  const referenceDate = new Date(`${today.toIsoDate()}T12:00:00.000Z`);
  const insightsPj = (await runDetectors(scope, { entityId: pjEntityId, referenceDate })).length;
  const insightsPf = (await runDetectors(scope, { entityId: scope.defaultEntityIds.pf, referenceDate })).length;

  const limit = await getMeiLimit(scope);
  const total = await prisma.transaction.count({ where: { workspaceId: scope.workspaceId, deletedAt: null } });
  const dasTotal = await prisma.dasCharge.count({ where: { workspaceId: scope.workspaceId } });

  return {
    workspaceId: scope.workspaceId,
    openedOn: scenario.openedOn.toIsoDate(),
    mesesAtividade: limit?.mesesAtividade ?? 0,
    proporcional: limit?.proporcional ?? false,
    percentualUtilizado: limit?.percentualUtilizado ?? 0,
    status: limit?.status ?? 'ok',
    lancamentosNovos: created,
    lancamentosTotal: total,
    dasTotal,
    proLabores: scenario.withdrawals.length,
    acertosAbertos: await prisma.settlement.count({ where: { workspaceId: scope.workspaceId, status: 'aberto' } }),
    acertosAcertados: await prisma.settlement.count({ where: { workspaceId: scope.workspaceId, status: 'acertado' } }),
    insightsPj,
    insightsPf,
  };
}

async function main(): Promise<void> {
  await import('dotenv/config');
  const config = parseSeedDemoConfig(process.env, process.argv.slice(2));
  const summary = await seedDemo(config);
  // Sem valores financeiros, e-mail ou senha no log: só contagens e o percentual do limite
  console.log(
    `Demo pronta: ${summary.lancamentosNovos} lançamentos novos (${summary.lancamentosTotal} no total), ` +
      `${summary.dasTotal} DAS, ${summary.proLabores} pró-labores, ` +
      `${summary.acertosAbertos} acerto(s) em aberto e ${summary.acertosAcertados} acertado(s), ${summary.insightsPj} insights da PJ e ${summary.insightsPf} da PF, abertura em ${summary.openedOn}, ` +
      `${summary.mesesAtividade} meses de atividade${summary.proporcional ? ' (limite proporcional)' : ''}, ` +
      `${summary.percentualUtilizado}% do limite (${summary.status}).`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err: unknown) => {
      // Mensagens de configuração/negócio são seguras; erro inesperado não vaza detalhes
      const known = err instanceof ValidationError || err instanceof ConflictError;
      console.error(known ? `Seed da demo abortado: ${(err as Error).message}` : 'Seed da demo falhou por erro inesperado.');
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
