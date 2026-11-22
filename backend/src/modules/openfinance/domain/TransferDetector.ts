import { Money } from '../../../shared/money.js';

export interface TransactionCandidate {
  readonly id: string;
  readonly direction: 'in' | 'out';
  readonly amount: string;
  readonly occurredOn: string; // YYYY-MM-DD
  readonly description: string;
  /** Conta bancária de origem; null/ausente = desconhecida (nunca pareia). */
  readonly bankAccountId?: string | null;
}

interface Normalized {
  readonly candidate: TransactionCandidate;
  readonly cents: bigint;
  readonly accountId: string;
}

function normalize(candidate: TransactionCandidate): Normalized | null {
  if (!candidate.bankAccountId) return null;
  try {
    const cents = Money.fromDecimalString(candidate.amount).cents;
    return { candidate, cents, accountId: candidate.bankAccountId };
  } catch {
    return null;
  }
}

function formatCents(cents: bigint): string {
  const abs = cents.toString().padStart(3, '0');
  return `${abs.slice(0, -2)}.${abs.slice(-2)}`;
}

export class TransferDetector {
  /**
   * Identifies candidate pairs that look like transfers between the user's own accounts.
   * A transfer needs an outflow and an inflow of the same value (in cents), within 1.5 days,
   * in two DIFFERENT and known bank accounts. Same account (or unknown account) never pairs.
   */
  static findSuspectPairs(candidates: readonly TransactionCandidate[]): Array<{
    outId: string;
    inId: string;
    amount: string;
    reason: string;
  }> {
    const pairs: Array<{ outId: string; inId: string; amount: string; reason: string }> = [];
    const usedIds = new Set<string>();

    const known = candidates.map(normalize).filter((n): n is Normalized => n !== null);
    const outTxs = known.filter((c) => c.candidate.direction === 'out');
    const inTxs = known.filter((c) => c.candidate.direction === 'in');

    for (const outTx of outTxs) {
      if (usedIds.has(outTx.candidate.id)) continue;

      const outDate = new Date(outTx.candidate.occurredOn).getTime();

      for (const inTx of inTxs) {
        if (usedIds.has(inTx.candidate.id)) continue;
        if (outTx.cents !== inTx.cents) continue;
        if (outTx.accountId === inTx.accountId) continue;

        const inDate = new Date(inTx.candidate.occurredOn).getTime();
        const diffDays = Math.abs(outDate - inDate) / (1000 * 60 * 60 * 24);

        if (diffDays <= 1.5) {
          const amount = formatCents(outTx.cents);
          pairs.push({
            outId: outTx.candidate.id,
            inId: inTx.candidate.id,
            amount,
            reason: `Transferência provável entre contas: mesmo valor (R$ ${amount.replace('.', ',')}) e datas próximas (${outTx.candidate.occurredOn} / ${inTx.candidate.occurredOn}).`,
          });
          usedIds.add(outTx.candidate.id);
          usedIds.add(inTx.candidate.id);
          break;
        }
      }
    }

    return pairs;
  }
}
