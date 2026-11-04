export interface ProposalCallbackData {
  readonly action: 'confirm' | 'cancel' | 'edit';
  readonly proposalId: string;
}

export function encodeProposalCallback(proposalId: string, action: 'confirm' | 'cancel' | 'edit'): string {
  const shortAction = action === 'confirm' ? 'c' : action === 'cancel' ? 'x' : 'e';
  // Max 64 bytes in Telegram callback data
  return `p:${proposalId}:${shortAction}`;
}

export function decodeProposalCallback(data: string): ProposalCallbackData | null {
  const parts = data.split(':');
  if (parts.length !== 3 || parts[0] !== 'p') return null;
  const proposalId = parts[1];
  const shortAction = parts[2];
  if (!proposalId) return null;

  const action = shortAction === 'c' ? 'confirm' : shortAction === 'x' ? 'cancel' : shortAction === 'e' ? 'edit' : null;
  if (!action) return null;

  return { proposalId, action };
}
