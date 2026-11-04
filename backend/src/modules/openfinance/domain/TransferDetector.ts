export interface TransactionCandidate {
  readonly id: string;
  readonly direction: 'in' | 'out';
  readonly amount: string;
  readonly occurredOn: string; // YYYY-MM-DD
  readonly description: string;
}

export class TransferDetector {
  /**
   * Identifies candidate pairs that look like transfers between the user's accounts.
   */
  static findSuspectPairs(candidates: readonly TransactionCandidate[]): Array<{
    outId: string;
    inId: string;
    amount: string;
    reason: string;
  }> {
    const pairs: Array<{ outId: string; inId: string; amount: string; reason: string }> = [];
    const usedIds = new Set<string>();

    const outTxs = candidates.filter((c) => c.direction === 'out');
    const inTxs = candidates.filter((c) => c.direction === 'in');

    for (const outTx of outTxs) {
      if (usedIds.has(outTx.id)) continue;

      const outDate = new Date(outTx.occurredOn).getTime();

      for (const inTx of inTxs) {
        if (usedIds.has(inTx.id)) continue;
        if (outTx.amount !== inTx.amount) continue;

        const inDate = new Date(inTx.occurredOn).getTime();
        const diffDays = Math.abs(outDate - inDate) / (1000 * 60 * 60 * 24);

        if (diffDays <= 1.5) {
          pairs.push({
            outId: outTx.id,
            inId: inTx.id,
            amount: outTx.amount,
            reason: `Transferência provável: mesmo valor (R$ ${outTx.amount.replace('.', ',')}) e datas próximas (${outTx.occurredOn} / ${inTx.occurredOn}).`,
          });
          usedIds.add(outTx.id);
          usedIds.add(inTx.id);
          break;
        }
      }
    }

    return pairs;
  }
}
