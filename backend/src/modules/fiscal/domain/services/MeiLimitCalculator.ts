import { Money } from '../../../../shared/money.js';

export type MeiLimitBand = 'ok' | 'atencao' | 'excedido' | 'desenquadramento';

export interface MeiLimitInput {
  readonly year: number;
  readonly openedOn?: { year: number; month: number } | null;
  readonly faturamentoAno: Money;
  readonly meiAnnualLimit?: Money;
  readonly meiMonthlyReference?: Money;
  readonly tolerancePct?: number; // default 0.20
  readonly isProfileComplete?: boolean;
}

export interface MeiLimitResult {
  readonly ano: number;
  readonly limite: Money;
  readonly limiteComTolerancia: Money;
  readonly mesesAtividade: number;
  readonly proporcional: boolean;
  readonly faturamentoAno: Money;
  readonly percentualUtilizado: number;
  readonly restante: Money;
  readonly status: MeiLimitBand;
  readonly perfilIncompleto: boolean;
  readonly parametrosEstimados: boolean;
}

const DEFAULT_ANNUAL_LIMIT = Money.fromDecimalString('81000.00');
const DEFAULT_MONTHLY_REF = Money.fromDecimalString('6750.00');
const DEFAULT_TOLERANCE_PCT = 0.2;

export class MeiLimitCalculator {
  static compute(input: MeiLimitInput): MeiLimitResult {
    const annualLimit = input.meiAnnualLimit ?? DEFAULT_ANNUAL_LIMIT;
    const monthlyRef = input.meiMonthlyReference ?? DEFAULT_MONTHLY_REF;
    const tolerancePct = input.tolerancePct ?? DEFAULT_TOLERANCE_PCT;

    let mesesAtividade = 12;
    let proporcional = false;

    if (input.openedOn && input.openedOn.year === input.year) {
      mesesAtividade = Math.max(1, Math.min(12, 12 - (input.openedOn.month - 1)));
      proporcional = mesesAtividade < 12;
    }

    const limite = proporcional
      ? Money.fromCents(monthlyRef.cents * BigInt(mesesAtividade))
      : annualLimit;

    // Tolerance limit: limite * (1 + tolerancePct)
    // Using basis points: 10000 + 2000 = 12000 bp
    const toleranceBp = BigInt(Math.round(tolerancePct * 10000));
    const limiteComTolerancia = Money.fromCents(
      (limite.cents * (10000n + toleranceBp) + 5000n) / 10000n
    );

    const faturamentoCents = input.faturamentoAno.cents;
    const limiteCents = limite.cents;

    let percentualUtilizado = 0;
    if (limiteCents > 0n) {
      percentualUtilizado = Number((faturamentoCents * 10000n) / limiteCents) / 100;
    }

    const restanteCents = faturamentoCents >= limiteCents ? 0n : limiteCents - faturamentoCents;
    const restante = Money.fromCents(restanteCents);

    // Exact boundary conditions:
    // status:
    //   faturamentoAno > limiteComTol -> 'desenquadramento'
    //   faturamentoAno > limite       -> 'excedido'
    //   faturamentoAno >= 0.8 * limite -> 'atencao'
    //   else                          -> 'ok'
    const atencaoThreshold = (limiteCents * 8000n + 5000n) / 10000n;

    let status: MeiLimitBand;
    if (faturamentoCents > limiteComTolerancia.cents) {
      status = 'desenquadramento';
    } else if (faturamentoCents > limiteCents) {
      status = 'excedido';
    } else if (faturamentoCents >= atencaoThreshold) {
      status = 'atencao';
    } else {
      status = 'ok';
    }

    return {
      ano: input.year,
      limite,
      limiteComTolerancia,
      mesesAtividade,
      proporcional,
      faturamentoAno: input.faturamentoAno,
      percentualUtilizado,
      restante,
      status,
      perfilIncompleto: input.isProfileComplete === false,
      parametrosEstimados: false,
    };
  }
}
