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

  it('manages Pluggy Open Finance configuration and validates inputs', async () => {
    // 1. Get initial configuration
    const configRes = await app.inject({
      method: 'GET',
      url: '/api/openfinance/config',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(configRes.statusCode).toBe(200);
    const configData = configRes.json();
    expect(typeof configData.hasCredentials).toBe('boolean');

    // 2. Reject connect-item without itemId (Zero Trust validation)
    const invalidConnectRes = await app.inject({
      method: 'POST',
      url: '/api/openfinance/connect-item',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(invalidConnectRes.statusCode).toBe(400);
    expect(invalidConnectRes.json().message).toContain('itemId');

    // 3. Clear credentials endpoint
    const clearRes = await app.inject({
      method: 'POST',
      url: '/api/openfinance/config',
      headers: { authorization: `Bearer ${token}` },
      payload: { clientId: '', clientSecret: '' },
    });
    expect(clearRes.statusCode).toBe(200);
    expect(clearRes.json().hasCredentials).toBe(false);
  });

  it('lists and deletes bank connections with strict workspace isolation (IDOR protection)', async () => {
    // 1. Create a second user in different workspace
    const email2 = `user2_bank_${Date.now()}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: {
        name: 'Carlos Consultoria',
        email: email2,
        password: 'Password123!',
        accountType: 'mei',
      },
    });
    const login2Res = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email: email2, password: 'Password123!' },
    });
    const token2 = login2Res.json().token as string;

    // 2. Lookup user 1's workspace
    const user1 = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { memberships: true },
    });
    const ws1Id = user1.memberships[0].workspaceId;

    // 3. Insert a mock BankConnection directly in DB for user 1
    const connection = await prisma.bankConnection.create({
      data: {
        workspaceId: ws1Id,
        provider: 'pluggy',
        itemId: `item-test-${Date.now()}`,
        institution: 'Nubank (Pluggy)',
        status: 'ativa',
        lastSyncAt: new Date(),
        accounts: {
          create: [
            {
              name: 'Conta PJ Nubank',
              kind: 'conta_corrente',
              externalId: 'acc-1',
              entityId: ws1Id,
            },
          ],
        },
        transactions: {
          create: [
            {
              provider: 'pluggy',
              externalId: `tx-nbk-${Date.now()}`,
              direction: 'in',
              amount: '1250.00',
              occurredOn: new Date('2026-11-01'),
              description: 'RECEBIMENTO PIX CLIENTE NUBANK',
              status: 'nova',
            },
          ],
        },
      },
      include: { accounts: true, transactions: true },
    });

    // 4. User 1 can see their connection
    const listRes1 = await app.inject({
      method: 'GET',
      url: '/api/openfinance/connections',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listRes1.statusCode).toBe(200);
    const conns1 = listRes1.json().connections;
    const foundConn1 = conns1.find((c: any) => c.id === connection.id);
    expect(foundConn1).toBeDefined();
    expect(foundConn1.institution).toBe('Nubank (Pluggy)');
    expect(foundConn1.accounts).toHaveLength(1);
    expect(foundConn1.pendingReviewCount).toBe(1);

    // 5. User 2 cannot see User 1's connection (Zero Trust Isolation)
    const listRes2 = await app.inject({
      method: 'GET',
      url: '/api/openfinance/connections',
      headers: { authorization: `Bearer ${token2}` },
    });
    expect(listRes2.statusCode).toBe(200);
    const conns2 = listRes2.json().connections;
    expect(conns2.find((c: any) => c.id === connection.id)).toBeUndefined();

    // 6. User 2 trying to delete User 1's connection fails with 404
    const maliciousDeleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/openfinance/connections/${connection.id}`,
      headers: { authorization: `Bearer ${token2}` },
    });
    expect(maliciousDeleteRes.statusCode).toBe(404);

    // 7. User 1 deletes their own connection
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/openfinance/connections/${connection.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().ok).toBe(true);

    // 8. Verify cascade deletion in database
    const connCheck = await prisma.bankConnection.findUnique({
      where: { id: connection.id },
    });
    expect(connCheck).toBeNull();

    const accCheck = await prisma.bankAccount.findMany({
      where: { connectionId: connection.id },
    });
    expect(accCheck).toHaveLength(0);

    const txCheck = await prisma.bankTransaction.findMany({
      where: { connectionId: connection.id },
    });
    expect(txCheck).toHaveLength(0);
  });
});
