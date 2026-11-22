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

  describe('TransferDetector (transferência entre contas próprias)', () => {
    const c = (
      id: string,
      direction: 'in' | 'out',
      amount: string,
      bankAccountId: string | null,
      occurredOn = '2026-11-04',
    ) => ({ id, direction, amount, occurredOn, description: 'Pix', bankAccountId });

    it('pareia saída e entrada de contas DIFERENTES com mesmo valor em até 1 dia', () => {
      const pairs = TransferDetector.findSuspectPairs([
        { ...c('1', 'out', '500.00', 'conta-pf'), description: 'Pix enviado para conta PF' },
        { ...c('2', 'in', '500.00', 'conta-pj'), description: 'Pix recebido de PJ' },
        { ...c('3', 'out', '120.00', 'conta-pf'), description: 'Supermercado' },
      ]);
      expect(pairs).toHaveLength(1);
      expect(pairs[0]!.outId).toBe('1');
      expect(pairs[0]!.inId).toBe('2');
      expect(pairs[0]!.amount).toBe('500.00');
    });

    it('NÃO pareia saída e entrada da MESMA conta (pagamento a um terceiro e recebimento de outro)', () => {
      const pairs = TransferDetector.findSuspectPairs([
        c('1', 'in', '15.00', 'conta-a', '2026-11-03'),
        c('2', 'out', '15.00', 'conta-a', '2026-11-04'),
      ]);
      expect(pairs).toEqual([]);
    });

    it('NÃO pareia quando a conta de qualquer lado é desconhecida (null)', () => {
      expect(
        TransferDetector.findSuspectPairs([c('1', 'out', '15.00', null), c('2', 'in', '15.00', 'conta-b')]),
      ).toEqual([]);
      expect(
        TransferDetector.findSuspectPairs([c('1', 'out', '15.00', 'conta-a'), c('2', 'in', '15.00', null)]),
      ).toEqual([]);
      expect(
        TransferDetector.findSuspectPairs([c('1', 'out', '15.00', null), c('2', 'in', '15.00', null)]),
      ).toEqual([]);
    });

    it('com a entrada da mesma conta primeiro, ainda pareia com a entrada de outra conta', () => {
      const pairs = TransferDetector.findSuspectPairs([
        c('out', 'out', '15.00', 'conta-a'),
        c('in-mesma', 'in', '15.00', 'conta-a'),
        c('in-outra', 'in', '15.00', 'conta-b'),
      ]);
      expect(pairs).toHaveLength(1);
      expect(pairs[0]!.inId).toBe('in-outra');
    });

    it('compara valores em centavos: "15" e "15.00" são o mesmo valor, e o par sai normalizado', () => {
      const pairs = TransferDetector.findSuspectPairs([
        c('1', 'out', '15', 'conta-a'),
        c('2', 'in', '15.00', 'conta-b'),
      ]);
      expect(pairs).toHaveLength(1);
      expect(pairs[0]!.amount).toBe('15.00');
      expect(pairs[0]!.reason).toContain('R$ 15,00');
    });

    it('não pareia valores diferentes nem datas a mais de 1,5 dia', () => {
      expect(
        TransferDetector.findSuspectPairs([c('1', 'out', '15.00', 'a'), c('2', 'in', '15.01', 'b')]),
      ).toEqual([]);
      expect(
        TransferDetector.findSuspectPairs([
          c('1', 'out', '15.00', 'a', '2026-11-01'),
          c('2', 'in', '15.00', 'b', '2026-11-04'),
        ]),
      ).toEqual([]);
    });
  });

  it('reads Pluggy configuration from environment and creates connect token', async () => {
    const { getPluggyConfig } = await import(
      '../application/use-cases/ConfigurePluggy.js'
    );
    const { createConnectToken } = await import(
      '../application/use-cases/CreateConnectToken.js'
    );

    const prevId = process.env.PLUGGY_CLIENT_ID;
    const prevSec = process.env.PLUGGY_CLIENT_SECRET;
    try {
      process.env.PLUGGY_CLIENT_ID = 'client-12345678';
      process.env.PLUGGY_CLIENT_SECRET = 'secret-12345678';

      const readConfig = getPluggyConfig();
      expect(readConfig.hasCredentials).toBe(true);

      const fakeAggregator = {
        validateCredentials: async () => ({ valid: true }),
        createConnectToken: async () => 'test-token-123',
        fetchItem: async () => ({ id: 'item-1', status: 'UPDATED', createdAt: '2026-01-01' }),
        fetchAccounts: async () => [],
        fetchTransactions: async () => [],
        syncItem: async () => ({ status: 'UPDATING' }),
      };

      const scope = {
        workspaceId: 'ws-1',
        actorUserId: 'usr-1',
        role: 'owner' as const,
        defaultEntityIds: { pf: 'pf-1', pj: 'pj-1' },
        visibleEntityIds: ['pf-1', 'pj-1'],
        ownEntityIds: ['pf-1', 'pj-1'],
      };

      const tokenRes = await createConnectToken(scope, { aggregator: fakeAggregator });
      expect(tokenRes.accessToken).toBe('test-token-123');
    } finally {
      if (prevId !== undefined) process.env.PLUGGY_CLIENT_ID = prevId;
      else delete process.env.PLUGGY_CLIENT_ID;
      if (prevSec !== undefined) process.env.PLUGGY_CLIENT_SECRET = prevSec;
      else delete process.env.PLUGGY_CLIENT_SECRET;
    }
  });

  it('PluggyClient fetches v2 transactions with cursor pagination and defensive amount parsing', async () => {
    const { PluggyClient } = await import('../infra/PluggyClient.js');

    const client = new PluggyClient({
      clientId: 'mock-client',
      clientSecret: 'mock-secret',
      baseUrl: 'https://mock.pluggy.ai',
    });

    const originalFetch = globalThis.fetch;
    const fetchCalls: Array<{ url: string; headers?: Record<string, string> }> = [];

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), headers: init?.headers as Record<string, string> | undefined });

      if (String(url).endsWith('/auth')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ apiKey: 'mock-api-key' }),
        } as unknown as Response;
      }

      if (String(url).includes('/v2/transactions')) {
        // Page 1 returns a transaction and a next cursor
        if (!String(url).includes('after=')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  id: 'tx-1',
                  description: 'Venda de Consultoria',
                  amount: 150.75,
                  date: '2026-11-04',
                  type: 'CREDIT',
                },
              ],
              next: '?after=cursor-xyz',
            }),
          } as unknown as Response;
        }

        // Page 2 returns second transaction and next: null
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                id: 'tx-2',
                description: 'Assinatura Software',
                amount: 'invalid-number',
                date: '2026-11-04',
                type: 'DEBIT',
              },
            ],
            next: null,
          }),
        } as unknown as Response;
      }

      return { ok: false, status: 404, statusText: 'Not Found' } as unknown as Response;
    }) as unknown as typeof fetch;

    try {
      const txs = await client.fetchTransactions('acc-1', {
        from: '2026-10-01',
        to: '2026-11-04',
      });

      expect(txs).toHaveLength(2);
      expect(txs[0]!.id).toBe('tx-1');
      expect(txs[0]!.amount).toBe(150.75);

      // Defensive fallback for invalid/NaN amount
      expect(txs[1]!.id).toBe('tx-2');
      expect(txs[1]!.amount).toBe(0);

      // Verify that query parameters were correctly mapped to dateFrom and dateTo
      expect(fetchCalls[1]!.url).toContain('accountId=acc-1');
      expect(fetchCalls[1]!.url).toContain('dateFrom=2026-10-01');
      expect(fetchCalls[1]!.url).toContain('dateTo=2026-11-04');
      expect(fetchCalls[2]!.url).toContain('after=cursor-xyz');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
