import { Money } from '../../../../shared/money.js';

export type JarBand = 'ok' | 'atencao' | 'estourado';

export interface JarAllocationDefinition {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly percent?: number | null;
  readonly fixedAmount?: Money | null;
  readonly rollover: boolean;
  readonly categoryIds?: readonly string[];
}

export interface JarAllocationInput {
  readonly base: Money;
  readonly jars: readonly JarAllocationDefinition[];
  readonly carriedIn?: ReadonlyMap<string, Money>;
  readonly used?: ReadonlyMap<string, Money>;
}

export interface JarAllocationOutputItem {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly alocado: Money;
  readonly carregado: Money;
  readonly totalDisponivelParaGasto: Money; // alocado + carregado
  readonly usado: Money;
  readonly disponivel: Money; // (alocado + carregado) - usado
  readonly percentUsado: number;
  readonly status: JarBand;
  readonly categoryIds: readonly string[];
}

export interface JarAllocationResult {
  readonly base: Money;
  readonly baseInsuficiente: boolean;
  readonly items: readonly JarAllocationOutputItem[];
  readonly semPoteUsado: Money;
}

export class JarAllocator {
  static allocate(
    input: JarAllocationInput,
    semPoteUsado: Money = Money.zero()
  ): JarAllocationResult {
    const baseCents = input.base.cents;
    const carriedMap = input.carriedIn ?? new Map<string, Money>();
    const usedMap = input.used ?? new Map<string, Money>();

    const fixedJars: JarAllocationDefinition[] = [];
    const percentJars: JarAllocationDefinition[] = [];

    for (const jar of input.jars) {
      if (jar.fixedAmount && jar.fixedAmount.isPositive()) {
        fixedJars.push(jar);
      } else {
        percentJars.push(jar);
      }
    }

    // 1. Allocate fixed amounts
    let allocatedFixedTotalCents = 0n;
    const allocations = new Map<string, Money>();

    for (const jar of fixedJars) {
      const needed = jar.fixedAmount!.cents;
      const remainingBase = baseCents > allocatedFixedTotalCents ? baseCents - allocatedFixedTotalCents : 0n;
      const allocCents = needed <= remainingBase ? needed : remainingBase;
      allocations.set(jar.id, Money.fromCents(allocCents));
      allocatedFixedTotalCents += allocCents;
    }

    const totalFixedDemanded = fixedJars.reduce((acc, j) => acc + (j.fixedAmount?.cents ?? 0n), 0n);
    const baseInsuficiente = baseCents < totalFixedDemanded;

    // 2. Allocate remainder across percent jars
    const remainderCents = baseCents > allocatedFixedTotalCents ? baseCents - allocatedFixedTotalCents : 0n;
    const remainderMoney = Money.fromCents(remainderCents);

    if (percentJars.length > 0) {
      const weightsBp = percentJars.map((j) => {
        const p = j.percent ?? 0;
        return Math.max(0, Math.round(p * 100)); // basis points
      });

      const totalWeights = weightsBp.reduce((a, b) => a + b, 0);
      if (totalWeights > 0) {
        const allocatedRemainder = remainderMoney.allocate(weightsBp);
        for (let i = 0; i < percentJars.length; i++) {
          allocations.set(percentJars[i]!.id, allocatedRemainder[i]!);
        }
      } else {
        for (const j of percentJars) {
          allocations.set(j.id, Money.zero());
        }
      }
    }

    // 3. Compute available and bands for each jar
    const items: JarAllocationOutputItem[] = input.jars.map((jar) => {
      const alocado = allocations.get(jar.id) ?? Money.zero();
      const carregado = carriedMap.get(jar.id) ?? Money.zero();
      const usado = usedMap.get(jar.id) ?? Money.zero();

      const totalDisponivelParaGastoCents = alocado.cents + carregado.cents;
      const totalDisponivelParaGasto = Money.fromCents(totalDisponivelParaGastoCents);

      const disponivelCents = totalDisponivelParaGastoCents - usado.cents;
      const disponivel = Money.fromCents(disponivelCents > 0n ? disponivelCents : 0n);

      let percentUsado = 0;
      let status: JarBand = 'ok';

      if (totalDisponivelParaGastoCents <= 0n) {
        if (usado.cents > 0n) {
          percentUsado = 999.99;
          status = 'estourado';
        } else {
          percentUsado = 0;
          status = 'ok';
        }
      } else {
        percentUsado = Number((usado.cents * 10000n) / totalDisponivelParaGastoCents) / 100;
        if (usado.cents > totalDisponivelParaGastoCents) {
          status = 'estourado';
        } else if (usado.cents >= (totalDisponivelParaGastoCents * 8000n + 5000n) / 10000n) {
          status = 'atencao';
        } else {
          status = 'ok';
        }
      }

      return {
        id: jar.id,
        slug: jar.slug,
        name: jar.name,
        alocado,
        carregado,
        totalDisponivelParaGasto,
        usado,
        disponivel,
        percentUsado,
        status,
        categoryIds: jar.categoryIds ?? [],
      };
    });

    return {
      base: input.base,
      baseInsuficiente,
      items,
      semPoteUsado,
    };
  }
}
