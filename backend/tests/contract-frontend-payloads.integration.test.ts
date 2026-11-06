import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

function generateUniqueCnpj(): string {
  const n = Array.from({ length: 8 }, () => Math.floor(Math.random() * 9));
  const base = [...n, 0, 0, 0, 1];
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let s1 = 0;
  for (let i = 0; i < 12; i++) s1 += base[i]! * w1[i]!;
  const r1 = s1 % 11;
  const d1 = r1 < 2 ? 0 : 11 - r1;
  base.push(d1);
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let s2 = 0;
  for (let i = 0; i < 13; i++) s2 += base[i]! * w2[i]!;
  const r2 = s2 % 11;
  const d2 = r2 < 2 ? 0 : 11 - r2;
  base.push(d2);
  const raw = base.join('');
  return `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5, 8)}/${raw.slice(8, 12)}-${raw.slice(12, 14)}`;
}

/**
 * Suíte de Contrato: Payloads REAIS do Frontend e Telegram
 *
 * Cada teste abaixo constrói a chamada e o corpo HTTP EXATAMENTE como os
 * componentes do frontend (frontend/src) e os webhooks do Telegram enviam,
 * incluindo:
 * - campos opcionais ausentes;
 * - strings vazias ('') ou null quando enviados pela UI;
 * - números formatados como string ('150.00' ou '70.60');
 * - updates reais do Telegram com metadados pass-through.
 *
 * Garante que nenhum corpo válido do frontend é rejeitado (Zero Regressão de Contrato).
 */
describe('Frontend & Telegram Real Payloads Contract Suite (PostgreSQL 16)', () => {
  let app: FastifyInstance;
  let token: string;
  let userId: string;
  let workspaceId: string;
  let pjEntityId: string;
  let revenueCategoryId: string;
  let expenseCategoryId: string;
  let jarPlanId: string;
  const webhookSecret = 'test_webhook_secret_telegram_32_chars_long';
  const fakeChatId = `chat_contract_${Date.now()}`;

  beforeAll(async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = webhookSecret;
    app = await buildApp({ logger: false });
    await app.ready();

    // 1. AuthContext.tsx:98 — POST /api/register
    const email = `contract_user_${Date.now()}@test.com`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: {
        name: 'Maria Contrato MEI',
        email,
        password: 'Password123!',
        accountType: 'mei',
      },
    });
    expect(regRes.statusCode).toBe(201);

    // 2. AuthContext.tsx:88 — POST /api/login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: {
        email,
        password: 'Password123!',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    token = loginRes.json().token as string;

    const user = await prisma.user.findUnique({ where: { email } });
    userId = user!.id;

    const member = await prisma.workspaceMember.findFirst({
      where: { userId },
    });
    workspaceId = member!.workspaceId;

    const pjEntity = await prisma.entity.findFirst({
      where: { workspaceId, isMei: true },
    });
    pjEntityId = pjEntity!.id;

    const revCat = await prisma.category.findFirst({
      where: { workspaceId, type: 'receita' },
    });
    revenueCategoryId = revCat!.id;

    const expCat = await prisma.category.findFirst({
      where: { workspaceId, type: 'despesa' },
    });
    expenseCategoryId = expCat!.id;

    // Cria plano de potes inicial para o workspace
    const planRes = await app.inject({
      method: 'POST',
      url: '/api/jars/plan',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        templateSlug: 'seis-potes',
        baseMode: 'mes_atual',
      },
    });
    expect(planRes.statusCode).toBe(201);

    const plan = await prisma.jarPlan.findFirst({
      where: { workspaceId, active: true },
      include: { jars: true },
    });
    jarPlanId = plan!.id;

    // Vincula chat do telegram
    const linkTokenRes = await app.inject({
      method: 'POST',
      url: '/api/telegram/link-token',
      headers: { authorization: `Bearer ${token}` },
    });
    const linkToken = linkTokenRes.json().token;
    const linkRes = await app.inject({
      method: 'POST',
      url: '/telegram/webhook',
      headers: { 'x-telegram-bot-api-secret-token': webhookSecret },
      payload: {
        update_id: Math.floor(Math.random() * 1000000000),
        message: {
          message_id: 1,
          from: { id: 888777, is_bot: false, first_name: 'Maria' },
          chat: { id: fakeChatId, type: 'private' },
          text: `/start ${linkToken}`,
        },
      },
    });
    expect(linkRes.statusCode).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('1. ProfilePage.tsx:139 — PUT /api/entities/:id/business-profile com legalName e tradeName null', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/entities/${pjEntityId}/business-profile`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        cnpj: generateUniqueCnpj(),
        legalName: null,
        tradeName: null,
        openedOn: '2020-01-01',
        activity: 'servicos',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(pjEntityId);
  });

  it('2. ProfilePage.tsx:164 & 188 — POST /api/telegram/link-token e re-vinculação', async () => {
    const linkRes = await app.inject({
      method: 'POST',
      url: '/api/telegram/link-token',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(linkRes.statusCode).toBe(201);
    expect(linkRes.json().token).toBeDefined();

    // Garante que o vínculo do fakeChatId continue ativo
    const currentLink = await prisma.telegramLink.findFirst({
      where: { userId, status: 'ativo' },
    });
    expect(currentLink).not.toBeNull();
  });

  it('3. QuickTransactionModal.tsx:170 — POST /api/transactions com payload real da UI', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        description: 'Venda de doces artesanais',
        amount: '85.50',
        type: 'receita',
        categoryId: revenueCategoryId,
        transactionDate: '2026-03-01',
        paymentMethod: 'pix',
        viaPersonalAccount: false,
        entityId: pjEntityId,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(Number(body.amount)).toBe(85.5);
  });

  it('4. EditTransactionSheet.tsx:121 — PUT /api/transactions/:id com payload real da UI', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        description: 'Original',
        amount: '50.00',
        type: 'despesa',
        categoryId: expenseCategoryId,
        transactionDate: '2026-03-01',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const txId = createRes.json().id;

    const res = await app.inject({
      method: 'PUT',
      url: `/api/transactions/${txId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        description: 'Editado pelo componente',
        amount: 60,
        categoryId: expenseCategoryId,
        transactionDate: '2026-03-02',
        paymentMethod: 'cartao_debito',
        viaPersonalAccount: false,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().description).toBe('Editado pelo componente');
  });

  it('5. TransactionsPage.tsx:254 — DELETE /api/transactions/:id', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        description: 'Para excluir',
        amount: '20.00',
        type: 'despesa',
        categoryId: expenseCategoryId,
        transactionDate: '2026-03-01',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const txId = createRes.json().id;

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/transactions/${txId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(delRes.statusCode).toBe(204);
  });

  it('6. QuickTransactionModal.tsx:89 & 155 — POST /api/receipts/parse e /api/receipts/confirm', async () => {
    const parseRes = await app.inject({
      method: 'POST',
      url: '/api/receipts/parse',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        textOrQrUrl: 'https://www.sefaz.sp.gov.br/nfce/qrcode?p=35260100000000000191650010000000011000000018',
      },
    });
    expect(parseRes.statusCode).toBe(200);

    const confirmRes = await app.inject({
      method: 'POST',
      url: '/api/receipts/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        total: '120.00',
        description: 'Compra de Suprimentos',
        date: '2026-03-01',
        paymentMethod: 'pix',
        categoryId: expenseCategoryId,
      },
    });
    expect(confirmRes.statusCode).toBe(201);
    expect(confirmRes.json().id).toBeDefined();
  });

  it('7. FloatingAssistantWidget.tsx:161, 202, 226 & 263 — Chamadas do Assistente', async () => {
    const chatRes = await app.inject({
      method: 'POST',
      url: '/api/assistant/chat',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        message: 'Quanto gastei este mês?',
        history: [],
      },
    });
    expect(chatRes.statusCode).toBe(200);

    const propRes = await app.inject({
      method: 'POST',
      url: '/api/assistant/proposals',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        text: 'Recebi 500 reais de pintura residencial',
      },
    });
    expect(propRes.statusCode).toBe(200);
    const proposalId = propRes.json().proposalId;

    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/assistant/proposals/${proposalId}/cancel`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(cancelRes.statusCode).toBe(200);

    const receiptRes = await app.inject({
      method: 'POST',
      url: '/api/assistant/receipt',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        textOrQrUrl: 'https://sefaz.gov.br/consulta-nfce-valida',
      },
    });
    expect(receiptRes.statusCode).toBe(200);
  });

  it('8. ReviewInboxPage.tsx:122, 158, 190, 207, 236 — Open Finance e Importações', async () => {
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/api/openfinance/connect-token',
      headers: { authorization: `Bearer ${token}` },
    });
    expect([200, 400]).toContain(tokenRes.statusCode);
    if (tokenRes.statusCode === 400) {
      expect(tokenRes.json().details).toBeUndefined();
    }

    const fitId = `FIT_OFX_${Date.now()}`;
    const ofxContent = `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260301120000[-03:EST]</DTPOSTED><TRNAMT>450.00</TRNAMT><FITID>${fitId}</FITID><MEMO>PIX RECEBIDO CLIENTE CONTRATO</MEMO></STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const importRes = await app.inject({
      method: 'POST',
      url: '/api/imports/statement',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: ofxContent,
        provider: 'ofx',
      },
    });
    expect(importRes.statusCode).toBe(201);

    const bankTx = await prisma.bankTransaction.findFirst({
      where: { connection: { workspaceId }, externalId: fitId },
    });
    expect(bankTx).not.toBeNull();

    const approveRes = await app.inject({
      method: 'POST',
      url: '/api/imports/approve',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        bankTransactionId: bankTx!.id,
        categoryId: revenueCategoryId,
        entityId: pjEntityId,
        viaPersonalAccount: false,
      },
    });
    expect(approveRes.statusCode).toBe(200);
  });

  it('9. PluggyConnectFallbackModal.tsx:35 & BankConnectionsCard.tsx:51, 72', async () => {
    // 9a. Envia payload exatamente como o modal envia (itemId válido)
    const connectRes = await app.inject({
      method: 'POST',
      url: '/api/openfinance/connect-item',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        itemId: 'pluggy_item_contract_real',
      },
    });
    // Se o serviço mock ou fallback não tiver internet, pode responder 400 da Pluggy, mas NUNCA erro de schema Zod com details
    if (connectRes.statusCode === 400) {
      expect(connectRes.json().details).toBeUndefined();
    }

    // 9b. Testa sync e exclusão de conexão existente
    const conn = await prisma.bankConnection.create({
      data: {
        workspaceId,
        provider: 'pluggy',
        itemId: 'conn_to_sync_and_delete',
        institution: 'Banco Teste',
        status: 'ativa',
      },
    });

    const syncRes = await app.inject({
      method: 'POST',
      url: `/api/openfinance/connections/${conn.id}/sync`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect([200, 400]).toContain(syncRes.statusCode);
    if (syncRes.statusCode === 400) {
      expect(syncRes.json().details).toBeUndefined();
    }

    const delConnRes = await app.inject({
      method: 'DELETE',
      url: `/api/openfinance/connections/${conn.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(delConnRes.statusCode).toBe(200);
  });

  it('10. RegisterWithdrawalSheet.tsx:56 — POST /api/owner-withdrawals', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/owner-withdrawals',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        amount: '1200.00',
        occurredOn: '2026-03-01',
        description: 'Retirada pró-labore mensal',
        paymentMethod: 'pix',
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('11. MarkDasPaidSheet.tsx:75 & DasPage.tsx:154 — POST & DELETE /api/das/:id/pay', async () => {
    const das = await prisma.dasCharge.create({
      data: {
        workspace: { connect: { id: workspaceId } },
        entity: { connect: { id: pjEntityId } },
        competence: '2026-01',
        amount: 75.6,
        status: 'pendente',
        dueDate: new Date('2026-02-20'),
      },
    });

    const payRes = await app.inject({
      method: 'POST',
      url: `/api/das/${das.id}/pay`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        paidOn: '2026-02-18',
        paidAmount: '75.60',
      },
    });
    expect(payRes.statusCode).toBe(200);

    const unpayRes = await app.inject({
      method: 'DELETE',
      url: `/api/das/${das.id}/pay`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(unpayRes.statusCode).toBe(200);
  });

  it('12. ConfigurePlanSheet.tsx:114, 137, JarsPage.tsx:185 & MapCategoriesSheet.tsx:90', async () => {
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/jars/plan/${jarPlanId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        baseMode: 'mes_anterior',
      },
    });
    expect(patchRes.statusCode).toBe(200);

    const createPlanRes = await app.inject({
      method: 'POST',
      url: '/api/jars/plan',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        templateSlug: 'seis-potes',
        baseMode: 'mes_atual',
      },
    });
    expect(createPlanRes.statusCode).toBe(201);
    const newPlanId = createPlanRes.json().id;

    const newPlan = await prisma.jarPlan.findUnique({
      where: { id: newPlanId },
      include: { jars: true },
    });
    const targetJarId = newPlan!.jars[0]!.id;

    // PUT /jars/categories (JarsPage.tsx:185 — array de categoryIds)
    const mapRes = await app.inject({
      method: 'PUT',
      url: '/api/jars/categories',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planId: newPlanId,
        jarId: targetJarId,
        categoryIds: [revenueCategoryId],
      },
    });
    expect(mapRes.statusCode).toBe(200);

    // PUT /jars/categories/batch (MapCategoriesSheet.tsx:90)
    const batchMapRes = await app.inject({
      method: 'PUT',
      url: '/api/jars/categories/batch',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planId: newPlanId,
        mappings: [
          { jarId: targetJarId, categoryIds: [revenueCategoryId] },
        ],
      },
    });
    expect(batchMapRes.statusCode).toBe(200);
  });

  it('13. InsightsPage.tsx:109, 125, 140, 149 — Insights', async () => {
    const runRes = await app.inject({
      method: 'POST',
      url: '/api/insights/run',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        entityId: pjEntityId,
      },
    });
    expect(runRes.statusCode).toBe(200);

    const askRes = await app.inject({
      method: 'POST',
      url: '/api/insights/ask',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        question: 'Qual a previsão do meu fluxo de caixa?',
      },
    });
    expect(askRes.statusCode).toBe(200);

    const insight = await prisma.insight.findFirst({
      where: { workspaceId },
    });

    if (insight) {
      const fbRes = await app.inject({
        method: 'POST',
        url: `/api/insights/${insight.id}/feedback`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          value: 'util',
        },
      });
      expect(fbRes.statusCode).toBe(200);
    }
  });

  it('14. EducationPage.tsx:159 & 192 — Educação Financeira', async () => {
    const quizRes = await app.inject({
      method: 'POST',
      url: '/api/education/lessons/limite-mei-80/quiz',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        answers: [1, 2],
      },
    });
    expect(quizRes.statusCode).toBe(200);

    const askRes = await app.inject({
      method: 'POST',
      url: '/api/education/ask',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        question: 'O que acontece se eu ultrapassar o limite do MEI em menos de 20%?',
      },
    });
    expect(askRes.statusCode).toBe(200);
  });

  it('15. Telegram Webhooks Reais — Mensagem de texto, Foto e Callback de botão', async () => {
    // 15a. Mensagem de texto com metadados reais do Telegram
    const textUpdateRes = await app.inject({
      method: 'POST',
      url: '/telegram/webhook',
      headers: { 'x-telegram-bot-api-secret-token': webhookSecret },
      payload: {
        update_id: Math.floor(Math.random() * 1000000000),
        message: {
          message_id: 101,
          from: { id: 888777, is_bot: false, first_name: 'Maria', language_code: 'pt-br' },
          chat: { id: fakeChatId, type: 'private', first_name: 'Maria' },
          date: Math.floor(Date.now() / 1000),
          text: 'Recebi 250 via pix agora de almoço executivo',
        },
      },
    });
    expect(textUpdateRes.statusCode).toBe(200);

    // 15b. Callback query real com message aninhada
    const prop = await prisma.proposal.create({
      data: {
        workspaceId,
        userId,
        draft: {
          type: 'receita',
          amount: '250.00',
          description: 'Almoço executivo',
          occurredOn: new Date().toISOString().slice(0, 10),
        },
        confidence: 0.9,
        status: 'aberta',
        source: 'texto',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    const cbUpdateRes = await app.inject({
      method: 'POST',
      url: '/telegram/webhook',
      headers: { 'x-telegram-bot-api-secret-token': webhookSecret },
      payload: {
        update_id: Math.floor(Math.random() * 1000000000),
        callback_query: {
          id: 'cb_contract_9002',
          from: { id: 888777, is_bot: false, first_name: 'Maria' },
          message: {
            message_id: 102,
            chat: { id: fakeChatId, type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text: 'Proposta encontrada',
          },
          chat_instance: 'instance_123',
          data: `p:${prop.id}:c`,
        },
      },
    });
    expect(cbUpdateRes.statusCode).toBe(200);

    const confirmed = await prisma.proposal.findUnique({
      where: { id: prop.id },
    });
    expect(confirmed?.status).toBe('confirmada');
  });
});
