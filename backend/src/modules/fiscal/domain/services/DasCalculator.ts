import { Money } from '../../../../shared/money.js';

export type MeiActivity = 'comercio' | 'servicos' | 'misto';

export interface DasParameters {
  readonly minimumWage: Money;
  readonly inssPct?: number; // default 0.05
  readonly icmsAmount?: Money; // default 1.00
  readonly issAmount?: Money; // default 5.00
}

export class DasCalculator {
  static compute(activity: MeiActivity, params: DasParameters): Money {
    const inssPct = params.inssPct ?? 0.05;
    const icms = params.icmsAmount ?? Money.fromDecimalString('1.00');
    const iss = params.issAmount ?? Money.fromDecimalString('5.00');

    // INSS: minimumWage * inssPct (half-up rounding in cents)
    const inssCents = (params.minimumWage.cents * BigInt(Math.round(inssPct * 10000)) + 5000n) / 10000n;
    const inss = Money.fromCents(inssCents);

    let total = inss;
    if (activity === 'comercio' || activity === 'misto') {
      total = total.add(icms);
    }
    if (activity === 'servicos' || activity === 'misto') {
      total = total.add(iss);
    }

    return total;
  }
}
