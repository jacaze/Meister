import { describe, expect, it } from 'vitest';
import { StatementParser } from '../domain/StatementParser.js';
import { TransferDetector } from '../domain/TransferDetector.js';

describe('OpenFinance Module — Statement Parsers & Transfer Detection', () => {
  it('parses OFX format with DEBIT and CREDIT transactions', () => {
    const ofxSample = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>CREDIT</TRNTYPE>
            <DTPOSTED>20261104120000[-03:EST]</DTPOSTED>
            <TRNAMT>1500.00</TRNAMT>
            <FITID>TX-20261104-001</FITID>
            <MEMO>PIX RECEBIDO CLIENTE</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20261104120000[-03:EST]</DTPOSTED>
            <TRNAMT>-230.50</TRNAMT>
            <FITID>TX-20261104-002</FITID>
            <MEMO>COMPRA MATERIAIS ESCRITORIO</MEMO>
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
    `;

    const txs = StatementParser.parse(ofxSample);
    expect(txs).toHaveLength(2);

    expect(txs[0]!.direction).toBe('in');
    expect(txs[0]!.amount).toBe('1500.00');
    expect(txs[0]!.description).toBe('PIX RECEBIDO CLIENTE');
    expect(txs[0]!.externalId).toBe('TX-20261104-001');
    expect(txs[0]!.occurredOn).toBe('2026-11-04');

    expect(txs[1]!.direction).toBe('out');
    expect(txs[1]!.amount).toBe('230.50');
    expect(txs[1]!.description).toBe('COMPRA MATERIAIS ESCRITORIO');
    expect(txs[1]!.externalId).toBe('TX-20261104-002');
  });

  it('parses CSV format with Brazilian currency formatting and semicolon delimiter', () => {
    const csvSample = `
Data;Descrição;Valor
04/11/2026;Venda de Mercadoria;R$ 850,00
04/11/2026;Almoço comercial Restaurante;-45,50
    `.trim();

    const txs = StatementParser.parseCsv(csvSample);
    expect(txs).toHaveLength(2);

    expect(txs[0]!.direction).toBe('in');
    expect(txs[0]!.amount).toBe('850.00');
    expect(txs[0]!.description).toBe('Venda de Mercadoria');
    expect(txs[0]!.occurredOn).toBe('2026-11-04');

    expect(txs[1]!.direction).toBe('out');
    expect(txs[1]!.amount).toBe('45.50');
    expect(txs[1]!.description).toBe('Almoço comercial Restaurante');
  });

  it('detects suspect transfer pairs between own accounts within 1 day', () => {
    const candidates = [
      { id: '1', direction: 'out' as const, amount: '500.00', occurredOn: '2026-11-04', description: 'Pix enviado para conta PF' },
      { id: '2', direction: 'in' as const, amount: '500.00', occurredOn: '2026-11-04', description: 'Pix recebido de PJ' },
      { id: '3', direction: 'out' as const, amount: '120.00', occurredOn: '2026-11-04', description: 'Supermercado' },
    ];

    const pairs = TransferDetector.findSuspectPairs(candidates);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.outId).toBe('1');
    expect(pairs[0]!.inId).toBe('2');
    expect(pairs[0]!.amount).toBe('500.00');
  });
});
