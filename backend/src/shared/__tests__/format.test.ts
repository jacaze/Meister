import { describe, expect, it } from 'vitest';
import {
  formatBRL,
  formatBRLFromDecimal,
  formatCompetence,
  formatDateBR,
  formatPercent,
} from '../format.js';

describe('format pt-BR', () => {
  it('formata centavos em BRL com milhar e vírgula', () => {
    expect(formatBRL(0n)).toBe('R$ 0,00');
    expect(formatBRL(5n)).toBe('R$ 0,05');
    expect(formatBRL(350000n)).toBe('R$ 3.500,00');
    expect(formatBRL(5062500n)).toBe('R$ 50.625,00');
    expect(formatBRL(535659n)).toBe('R$ 5.356,59');
    expect(formatBRL(123456789n)).toBe('R$ 1.234.567,89');
  });

  it('formata negativos com sinal antes do símbolo', () => {
    expect(formatBRL(-89386n)).toBe('-R$ 893,86');
    expect(formatBRL(-100000000n)).toBe('-R$ 1.000.000,00');
  });

  it('formata string decimal da API sem passar por float', () => {
    expect(formatBRLFromDecimal('3500.00')).toBe('R$ 3.500,00');
    expect(formatBRLFromDecimal('67500')).toBe('R$ 67.500,00');
    expect(formatBRLFromDecimal('0.5')).toBe('R$ 0,50');
    expect(formatBRLFromDecimal('-10.5')).toBe('-R$ 10,50');
    expect(formatBRLFromDecimal(150.5)).toBe('R$ 150,50');
    expect(formatBRLFromDecimal('abc')).toBe('R$ 0,00');
  });

  it('formata percentual com vírgula', () => {
    expect(formatPercent(75)).toBe('75,0%');
    expect(formatPercent(75.04)).toBe('75,0%');
    expect(formatPercent(33.333, 2)).toBe('33,33%');
    expect(formatPercent(80, 0)).toBe('80%');
  });

  it('formata data ISO em dd/mm/aaaa', () => {
    expect(formatDateBR('2026-12-21')).toBe('21/12/2026');
    expect(formatDateBR('2026-12-21T00:00:00.000Z')).toBe('21/12/2026');
    expect(formatDateBR('lixo')).toBe('lixo');
  });

  it('formata competência AAAA-MM em mm/aaaa', () => {
    expect(formatCompetence('2026-11')).toBe('11/2026');
    expect(formatCompetence('x')).toBe('x');
  });
});
