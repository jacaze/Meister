import { describe, expect, it } from 'vitest';
import { LocalDate, Money } from '../shared/index.js';
import { MeiLimitCalculator } from '../modules/fiscal/public.js';
import { buildDemoScenario, DEMO_NECESSIDADES_CURRENT_PERCENT, DEMO_PRO_LABORE_CENTS } from './demo-scenario.js';

const NECESSIDADES = ['moradia', 'alimentacao', 'transporte', 'saude'];

const HOJES = ['2026-11-22', '2026-03-05', '2026-02-01', '2026-12-31', '2026-01-15'];

describe('buildDemoScenario', () => {
  for (const iso of HOJES) {
    const today = LocalDate.fromIsoDate(iso);

    describe(`hoje = ${iso}`, () => {
      const scenario = buildDemoScenario(today);

      it('abre o MEI no ano corrente, sem data futura', () => {
        expect(scenario.openedOn.year).toBe(today.year);
        expect(scenario.openedOn.isAfter(today)).toBe(false);
      });

      it('receita da PJ soma exatamente 75% do limite proporcional (em centavos)', () => {
        const limite = MeiLimitCalculator.compute({
          year: today.year,
          openedOn: { year: scenario.openedOn.year, month: scenario.openedOn.month },
          faturamentoAno: Money.zero(),
        }).limite;
        const receita = Money.sum(
          scenario.entries.filter((e) => e.entity === 'pj' && e.type === 'receita').map((e) => e.amount)
        );
        expect(receita.cents).toBe(limite.mulRatio(75, 100).cents);
      });

      it('nenhum lançamento fica no futuro nem antes da abertura (PJ)', () => {
        for (const e of scenario.entries) {
          expect(e.date.isAfter(today)).toBe(false);
          if (e.entity === 'pj') {
            expect(e.date.isBefore(scenario.openedOn)).toBe(false);
          }
        }
      });

      it('pró-labore: uma retirada por mês de atividade, de 3.500, a partir da abertura e sem data futura', () => {
        const meses = new Set(scenario.withdrawals.map((w) => w.date.yearMonth().toString()));
        expect(meses.size).toBe(scenario.withdrawals.length);
        expect(meses.has(today.yearMonth().toString())).toBe(true);
        expect(meses.has(scenario.openedOn.yearMonth().toString())).toBe(true);
        for (const w of scenario.withdrawals) {
          expect(w.amount.cents).toBe(DEMO_PRO_LABORE_CENTS);
          expect(w.date.isBefore(scenario.openedOn)).toBe(false);
          expect(w.date.isAfter(today)).toBe(false);
        }
        // Não existe mais pró-labore como receita PF solta
        expect(scenario.entries.some((e) => e.entity === 'pf' && e.categorySlug === 'pro-labore')).toBe(false);
      });

      it('renda da PF é de 3.500 em todos os meses (salário antes da abertura, pró-labore depois)', () => {
        const porMes = new Map<string, bigint>();
        const add = (ym: string, c: bigint) => porMes.set(ym, (porMes.get(ym) ?? 0n) + c);
        for (const e of scenario.entries) {
          if (e.entity === 'pf' && e.type === 'receita') add(e.date.yearMonth().toString(), e.amount.cents);
        }
        for (const w of scenario.withdrawals) add(w.date.yearMonth().toString(), w.amount.cents);
        expect(porMes.size).toBe(12);
        for (const v of porMes.values()) expect(v).toBe(DEMO_PRO_LABORE_CENTS);
      });

      it('mês atual: Necessidades Básicas da PF em 85% do pote (faixa atenção); meses anteriores variam', () => {
        const alocado = Money.fromCents(DEMO_PRO_LABORE_CENTS).mulRatio(55, 100);
        const porMes = new Map<string, bigint>();
        for (const e of scenario.entries) {
          if (e.entity === 'pf' && e.type === 'despesa' && NECESSIDADES.includes(e.categorySlug)) {
            const ym = e.date.yearMonth().toString();
            porMes.set(ym, (porMes.get(ym) ?? 0n) + e.amount.cents);
          }
        }
        expect(porMes.get(today.yearMonth().toString())).toBe(
          alocado.mulRatio(DEMO_NECESSIDADES_CURRENT_PERCENT, 100).cents
        );
        expect(DEMO_NECESSIDADES_CURRENT_PERCENT).toBe(85);
        const outros = [...porMes.entries()].filter(([ym]) => ym !== today.yearMonth().toString()).map(([, v]) => v);
        expect(new Set(outros).size).toBeGreaterThanOrEqual(8);
      });

      it('acertos: 1 despesa da PJ paga com dinheiro pessoal (aberto) e 1 receita da PJ no Pix pessoal (acertado)', () => {
        const mistos = scenario.entries.filter((e) => e.paidByPf);
        expect(mistos).toHaveLength(2);
        const aberto = mistos.filter((e) => !e.settled);
        const acertado = mistos.filter((e) => e.settled);
        expect(aberto).toHaveLength(1);
        expect(acertado).toHaveLength(1);
        expect(aberto[0]!.entity).toBe('pj');
        expect(aberto[0]!.type).toBe('despesa');
        expect(acertado[0]!.entity).toBe('pj');
        expect(acertado[0]!.type).toBe('receita');
      });

      it('categorias coerentes com um MEI de serviços: nada de Mercadorias e Insumos; software em Outras Despesas', () => {
        const pjDespesas = scenario.entries.filter((e) => e.entity === 'pj' && e.type === 'despesa');
        expect(pjDespesas.some((e) => e.categorySlug === 'mercadoria-insumos')).toBe(false);
        for (const e of pjDespesas.filter((x) => /software|licen/i.test(x.description))) {
          expect(e.categorySlug).toBe('outras-despesas');
        }
        for (const e of pjDespesas.filter((x) => /hospedagem|coworking/i.test(x.description))) {
          expect(e.categorySlug).toBe('aluguel-comercial');
        }
      });

      it('chaves de idempotência únicas e valores positivos', () => {
        const keys = [...scenario.entries.map((e) => e.key), ...scenario.withdrawals.map((w) => w.key)];
        expect(new Set(keys).size).toBe(keys.length);
        expect(scenario.entries.every((e) => e.amount.isPositive())).toBe(true);
      });
    });
  }

  it('hoje em novembro: abertura em março, 10 meses de atividade e PF com 12 meses de histórico', () => {
    const scenario = buildDemoScenario(LocalDate.fromIsoDate('2026-11-22'));
    expect(scenario.openedOn.month).toBe(3);
    const pfMeses = new Set(
      scenario.entries.filter((e) => e.entity === 'pf').map((e) => e.date.yearMonth().toString())
    );
    expect(pfMeses.size).toBe(12);
    expect(scenario.entries.some((e) => e.entity === 'pj' && e.type === 'despesa')).toBe(true);
  });
});
