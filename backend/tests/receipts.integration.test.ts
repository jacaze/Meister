import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { AccessKey } from '../src/modules/receipts/domain/AccessKey.js';

describe('Receipts & NFC-e Integration Suite (PostgreSQL 16)', () => {
  let app: FastifyInstance;
  let token: string;
  let email: string;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    email = `receipt_user_${Date.now()}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: {
        name: 'Carlos MEI Materiais',
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

  it('confirms receipt split transaction and persists in fiscal_receipts', async () => {
    // 1. Fetch categories
    const catRes = await app.inject({
      method: 'GET',
      url: '/api/categories',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(catRes.statusCode).toBe(200);
    const categories = catRes.json() as Array<{ id: string; name: string }>;
    expect(categories.length).toBeGreaterThan(0);

    const cat1 = categories[0];
    const cat2 = categories.length > 1 ? categories[1] : categories[0];

    // 2. Confirm receipt transaction with splits
    const base43 = '5026111234567800019565001000000123100000123';
    const accessKey = `${base43}${AccessKey.calculateDv(base43)}`;
    const confirmRes = await app.inject({
      method: 'POST',
      url: '/api/receipts/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        total: '150.00',
        description: 'Compra Atacado Papelaria',
        date: '2026-11-04',
        accessKey,
        issuerCnpj: '00000000000191',
        splits: [
          { categoryId: cat1.id, amount: '100.00', description: 'Materiais de Escritório' },
          { categoryId: cat2.id, amount: '50.00', description: 'Café e Limpeza' },
        ],
      },
    });

    expect(confirmRes.statusCode).toBe(201);
    const tx = confirmRes.json();
    expect(Number(tx.amount)).toBe(150);
    expect(tx.splits).toHaveLength(2);

    // 3. Verify fiscal receipt was registered in database
    const fiscalReceipt = await prisma.fiscalReceipt.findFirst({
      where: { accessKey },
    });
    expect(fiscalReceipt).not.toBeNull();
    expect(fiscalReceipt?.accessKey).toBe(accessKey);
  });
});
