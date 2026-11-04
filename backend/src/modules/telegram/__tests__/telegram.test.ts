import { describe, expect, it } from 'vitest';
import { decodeProposalCallback, encodeProposalCallback } from '../domain/callback-data.js';
import { escapeMarkdownV2, formatBrl } from '../domain/messages.pt-BR.js';

describe('Telegram Module — Domain & Messages', () => {
  it('encodes and decodes proposal callback data within 64 bytes limit', () => {
    const proposalId = '123e4567-e89b-12d3-a456-426614174000';
    const callbackData = encodeProposalCallback(proposalId, 'c');

    expect(callbackData.length).toBeLessThanOrEqual(64);
    expect(callbackData).toBe(`p:${proposalId}:c`);

    const decoded = decodeProposalCallback(callbackData);
    expect(decoded).not.toBeNull();
    expect(decoded?.proposalId).toBe(proposalId);
    expect(decoded?.action).toBe('c');

    const decodedCancel = decodeProposalCallback(`p:${proposalId}:x`);
    expect(decodedCancel?.action).toBe('x');

    expect(decodeProposalCallback('invalid:data')).toBeNull();
  });

  it('escapes reserved MarkdownV2 characters properly', () => {
    const raw = 'Conta #1 (MEI) - Saldo: R$ 1.250,50! [Ver mais]';
    const escaped = escapeMarkdownV2(raw);

    expect(escaped).not.toContain('(MEI)');
    expect(escaped).toContain('\\(MEI\\)');
    expect(escaped).toContain('\\#1');
    expect(escaped).toContain('\\!');
  });

  it('formats BRL values in currency format', () => {
    expect(formatBrl(150.5)).toContain('150,50');
    expect(formatBrl('2500.00')).toContain('2.500,00');
  });
});
