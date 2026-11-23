import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import prisma from '../src/config/prisma.js';
import { LocalDate } from '../src/shared/index.js';
import { getMeiLimit } from '../src/modules/fiscal/public.js';
import { createTransaction, listSettlements } from '../src/modules/ledger/public.js';
import { getJarsStatus } from '../src/modules/jars/public.js';
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
        settlements: await prisma.settlement.count({ where: { workspaceId: scope.workspaceId } }),
        proLabore: await prisma.transaction.count({
          where: { workspaceId: scope.workspaceId, transferType: 'pro_labore', deletedAt: null },
        }),
      });
      const before = await contar();
      expect(before.tx).toBeGreaterThan(60);
      expect(before.das).toBe(limit!.mesesAtividade - (12 - LocalDate.now().month));
      // PJ (criado pelo seed) e PF (criado ao gerar os insights)
      expect(before.jarPlans).toBe(2);
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
      // Cada DAS pago tem exatamente uma despesa (das:<id>) e não há lançamento DAS legado duplicado
      const despesasDas = await prisma.transaction.count({
        where: { workspaceId: scope.workspaceId, sourceRef: { startsWith: 'das:' }, deletedAt: null },
      });
      expect(despesasDas).toBe(pagos);
      expect(
        await prisma.transaction.count({
          where: { workspaceId: scope.workspaceId, sourceRef: { startsWith: 'demo:das:' }, deletedAt: null },
        })
      ).toBe(0);

      await seedDemo(config);
      expect(await contar()).toEqual(before);
    });

    it('pró-labore é retirada do dono: perna despesa na PJ + receita na PF com o mesmo transferGroupId, uma por mês', async () => {
      const user = await prisma.user.findFirstOrThrow({ where: { email } });
      const scope = await resolveScopeForUser(user.id);
      const limit = await getMeiLimit(scope);
      const pernas = await prisma.transaction.findMany({
        where: { workspaceId: scope.workspaceId, transferType: 'pro_labore', deletedAt: null },
      });
      const meses = limit!.mesesAtividade - (12 - LocalDate.now().month);
      expect(pernas).toHaveLength(meses * 2);
      const grupos = new Map<string, typeof pernas>();
      for (const p of pernas) grupos.set(p.transferGroupId!, [...(grupos.get(p.transferGroupId!) ?? []), p]);
      expect(grupos.size).toBe(meses);
      for (const [, par] of grupos) {
        const pj = par.find((p) => p.entityId === scope.defaultEntityIds.pj!)!;
        const pf = par.find((p) => p.entityId === scope.defaultEntityIds.pf)!;
        expect(pj.type).toBe('despesa');
        expect(pf.type).toBe('receita');
        expect(pj.amount.toString()).toBe('3500');
        expect(pf.amount.toString()).toBe('3500');
      }
      // Nenhum pró-labore como receita PF solta (sem transferGroupId)
      const solto = await prisma.transaction.count({
        where: {
          workspaceId: scope.workspaceId,
          entityId: scope.defaultEntityIds.pf,
          category: { slug: 'pro-labore' },
          transferGroupId: null,
          deletedAt: null,
        },
      });
      expect(solto).toBe(0);
      // Pró-labore não é faturamento: o limite continua em 75%
      expect(limit!.percentualUtilizado).toBeLessThanOrEqual(75.1);
    });

    it('Acertos: 1 aberto (despesa da PJ paga com dinheiro pessoal) e 1 acertado (receita da PJ no Pix pessoal)', async () => {
      const user = await prisma.user.findFirstOrThrow({ where: { email } });
      const scope = await resolveScopeForUser(user.id);
      const { items, balances } = await listSettlements(scope);
      const abertos = items.filter((i) => i.status === 'aberto');
      const acertados = items.filter((i) => i.status === 'acertado');
      expect(abertos).toHaveLength(1);
      expect(acertados).toHaveLength(1);
      const pj = scope.defaultEntityIds.pj!;
      const pf = scope.defaultEntityIds.pf;
      // Despesa da PJ paga pela PF: a PJ deve à PF
      expect(abertos[0]!.debtorEntityId).toBe(pj);
      expect(abertos[0]!.creditorEntityId).toBe(pf);
      // Receita da PJ que caiu na PF: a PF deve à PJ
      expect(acertados[0]!.debtorEntityId).toBe(pf);
      expect(acertados[0]!.creditorEntityId).toBe(pj);
      expect(acertados[0]!.settledAt).not.toBeNull();
      expect(balances).toHaveLength(1);
      expect(balances[0]!.total).toBe(abertos[0]!.amount);
    });

    it('PF: Necessidades Básicas do mês atual na faixa atenção (85%), sem estourar', async () => {
      const user = await prisma.user.findFirstOrThrow({ where: { email } });
      const scope = await resolveScopeForUser(user.id);
      const status = await getJarsStatus(scope, { entityId: scope.defaultEntityIds.pf });
      expect(status.base).toBe('3500.00');
      const necessidades = status.jars.find((j) => j.slug === 'necessidades')!;
      expect(necessidades.percentUsado).toBeGreaterThanOrEqual(84.9);
      expect(necessidades.percentUsado).toBeLessThanOrEqual(85.1);
      expect(necessidades.status).toBe('atencao');
    });

    it('categorias: software da PJ em Outras Despesas, nada em Mercadorias e Insumos', async () => {
      const user = await prisma.user.findFirstOrThrow({ where: { email } });
      const scope = await resolveScopeForUser(user.id);
      const software = await prisma.transaction.findMany({
        where: { workspaceId: scope.workspaceId, description: { contains: 'software' }, deletedAt: null },
        include: { category: true },
      });
      expect(software.length).toBeGreaterThan(0);
      expect(software.every((t) => t.category?.slug === 'outras-despesas')).toBe(true);
      const insumos = await prisma.transaction.count({
        where: { workspaceId: scope.workspaceId, category: { slug: 'mercadoria-insumos' }, deletedAt: null },
      });
      expect(insumos).toBe(0);
    });

    it('gera insights para a PJ e para a PF ao final do seed (rodando de novo, continua gerando)', async () => {
      const config = parseSeedDemoConfig(env, ['--confirm']);
      const resumo = await seedDemo(config);
      expect(resumo.insightsPj).toBeGreaterThan(0);
      expect(resumo.insightsPf).toBeGreaterThan(0);
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
