import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Money } from '../../../shared/money.js';
import { JarAllocator, type JarAllocationDefinition } from '../domain/services/JarAllocator.js';
import { JAR_TEMPLATES } from '../domain/templates.js';

describe('Jars Module — Templates & Definitions', () => {
  it('ensures all built-in templates have percent sums equal to 100% (or fixed amounts)', () => {
    for (const template of JAR_TEMPLATES) {
      if (template.slug === 'personalizado') continue;
      const percentJars = template.jars.filter((j) => typeof j.percent === 'number');
      const sum = percentJars.reduce((acc, j) => acc + (j.percent ?? 0), 0);
      expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
    }
  });
});

describe('Jars Module — JarAllocator (Domain Rules & Largest Remainder)', () => {
  it('allocates base revenue across percent jars with zero leftover cents', () => {
    const jars: JarAllocationDefinition[] = [
      { id: '1', slug: 'necessidades', name: 'Necessidades', percent: 55, rollover: false },
      { id: '2', slug: 'liberdade', name: 'Liberdade', percent: 10, rollover: true },
      { id: '3', slug: 'educacao', name: 'Educação', percent: 10, rollover: false },
      { id: '4', slug: 'longo-prazo', name: 'Longo Prazo', percent: 10, rollover: true },
      { id: '5', slug: 'diversao', name: 'Diversão', percent: 10, rollover: false },
      { id: '6', slug: 'doacao', name: 'Doação', percent: 5, rollover: false },
    ];

    const base = Money.fromDecimalString('3547.83');
    const result = JarAllocator.allocate({ base, jars });

    const totalAllocated = result.items.reduce((acc, item) => acc.add(item.alocado), Money.zero());
    expect(totalAllocated.cents).toBe(base.cents);
    expect(totalAllocated.toDecimalString()).toBe('3547.83');
  });

  it('allocates fixed amount jars first and divides the remainder among percent jars', () => {
    const jars: JarAllocationDefinition[] = [
      { id: '1', slug: 'impostos', name: 'DAS Fixo', fixedAmount: Money.fromDecimalString('86.05'), rollover: false },
      { id: '2', slug: 'operacao', name: 'Operação', percent: 50, rollover: false },
      { id: '3', slug: 'reserva', name: 'Reserva', percent: 25, rollover: true },
      { id: '4', slug: 'prolabore', name: 'Pró-labore', percent: 25, rollover: false },
    ];

    const base = Money.fromDecimalString('1000.00');
    const result = JarAllocator.allocate({ base, jars });

    const dasJar = result.items.find((i) => i.slug === 'impostos')!;
    expect(dasJar.alocado.toDecimalString()).toBe('86.05');

    // Remainder = 1000.00 - 86.05 = 913.95
    // Operação 50% = 456.98 (or 456.97)
    const operacao = result.items.find((i) => i.slug === 'operacao')!;
    const reserva = result.items.find((i) => i.slug === 'reserva')!;
    const prolabore = result.items.find((i) => i.slug === 'prolabore')!;

    const remainderSum = operacao.alocado.add(reserva.alocado).add(prolabore.alocado);
    expect(remainderSum.toDecimalString()).toBe('913.95');

    const totalAllocated = result.items.reduce((acc, item) => acc.add(item.alocado), Money.zero());
    expect(totalAllocated.toDecimalString()).toBe('1000.00');
  });

  it('evaluates jar status bands (ok, atencao, estourado)', () => {
    const jars: JarAllocationDefinition[] = [
      { id: '1', slug: 'diversao', name: 'Diversão', percent: 100, rollover: false },
    ];

    const base = Money.fromDecimalString('1000.00');

    // Under 80%: R$ 799.00 -> ok
    const r1 = JarAllocator.allocate({
      base,
      jars,
      used: new Map([['1', Money.fromDecimalString('799.00')]]),
    });
    expect(r1.items[0]!.status).toBe('ok');
    expect(r1.items[0]!.disponivel.toDecimalString()).toBe('201.00');

    // Exactly 80%: R$ 800.00 -> atencao
    const r2 = JarAllocator.allocate({
      base,
      jars,
      used: new Map([['1', Money.fromDecimalString('800.00')]]),
    });
    expect(r2.items[0]!.status).toBe('atencao');

    // Exactly 100%: R$ 1000.00 -> atencao (not estourado yet)
    const r3 = JarAllocator.allocate({
      base,
      jars,
      used: new Map([['1', Money.fromDecimalString('1000.00')]]),
    });
    expect(r3.items[0]!.status).toBe('atencao');
    expect(r3.items[0]!.disponivel.toDecimalString()).toBe('0.00');

    // Above 100%: R$ 1000.01 -> estourado
    const r4 = JarAllocator.allocate({
      base,
      jars,
      used: new Map([['1', Money.fromDecimalString('1000.01')]]),
    });
    expect(r4.items[0]!.status).toBe('estourado');
    expect(r4.items[0]!.disponivel.toDecimalString()).toBe('0.00');
  });

  it('property-based test: exact sum preservation for 100 randomly generated amounts', () => {
    const jars: JarAllocationDefinition[] = [
      { id: '1', slug: 'j1', name: 'J1', percent: 40, rollover: false },
      { id: '2', slug: 'j2', name: 'J2', percent: 30, rollover: false },
      { id: '3', slug: 'j3', name: 'J3', percent: 20, rollover: false },
      { id: '4', slug: 'j4', name: 'J4', percent: 10, rollover: false },
    ];

    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000_00 }), (cents) => {
        const base = Money.fromCents(BigInt(cents));
        const res = JarAllocator.allocate({ base, jars });
        const sum = res.items.reduce((acc, it) => acc.add(it.alocado), Money.zero());
        return sum.cents === base.cents;
      }),
      { numRuns: 100 }
    );
  });
});
