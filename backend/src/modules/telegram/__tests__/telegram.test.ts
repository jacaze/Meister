import { describe, expect, it } from 'vitest';
import { decodeProposalCallback, encodeProposalCallback } from '../domain/callback-data.js';
import { MessagesPtBr, escapeMarkdownV2, formatBrl } from '../domain/messages.pt-BR.js';

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

  it('formats receipt proposal ready message with splits and duplicates', () => {
    const formatted = MessagesPtBr.receiptProposalReady({
      issuerName: 'Papelaria & Cia',
      total: '120.00',
      issuedOn: '2026-11-04',
      splits: [
        { categoryName: 'Mercadorias / Insumos', amount: '80.00', jarName: 'Operação' },
        { categoryName: 'Alimentação', amount: '40.00', jarName: 'Pessoal' },
      ],
      duplicate: true,
      duplicateDate: '2026-11-03',
    });

    expect(formatted).toContain('Papelaria & Cia');
    expect(formatted).toContain('R$ 120,00');
    expect(formatted).toContain('04/11/2026');
    expect(formatted).not.toContain('2026\\-11\\-04');
    expect(formatted).toContain('Mercadorias / Insumos');
    expect(formatted).toContain('Atenção');
    expect(formatted).toContain('03/11/2026');
  });

  it('proposalReady mostra valor com milhar e data dd/mm/aaaa', () => {
    const text = MessagesPtBr.proposalReady({
      type: 'receita',
      amount: '3500.00',
      description: 'Recebimento de cliente via PIX',
      categoryName: 'Serviços',
      date: '2026-12-21',
      scope: 'pf',
    });
    expect(text).toContain('R$ 3\\.500,00');
    expect(text).toContain('21/12/2026');
    expect(text).not.toContain('2026\\-12\\-21');
  });

  it('proposalConfirmed usa percentual com vírgula', () => {
    const text = MessagesPtBr.proposalConfirmed({
      description: 'Venda',
      amount: '67500.00',
      type: 'receita',
      impact: { jarName: 'Operação', jarPercentUsed: 75, meiPercentUsed: 80.56 },
    });
    expect(text).toContain('R$ 67\\.500,00');
    expect(text).toContain('75,0%');
    expect(text).toContain('80,6%');
    expect(text).not.toContain('75.0');
  });
});
