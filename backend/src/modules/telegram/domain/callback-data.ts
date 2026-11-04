/**
 * Compact callback serialization for Telegram inline keyboard (limit 64 bytes)
 * Format: p:<proposalId>:<action>
 * action: 'c' (confirm), 'x' (cancel)
 */
export function encodeProposalCallback(proposalId: string, action: 'c' | 'x'): string {
  return `p:${proposalId}:${action}`;
}

export function decodeProposalCallback(
  data: string
): { proposalId: string; action: 'c' | 'x' } | null {
  const parts = data.split(':');
  if (parts.length === 3 && parts[0] === 'p') {
    const proposalId = parts[1];
    const action = parts[2];
    if (proposalId && (action === 'c' || action === 'x')) {
      return { proposalId, action };
    }
  }
  return null;
}
