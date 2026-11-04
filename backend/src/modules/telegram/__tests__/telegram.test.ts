import { describe, it, expect } from 'vitest';
import { encodeProposalCallback, decodeProposalCallback } from '../domain/callback-data.js';
import { escapeMarkdownV2, formatCurrencyPtBr } from '../domain/messages.pt-BR.js';

describe('Telegram domain helpers', () => {
  it('encodes and decodes proposal callback data within 64 bytes', () => {
    const encodedConfirm = encodeProposalCallback('prop-12345678', 'confirm');
    expect(encodedConfirm).toBe('p:prop-12345678:c');
    expect(Buffer.byteLength(encodedConfirm, 'utf8')).toBeLessThanOrEqual(64);

    const decoded = decodeProposalCallback(encodedConfirm);
    expect(decoded).toEqual({
      proposalId: 'prop-12345678',
      action: 'confirm',
    });

    const encodedCancel = encodeProposalCallback('prop-999', 'cancel');
    expect(encodedCancel).toBe('p:prop-999:x');
    expect(decodeProposalCallback(encodedCancel)?.action).toBe('cancel');
  });

  it('escapes MarkdownV2 characters properly', () => {
    const raw = 'Gasto no Bar & Lanches (10.5)!';
    const escaped = escapeMarkdownV2(raw);
    expect(escaped).toContain('\\(');
    expect(escaped).toContain('\\)');
    expect(escaped).toContain('\\.');
    expect(escaped).toContain('\\!');
  });

  it('formats currency in PT-BR style', () => {
    expect(formatCurrencyPtBr(150.5)).toContain('150,50');
    expect(formatCurrencyPtBr(5000n)).toContain('50,00');
  });
});
