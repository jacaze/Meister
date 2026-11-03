import { ValidationError } from './errors.js';

export const MAX_MONEY_CENTS = 999_999_999_999n; // 9_999_999_999.99

const STRICT_DECIMAL_REGEX = /^\d{1,10}(\.\d{1,2})?$/;
const CHANNEL_DECIMAL_REGEX = /^\d{1,10}([.,]\d{1,2})?$/;

export class Money {
  public readonly cents: bigint;

  private constructor(cents: bigint) {
    if (cents < 0n) {
      throw new ValidationError('O valor monetário não pode ser negativo');
    }
    if (cents > MAX_MONEY_CENTS) {
      throw new ValidationError('Valor acima do limite permitido');
    }
    this.cents = cents;
  }

  public static zero(): Money {
    return new Money(0n);
  }

  public static fromCents(cents: bigint | number): Money {
    if (typeof cents === 'number') {
      if (!Number.isSafeInteger(cents)) {
        throw new ValidationError('Valor em centavos inválido');
      }
      return new Money(BigInt(cents));
    }
    return new Money(cents);
  }

  public static fromDecimalString(
    raw: string,
    options?: { allowComma?: boolean; requirePositive?: boolean }
  ): Money {
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new ValidationError('Valor inválido');
    }

    const regex = options?.allowComma ? CHANNEL_DECIMAL_REGEX : STRICT_DECIMAL_REGEX;
    if (!regex.test(raw)) {
      throw new ValidationError('Valor inválido');
    }

    const normalized = raw.replace(',', '.');
    const [intPart = '0', fracPart = ''] = normalized.split('.');
    const paddedFrac = fracPart.padEnd(2, '0');
    const cents = BigInt(intPart) * 100n + BigInt(paddedFrac);

    if (options?.requirePositive && cents <= 0n) {
      throw new ValidationError('O valor deve ser maior que zero');
    }

    return new Money(cents);
  }

  public static fromInput(
    value: unknown,
    options?: { requirePositive?: boolean; allowComma?: boolean }
  ): Money {
    if (typeof value === 'string') {
      if (value.trim() === '') {
        throw new ValidationError('Valor inválido');
      }
      if (/^-\d+(\.\d+)?$/.test(value)) {
        throw new ValidationError('O valor deve ser maior que zero');
      }
      const money = Money.fromDecimalString(value, {
        allowComma: options?.allowComma,
        requirePositive: false,
      });
      if (options?.requirePositive && money.cents <= 0n) {
        throw new ValidationError('O valor deve ser maior que zero');
      }
      return money;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new ValidationError('Valor inválido');
      }
      if (value <= 0) {
        if (value === 0 && !options?.requirePositive) {
          return Money.zero();
        }
        throw new ValidationError('O valor deve ser maior que zero');
      }
      const asFixed = value.toString();
      if (asFixed.includes('e') || asFixed.includes('E')) {
        throw new ValidationError('Valor inválido');
      }
      const parts = asFixed.split('.');
      if (parts[1] && parts[1].length > 2) {
        throw new ValidationError('O valor pode ter no máximo 2 casas decimais');
      }
      return Money.fromDecimalString(asFixed, {
        requirePositive: options?.requirePositive,
      });
    }

    throw new ValidationError('Valor inválido');
  }

  public static sum(values: Iterable<Money>): Money {
    let total = 0n;
    for (const v of values) {
      total += v.cents;
    }
    return new Money(total);
  }

  public static formatCents(signedCents: bigint): string {
    const isNegative = signedCents < 0n;
    const abs = isNegative ? -signedCents : signedCents;
    const intPart = abs / 100n;
    const fracPart = (abs % 100n).toString().padStart(2, '0');
    return `${isNegative ? '-' : ''}${intPart.toString()}.${fracPart}`;
  }

  public static centsToNumber(signedCents: bigint): number {
    return Number(signedCents) / 100;
  }

  public toDecimalString(): string {
    return Money.formatCents(this.cents);
  }

  public toNumber(): number {
    return Number(this.cents) / 100;
  }

  public isZero(): boolean {
    return this.cents === 0n;
  }

  public isPositive(): boolean {
    return this.cents > 0n;
  }

  public equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  public compare(other: Money): -1 | 0 | 1 {
    if (this.cents < other.cents) return -1;
    if (this.cents > other.cents) return 1;
    return 0;
  }

  public add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  public sub(other: Money): Money {
    if (other.cents > this.cents) {
      throw new ValidationError('Resultado monetário não pode ser negativo');
    }
    return new Money(this.cents - other.cents);
  }

  public signedDiff(other: Money): bigint {
    return this.cents - other.cents;
  }

  /**
   * Multiplies by a rational ratio (numerator / denominator) with half-up rounding.
   */
  public mulRatio(numerator: bigint | number, denominator: bigint | number): Money {
    const num = BigInt(numerator);
    const den = BigInt(denominator);
    if (den <= 0n) {
      throw new ValidationError('Denominador deve ser positivo');
    }
    if (num < 0n) {
      throw new ValidationError('Numerador não pode ser negativo');
    }
    const product = this.cents * num;
    const quotient = (product * 2n + den) / (2n * den);
    return new Money(quotient);
  }

  /**
   * Largest Remainder Method allocation in integer basis points (or positive weights).
   * Guarantees sum(result) === this.cents and deterministic tie-breaking by lowest index.
   */
  public allocate(weights: readonly number[]): Money[] {
    if (weights.length === 0) {
      throw new ValidationError('Pesos de alocação não podem ser vazios');
    }

    const bigWeights: bigint[] = [];
    let totalWeight = 0n;

    for (const w of weights) {
      if (!Number.isSafeInteger(w) || w < 0) {
        throw new ValidationError('Pesos de alocação devem ser inteiros não negativos');
      }
      const bw = BigInt(w);
      bigWeights.push(bw);
      totalWeight += bw;
    }

    if (totalWeight <= 0n) {
      throw new ValidationError('A soma dos pesos deve ser maior que zero');
    }

    const quotas: bigint[] = [];
    const remainders: { index: number; rem: bigint }[] = [];
    let allocatedSum = 0n;

    for (let i = 0; i < bigWeights.length; i++) {
      const weight = bigWeights[i]!;
      const numerator = this.cents * weight;
      const quota = numerator / totalWeight;
      const rem = numerator % totalWeight;
      quotas.push(quota);
      remainders.push({ index: i, rem });
      allocatedSum += quota;
    }

    const leftover = Number(this.cents - allocatedSum);
    remainders.sort((a, b) => {
      if (b.rem > a.rem) return 1;
      if (b.rem < a.rem) return -1;
      return a.index - b.index;
    });

    for (let k = 0; k < leftover; k++) {
      const target = remainders[k]!;
      quotas[target.index] = quotas[target.index]! + 1n;
    }

    return quotas.map((q) => new Money(q));
  }
}
