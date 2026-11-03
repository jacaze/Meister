import { describe, expect, it } from 'vitest';
import { Money } from '../../../shared/money.js';
import { MeiLimitCalculator } from '../domain/services/MeiLimitCalculator.js';
import { DasCalculator } from '../domain/services/DasCalculator.js';
import { DasScheduler } from '../domain/services/DasScheduler.js';

describe('Fiscal Module — MeiLimitCalculator (Domain Rules & Proportional Limits)', () => {
  it('calculates full annual limit of R$ 81,000.00 when entity was opened in previous years or Jan 1', () => {
    const result = MeiLimitCalculator.compute({
      year: 2026,
      openedOn: { year: 2024, month: 5 },
      faturamentoAno: Money.fromDecimalString('50000.00'),
    });

    expect(result.proporcional).toBe(false);
    expect(result.mesesAtividade).toBe(12);
    expect(result.limite.toDecimalString()).toBe('81000.00');
    expect(result.limiteComTolerancia.toDecimalString()).toBe('97200.00');
    expect(result.restante.toDecimalString()).toBe('31000.00');
    expect(result.status).toBe('ok');
  });

  it('calculates proportional limit when entity is opened during the year (opening month counts fully)', () => {
    // March opening: months = 12 - (3 - 1) = 10 months -> 10 * 6750 = 67,500.00
    const marchResult = MeiLimitCalculator.compute({
      year: 2026,
      openedOn: { year: 2026, month: 3 },
      faturamentoAno: Money.fromDecimalString('20000.00'),
    });
    expect(marchResult.proporcional).toBe(true);
    expect(marchResult.mesesAtividade).toBe(10);
    expect(marchResult.limite.toDecimalString()).toBe('67500.00');
    expect(marchResult.limiteComTolerancia.toDecimalString()).toBe('81000.00');

    // December opening: 1 month -> 6,750.00
    const decResult = MeiLimitCalculator.compute({
      year: 2026,
      openedOn: { year: 2026, month: 12 },
      faturamentoAno: Money.fromDecimalString('1000.00'),
    });
    expect(decResult.proporcional).toBe(true);
    expect(decResult.mesesAtividade).toBe(1);
    expect(decResult.limite.toDecimalString()).toBe('6750.00');
  });

  it('tests exact status boundary thresholds (79.99%, 80%, 100%, 100.01%, 120%, 120.01%)', () => {
    // 80% = 64800, 100% = 81000, 120% = 97200

    // 1. Below 80% (64,799.99) -> ok
    const r1 = MeiLimitCalculator.compute({
      year: 2026,
      faturamentoAno: Money.fromDecimalString('64799.99'),
    });
    expect(r1.status).toBe('ok');

    // 2. Exactly 80% (64,800.00) -> atencao
    const r2 = MeiLimitCalculator.compute({
      year: 2026,
      faturamentoAno: Money.fromDecimalString('64800.00'),
    });
    expect(r2.status).toBe('atencao');

    // 3. Exactly 100% (81,000.00) -> still atencao (not exceeded yet)
    const r3 = MeiLimitCalculator.compute({
      year: 2026,
      faturamentoAno: Money.fromDecimalString('81000.00'),
    });
    expect(r3.status).toBe('atencao');

    // 4. Just above 100% (81,000.01) -> excedido
    const r4 = MeiLimitCalculator.compute({
      year: 2026,
      faturamentoAno: Money.fromDecimalString('81000.01'),
    });
    expect(r4.status).toBe('excedido');

    // 5. Exactly 120% (97,200.00) -> still excedido (within tolerance)
    const r5 = MeiLimitCalculator.compute({
      year: 2026,
      faturamentoAno: Money.fromDecimalString('97200.00'),
    });
    expect(r5.status).toBe('excedido');

    // 6. Above 120% (97,200.01) -> desenquadramento
    const r6 = MeiLimitCalculator.compute({
      year: 2026,
      faturamentoAno: Money.fromDecimalString('97200.01'),
    });
    expect(r6.status).toBe('desenquadramento');
  });
});

describe('Fiscal Module — DasCalculator & DasScheduler', () => {
  const params2026 = {
    minimumWage: Money.fromDecimalString('1621.00'),
    inssPct: 0.05,
    icmsAmount: Money.fromDecimalString('1.00'),
    issAmount: Money.fromDecimalString('5.00'),
  };

  it('computes exact 2026 DAS values for Comercio, Servicos and Misto', () => {
    // INSS 5% of 1621.00 = 81.05
    // Comercio: 81.05 + 1.00 = 82.05
    const comercio = DasCalculator.compute('comercio', params2026);
    expect(comercio.toDecimalString()).toBe('82.05');

    // Servicos: 81.05 + 5.00 = 86.05
    const servicos = DasCalculator.compute('servicos', params2026);
    expect(servicos.toDecimalString()).toBe('86.05');

    // Misto: 81.05 + 1.00 + 5.00 = 87.05
    const misto = DasCalculator.compute('misto', params2026);
    expect(misto.toDecimalString()).toBe('87.05');
  });

  it('schedules due date on 20th of next month, adjusting for weekends', () => {
    // 2026-05 competence -> next month is 2026-06. June 20th 2026 is Saturday -> moves to Monday 22nd!
    const dueJune = DasScheduler.getDueDate('2026-05');
    expect(dueJune.toIsoDate()).toBe('2026-06-22');

    // 2026-08 competence -> next month is 2026-09. Sept 20th 2026 is Sunday -> moves to Monday 21st!
    const dueSept = DasScheduler.getDueDate('2026-08');
    expect(dueSept.toIsoDate()).toBe('2026-09-21');

    // 2026-06 competence -> next month is 2026-07. July 20th 2026 is Monday -> remains 20th!
    const dueJuly = DasScheduler.getDueDate('2026-06');
    expect(dueJuly.toIsoDate()).toBe('2026-07-20');
  });
});
