import { describe, expect, it } from 'vitest';
import { LocalDate, Money } from '../shared/index.js';
import { MeiLimitCalculator } from '../modules/fiscal/public.js';
import { buildDemoScenario } from './demo-scenario.js';

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

      it('chaves de idempotência únicas e valores positivos', () => {
        const keys = scenario.entries.map((e) => e.key);
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
