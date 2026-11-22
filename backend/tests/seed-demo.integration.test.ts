import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import prisma from '../src/config/prisma.js';
import { LocalDate } from '../src/shared/index.js';
import { getMeiLimit } from '../src/modules/fiscal/public.js';
import { createTransaction } from '../src/modules/ledger/public.js';
import { resolveScopeForUser } from '../src/modules/workspace/public.js';
import { parseSeedDemoConfig, seedDemo } from '../src/scripts/seed-demo.js';

const runId = Date.now();
const email = `demo_seed_${runId}@test.com`;
// Senha gerada em tempo de execução: nada fixo no repositório
const password = `Dm${runId}-${Math.random().toString(36).slice(2, 12)}`;
const env = { DEMO_USER_EMAIL: email, DEMO_USER_PASSWORD: password };

async function limpar() {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) return;
  const members = await prisma.workspaceMember.findMany({ where: { userId: user.id } });
  await prisma.workspace.deleteMany({ where: { id: { in: members.map((m) => m.workspaceId) } } });
  await prisma.user.delete({ where: { id: user.id } });
}

describe('seed de demonstração (servidor)', () => {
  beforeAll(limpar);
  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  describe('configuração', () => {
    it('recusa sem DEMO_USER_EMAIL e DEMO_USER_PASSWORD', () => {
      expect(() => parseSeedDemoConfig({}, ['--confirm'])).toThrow(/DEMO_USER_EMAIL/);
      expect(() => parseSeedDemoConfig({ DEMO_USER_EMAIL: email }, ['--confirm'])).toThrow(/DEMO_USER_PASSWORD/);
    });

    it('recusa senha curta sem vazar a senha na mensagem', () => {
      const curta = 'abc12345';
      try {
        parseSeedDemoConfig({ DEMO_USER_EMAIL: email, DEMO_USER_PASSWORD: curta }, ['--confirm']);
        expect.unreachable();
      } catch (err) {
        expect((err as Error).message).not.toContain(curta);
        expect((err as Error).message).toMatch(/DEMO_USER_PASSWORD/);
      }
    });

    it('recusa sem confirmação explícita (--confirm ou SEED_DEMO=1)', () => {
      expect(() => parseSeedDemoConfig(env, [])).toThrow(/--confirm/);
      expect(parseSeedDemoConfig({ ...env, SEED_DEMO: '1' }, []).email).toBe(email);
      expect(parseSeedDemoConfig(env, ['--confirm']).reset).toBe(false);
    });

    it('--reset exige --confirm-reset', () => {
      expect(() => parseSeedDemoConfig(env, ['--confirm', '--reset'])).toThrow(/--confirm-reset/);
      expect(parseSeedDemoConfig(env, ['--confirm', '--reset', '--confirm-reset']).reset).toBe(true);
    });
  });

  describe('cenário', () => {
    it('cria MEI com limite proporcional em ~75%, DAS e potes; 2ª execução não duplica', async () => {
      const config = parseSeedDemoConfig(env, ['--confirm']);
      const first = await seedDemo(config);

      const user = await prisma.user.findFirstOrThrow({ where: { email } });
      expect(user.emailVerifiedAt).not.toBeNull();
      const scope = await resolveScopeForUser(user.id);

      const limit = await getMeiLimit(scope);
      expect(limit).not.toBeNull();
      expect(limit!.proporcional).toBe(true);
      expect(limit!.perfilIncompleto).toBe(false);
      expect(limit!.parametrosEstimados).toBe(false);
      expect(limit!.percentualUtilizado).toBeGreaterThanOrEqual(74.9);
      expect(limit!.percentualUtilizado).toBeLessThanOrEqual(75.1);
      expect(limit!.status).toBe('ok');

      const contar = async () => ({
        tx: await prisma.transaction.count({ where: { workspaceId: scope.workspaceId } }),
        das: await prisma.dasCharge.count({ where: { workspaceId: scope.workspaceId } }),
        jarPlans: await prisma.jarPlan.count({ where: { workspaceId: scope.workspaceId } }),
        accounts: await prisma.financialAccount.count({ where: { workspaceId: scope.workspaceId } }),
        users: await prisma.user.count({ where: { email } }),
      });
      const before = await contar();
      expect(before.tx).toBeGreaterThan(60);
      expect(before.das).toBe(limit!.mesesAtividade - (12 - LocalDate.now().month));
      expect(before.jarPlans).toBe(1);
      expect(first.workspaceId).toBe(scope.workspaceId);

      const pf = await prisma.transaction.count({
        where: { workspaceId: scope.workspaceId, entityId: scope.defaultEntityIds.pf },
      });
      const pj = await prisma.transaction.count({
        where: { workspaceId: scope.workspaceId, entityId: scope.defaultEntityIds.pj! },
      });
      expect(pf).toBeGreaterThan(0);
      expect(pj).toBeGreaterThan(0);

      const pagos = await prisma.dasCharge.count({ where: { workspaceId: scope.workspaceId, status: 'pago' } });
      expect(pagos).toBeGreaterThan(0);

      await seedDemo(config);
      expect(await contar()).toEqual(before);
    });

    it('um lançamento de ~6% do limite pelo ledger leva a faixa de atenção (>= 80%)', async () => {
      const user = await prisma.user.findFirstOrThrow({ where: { email } });
      const scope = await resolveScopeForUser(user.id);
      const cat = await prisma.category.findFirstOrThrow({
        where: { workspaceId: scope.workspaceId, type: 'receita', slug: 'prestacao-servicos' },
      });
      await createTransaction(scope, {
        entityId: scope.defaultEntityIds.pj!,
        type: 'receita',
        amount: '4000.00',
        description: 'Venda simulando lançamento pelo Telegram',
        occurredOn: LocalDate.now().toIsoDate(),
        categoryId: cat.id,
      });
      const limit = await getMeiLimit(scope);
      expect(limit!.status).toBe('atencao');
    });

    it('--reset apaga só o workspace da demo e recria o cenário', async () => {
      const user = await prisma.user.findFirstOrThrow({ where: { email } });
      const antes = await resolveScopeForUser(user.id);
      const outro = await prisma.workspace.create({ data: { name: `Outro ${runId}` } });

      await seedDemo(parseSeedDemoConfig(env, ['--confirm', '--reset', '--confirm-reset']));

      const userDepois = await prisma.user.findFirstOrThrow({ where: { email } });
      const depois = await resolveScopeForUser(userDepois.id);
      expect(depois.workspaceId).not.toBe(antes.workspaceId);
      expect(await prisma.workspace.findUnique({ where: { id: antes.workspaceId } })).toBeNull();
      expect(await prisma.workspace.findUnique({ where: { id: outro.id } })).not.toBeNull();
      const limit = await getMeiLimit(depois);
      expect(limit!.percentualUtilizado).toBeLessThanOrEqual(75.1);

      await prisma.workspace.delete({ where: { id: outro.id } });
    });

    it('recusa assumir um usuário existente que não tem MEI (não é a demo)', async () => {
      const pfEmail = `demo_pf_${runId}@test.com`;
      const u = await prisma.user.create({
        data: { name: 'PF', email: pfEmail, passwordHash: 'x', accountType: 'pessoa_fisica' },
      });
      await expect(
        seedDemo(parseSeedDemoConfig({ ...env, DEMO_USER_EMAIL: pfEmail }, ['--confirm']))
      ).rejects.toThrow(/MEI/);
      await prisma.user.delete({ where: { id: u.id } });
    });
  });
});
