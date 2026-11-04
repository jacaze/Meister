import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

describe('OpenFinance & Statement Imports Integration Suite (PostgreSQL 16)', () => {
  let app: FastifyInstance;
  let token: string;
  let email: string;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    email = `ofx_user_${Date.now()}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: {
        name: 'Ana MEI Fotografia',
        email,
        password: 'Password123!',
        accountType: 'mei',
      },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email, password: 'Password123!' },
    });
    token = loginRes.json().token as string;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('imports OFX statement, reviews inbox, approves and ignores transactions', async () => {
    const runId = Date.now();
    const fit1 = `OFX-FIT-${runId}-001`;
    const fit2 = `OFX-FIT-${runId}-002`;

    const ofxSample = `
OFXHEADER:100
<OFX>
  <STMTTRN>
    <TRNTYPE>CREDIT</TRNTYPE>
    <DTPOSTED>20261104120000</DTPOSTED>
    <TRNAMT>2500.00</TRNAMT>
    <FITID>${fit1}</FITID>
    <MEMO>PIX ENSAIO FOTOGRAFICO</MEMO>
  </STMTTRN>
  <STMTTRN>
    <TRNTYPE>DEBIT</TRNTYPE>
    <DTPOSTED>20261104120000</DTPOSTED>
    <TRNAMT>-320.00</TRNAMT>
    <FITID>${fit2}</FITID>
    <MEMO>ALUGUEL LENTES</MEMO>
  </STMTTRN>
</OFX>
    `;

    // 1. Import Statement
    const importRes = await app.inject({
      method: 'POST',
      url: '/api/imports/statement',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: ofxSample,
        provider: 'ofx',
        institution: 'Banco Cora',
      },
    });

    expect(importRes.statusCode).toBe(201);
    const importData = importRes.json();
    expect(importData.totalParsed).toBe(2);
    expect(importData.importedCount).toBe(2);
    expect(importData.duplicatesSkipped).toBe(0);

    // 2. Re-importing same statement should skip duplicates
    const reimportRes = await app.inject({
      method: 'POST',
      url: '/api/imports/statement',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: ofxSample,
        provider: 'ofx',
      },
    });
    expect(reimportRes.statusCode).toBe(201);
    expect(reimportRes.json().duplicatesSkipped).toBe(2);

    // 3. Review Inbox
    const inboxRes = await app.inject({
      method: 'GET',
      url: '/api/imports',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(inboxRes.statusCode).toBe(200);
    const items = inboxRes.json().items as Array<{ id: string; amount: string; direction: string }>;
    expect(items).toHaveLength(2);

    const creditItem = items.find((i) => i.direction === 'in')!;
    const debitItem = items.find((i) => i.direction === 'out')!;

    // 4. Approve credit transaction into ledger
    const approveRes = await app.inject({
      method: 'POST',
      url: '/api/imports/approve',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        bankTransactionId: creditItem.id,
      },
    });
    expect(approveRes.statusCode).toBe(200);
    const approvedTx = approveRes.json();
    expect(Number(approvedTx.amount)).toBe(2500);

    // 5. Ignore debit transaction
    const ignoreRes = await app.inject({
      method: 'POST',
      url: '/api/imports/ignore',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        bankTransactionId: debitItem.id,
      },
    });
    expect(ignoreRes.statusCode).toBe(200);

    // 6. Check inbox is now empty of 'nova' items
    const emptyInboxRes = await app.inject({
      method: 'GET',
      url: '/api/imports',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(emptyInboxRes.json().items).toHaveLength(0);
  });
});
