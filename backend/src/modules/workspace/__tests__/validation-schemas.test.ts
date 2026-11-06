import { describe, it, expect } from 'vitest';
import {
  createSplitSchema,
  createTransactionSchema,
  updateTransactionSchema,
  httpCreateTransactionSchema,
  httpUpdateTransactionSchema,
  createTransferSchema,
  registerOwnerWithdrawalSchema,
} from '../../ledger/application/schemas/ledger-schemas.js';
import {
  connectPluggyItemSchema,
  importStatementSchema,
  approveImportedTransactionSchema,
  batchApproveImportedTransactionsSchema,
  ignoreImportedTransactionSchema,
} from '../../openfinance/application/schemas/openfinance-schemas.js';
import {
  parseReceiptPhotoSchema,
  confirmReceiptSplitSchema,
  confirmReceiptSchema,
} from '../../receipts/application/schemas/receipt-schemas.js';
import {
  chatAssistantSchema,
  proposeFromTextSchema,
  assistantProposalParamSchema,
} from '../../assistant/application/schemas/assistant-schemas.js';
import { telegramWebhookUpdateSchema } from '../../telegram/application/schemas/telegram-schemas.js';
import {
  createCategorySchema,
  updateCategorySchema,
} from '../../catalog/application/schemas/category-schemas.js';
import { updateBusinessProfileSchema } from '../application/schemas/workspace-schemas.js';
import {
  registerUserSchema,
  loginUserSchema,
  updateProfileSchema,
} from '../application/schemas/auth-user-schemas.js';
import { markDasPaidSchema } from '../../fiscal/application/schemas/fiscal-schemas.js';
import {
  customJarInputSchema,
  createJarPlanSchema,
  mapCategoriesSchema,
  batchMapCategoriesSchema,
} from '../../jars/application/schemas/jars-schemas.js';
import { updateJarPlanBaseModeSchema } from '../../jars/application/use-cases/UpdateJarPlanBaseMode.js';
import {
  askFinancesSchema,
  submitInsightFeedbackSchema,
  runDetectorsBodySchema,
} from '../../insights/application/schemas/insights-schemas.js';
import {
  submitQuizBodySchema,
  askQuestionBodySchema,
  nudgeFeedbackBodySchema,
} from '../../education/application/schemas/education-schemas.js';
import {
  recordConsentSchema,
  eraseAccountSchema,
} from '../../compliance/application/schemas/compliance-schemas.js';

const UUID = '00000000-0000-4000-8000-000000000000';

const TX_TYPES = ['receita', 'despesa', 'transferencia', 'aporte', 'retirada'] as const;
const HTTP_TX_TYPES = ['receita', 'despesa'] as const;
const PAYMENT_METHODS = ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'outro'] as const;
const HTTP_PAYMENT_METHODS = ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'outro', ''] as const;
const ORIGINS = ['manual', 'open_finance', 'importacao', 'telegram'] as const;
const STATUSES = ['confirmado', 'pendente_revisao'] as const;

describe('Validation Schemas Unit & Boundary Tests (Etapa 3)', () => {
  it('valida ledger-schemas exaustivamente (enums, unions, nullables e limites)', () => {
    expect(createSplitSchema.safeParse({ categoryId: UUID, amount: '10.00', description: 'a'.repeat(1000) }).success).toBe(true);
    expect(createSplitSchema.safeParse({ categoryId: UUID, amount: 10 }).success).toBe(true);
    expect(createSplitSchema.safeParse({ categoryId: 'bad', amount: 10 }).success).toBe(false);
    expect(createSplitSchema.safeParse({ categoryId: UUID, amount: true }).success).toBe(false);
    expect(createSplitSchema.safeParse({ categoryId: UUID, amount: 10, description: 'x'.repeat(1001) }).success).toBe(false);

    for (const type of TX_TYPES) {
      expect(createTransactionSchema.safeParse({ type, amount: '10', description: 'd' }).success).toBe(true);
    }
    for (const type of HTTP_TX_TYPES) {
      expect(updateTransactionSchema.safeParse({ type }).success).toBe(true);
      expect(httpCreateTransactionSchema.safeParse({
        description: 'd',
        amount: 10,
        type,
        categoryId: UUID,
        transactionDate: '2026-03-01',
      }).success).toBe(true);
      expect(httpUpdateTransactionSchema.safeParse({ type }).success).toBe(true);
    }

    for (const paymentMethod of PAYMENT_METHODS) {
      expect(createTransactionSchema.safeParse({ type: 'receita', amount: 10, description: 'd', paymentMethod }).success).toBe(true);
      expect(updateTransactionSchema.safeParse({ paymentMethod }).success).toBe(true);
    }
    for (const paymentMethod of HTTP_PAYMENT_METHODS) {
      expect(httpCreateTransactionSchema.safeParse({
        description: 'd',
        amount: 10,
        type: 'receita',
        categoryId: UUID,
        transactionDate: '2026-03-01',
        paymentMethod,
      }).success).toBe(true);
      expect(httpUpdateTransactionSchema.safeParse({ paymentMethod }).success).toBe(true);
    }

    for (const origin of ORIGINS) {
      expect(createTransactionSchema.safeParse({ type: 'receita', amount: 10, description: 'd', origin }).success).toBe(true);
    }

    for (const status of STATUSES) {
      expect(createTransactionSchema.safeParse({ type: 'receita', amount: 10, description: 'd', status }).success).toBe(true);
      expect(updateTransactionSchema.safeParse({ status }).success).toBe(true);
    }

    expect(createTransactionSchema.safeParse({
      type: 'receita',
      amount: 100,
      description: 'a'.repeat(1000),
      entityId: UUID,
      financialAccountId: null,
      categoryId: null,
      paymentMethod: null,
      sourceRef: null,
      splits: [{ categoryId: UUID, amount: 100 }],
      occurredOn: '2026-03-01',
      transactionDate: '2026-03-01',
      viaPersonalAccount: true,
    }).success).toBe(true);
    expect(createTransactionSchema.safeParse({ type: 'receita', amount: 100, description: '' }).success).toBe(false);
    expect(createTransactionSchema.safeParse({ type: 'receita', amount: 100, description: 'x'.repeat(1001) }).success).toBe(false);

    expect(updateTransactionSchema.safeParse({
      categoryId: null,
      description: 'a',
      amount: '10.50',
      transactionDate: '2026-03-01',
      paymentMethod: null,
      notes: null,
      tags: ['t1'],
      splits: [{ categoryId: UUID, amount: 10.5 }],
      viaPersonalAccount: false,
    }).success).toBe(true);
    expect(updateTransactionSchema.safeParse({ amount: 20, description: 'a'.repeat(1000), notes: 'n'.repeat(2000) }).success).toBe(true);
    expect(updateTransactionSchema.safeParse({ description: '' }).success).toBe(false);
    expect(updateTransactionSchema.safeParse({ description: 'x'.repeat(1001) }).success).toBe(false);
    expect(updateTransactionSchema.safeParse({ notes: 'n'.repeat(2001) }).success).toBe(false);

    const httpCreateParsed = httpCreateTransactionSchema.safeParse({
      description: '  Venda  ',
      amount: '10.00',
      type: 'receita',
      categoryId: UUID,
      transactionDate: '2026-03-01',
      entityId: UUID,
      paymentMethod: null,
      viaPersonalAccount: true,
      sourceRef: 'r'.repeat(255),
    });
    expect(httpCreateParsed.success).toBe(true);
    if (httpCreateParsed.success) {
      expect(httpCreateParsed.data.description).toBe('Venda');
    }
    expect(httpCreateTransactionSchema.safeParse({
      description: 'a'.repeat(1000),
      amount: 10,
      type: 'receita',
      categoryId: 'c1',
      transactionDate: '2026-03-01',
      sourceRef: null,
    }).success).toBe(true);
    expect(httpCreateTransactionSchema.safeParse({
      description: '   ',
      amount: '10.00',
      type: 'receita',
      categoryId: UUID,
      transactionDate: '2026-03-01',
    }).success).toBe(false);
    expect(httpCreateTransactionSchema.safeParse({
      description: 'x'.repeat(1001),
      amount: '10.00',
      type: 'receita',
      categoryId: UUID,
      transactionDate: '2026-03-01',
    }).success).toBe(false);
    expect(httpCreateTransactionSchema.safeParse({
      description: 'ok',
      amount: '10.00',
      type: 'receita',
      categoryId: '',
      transactionDate: '2026-03-01',
    }).success).toBe(false);
    expect(httpCreateTransactionSchema.safeParse({
      description: 'ok',
      amount: '10.00',
      type: 'receita',
      categoryId: UUID,
      transactionDate: '',
    }).success).toBe(false);
    expect(httpCreateTransactionSchema.safeParse({
      description: 'ok',
      amount: '10.00',
      type: 'receita',
      categoryId: UUID,
      transactionDate: '2026-03-01',
      sourceRef: 'r'.repeat(256),
    }).success).toBe(false);

    const httpUpdParsed = httpUpdateTransactionSchema.safeParse({
      description: '  Novo  ',
      amount: '15.00',
      categoryId: 'c1',
      transactionDate: '2026-03-01',
      paymentMethod: null,
      viaPersonalAccount: false,
    });
    expect(httpUpdParsed.success).toBe(true);
    if (httpUpdParsed.success) {
      expect(httpUpdParsed.data.description).toBe('Novo');
    }
    expect(httpUpdateTransactionSchema.safeParse({
      description: 'a'.repeat(1000),
      amount: 15,
    }).success).toBe(true);
    expect(httpUpdateTransactionSchema.safeParse({ description: '   ' }).success).toBe(false);
    expect(httpUpdateTransactionSchema.safeParse({ description: 'x'.repeat(1001) }).success).toBe(false);
    expect(httpUpdateTransactionSchema.safeParse({ categoryId: '' }).success).toBe(false);
    expect(httpUpdateTransactionSchema.safeParse({ transactionDate: '' }).success).toBe(false);

    expect(createTransferSchema.safeParse({
      fromAccountId: UUID,
      toAccountId: UUID,
      amount: '10',
      occurredOn: '2026-03-01',
      description: 'a'.repeat(1000),
    }).success).toBe(true);
    expect(createTransferSchema.safeParse({
      fromAccountId: UUID,
      toAccountId: UUID,
      amount: 10,
      occurredOn: '2026-03-01',
    }).success).toBe(true);
    expect(createTransferSchema.safeParse({
      fromAccountId: UUID,
      toAccountId: UUID,
      amount: 10,
      occurredOn: '',
    }).success).toBe(false);
    expect(createTransferSchema.safeParse({
      fromAccountId: UUID,
      toAccountId: UUID,
      amount: 10,
      occurredOn: '2026-03-01',
      description: 'x'.repeat(1001),
    }).success).toBe(false);

    expect(registerOwnerWithdrawalSchema.safeParse({
      amount: 50,
      occurredOn: '2026-03-01',
      description: 'a'.repeat(1000),
    }).success).toBe(true);
    expect(registerOwnerWithdrawalSchema.safeParse({
      amount: '50',
      occurredOn: '2026-03-01',
    }).success).toBe(true);
    expect(registerOwnerWithdrawalSchema.safeParse({ amount: 50, occurredOn: '' }).success).toBe(false);
    expect(registerOwnerWithdrawalSchema.safeParse({
      amount: 50,
      occurredOn: '2026-03-01',
      description: 'x'.repeat(1001),
    }).success).toBe(false);
  });

  it('valida openfinance-schemas e receipt-schemas exaustivamente', () => {
    expect(connectPluggyItemSchema.safeParse({ itemId: 'i'.repeat(255), entityId: UUID }).success).toBe(true);
    const badPluggy = connectPluggyItemSchema.safeParse({ itemId: '' });
    expect(badPluggy.success).toBe(false);
    if (!badPluggy.success) {
      expect(badPluggy.error.issues[0]?.message).toBe('O itemId retornado pelo Pluggy Connect é obrigatório.');
    }
    const nonStrPluggy = connectPluggyItemSchema.safeParse({ itemId: 123 });
    expect(nonStrPluggy.success).toBe(false);
    if (!nonStrPluggy.success) {
      expect(nonStrPluggy.error.issues[0]?.message).toBe('O itemId retornado pelo Pluggy Connect é obrigatório.');
    }
    expect(connectPluggyItemSchema.safeParse({ itemId: 'x'.repeat(256) }).success).toBe(false);

    for (const provider of ['ofx', 'csv', 'pluggy'] as const) {
      expect(importStatementSchema.safeParse({
        entityId: UUID,
        provider,
        institution: 'i'.repeat(255),
        content: 'c',
      }).success).toBe(true);
    }
    expect(importStatementSchema.safeParse({ content: 'OFX' }).success).toBe(true);
    expect(importStatementSchema.safeParse({ content: '' }).success).toBe(false);
    expect(importStatementSchema.safeParse({ content: 'OFX', institution: 'x'.repeat(256) }).success).toBe(false);

    expect(approveImportedTransactionSchema.safeParse({
      bankTransactionId: UUID,
      categoryId: UUID,
      entityId: UUID,
      viaPersonalAccount: true,
    }).success).toBe(true);
    expect(approveImportedTransactionSchema.safeParse({ bankTransactionId: 'bad' }).success).toBe(false);

    expect(batchApproveImportedTransactionsSchema.safeParse({
      items: Array.from({ length: 500 }, () => ({ bankTransactionId: UUID, categoryId: UUID, entityId: UUID })),
    }).success).toBe(true);
    expect(batchApproveImportedTransactionsSchema.safeParse({
      items: Array.from({ length: 501 }, () => ({ bankTransactionId: UUID })),
    }).success).toBe(false);
    expect(batchApproveImportedTransactionsSchema.safeParse({
      items: [{ bankTransactionId: 'bad' }],
    }).success).toBe(false);

    expect(ignoreImportedTransactionSchema.safeParse({ bankTransactionId: UUID }).success).toBe(true);
    expect(ignoreImportedTransactionSchema.safeParse({ bankTransactionId: 'bad' }).success).toBe(false);

    // Receipt schemas
    for (const mimeType of ['image/jpeg', 'image/png', 'image/webp'] as const) {
      expect(parseReceiptPhotoSchema.safeParse({
        imageBase64: 'a'.repeat(20),
        mimeType,
        entityId: UUID,
      }).success).toBe(true);
    }
    expect(parseReceiptPhotoSchema.safeParse({ textOrQrUrl: 'a'.repeat(10) }).success).toBe(true);
    expect(parseReceiptPhotoSchema.safeParse({ textOrQrUrl: 'a'.repeat(2048) }).success).toBe(true);
    expect(parseReceiptPhotoSchema.safeParse({}).success).toBe(false);
    expect(parseReceiptPhotoSchema.safeParse({ imageBase64: 'a'.repeat(19) }).success).toBe(false);
    expect(parseReceiptPhotoSchema.safeParse({ imageBase64: `   ${'a'.repeat(19)}   ` }).success).toBe(false);
    expect(parseReceiptPhotoSchema.safeParse({ imageBase64: 'a'.repeat(20), mimeType: 'text/plain' }).success).toBe(false);
    expect(parseReceiptPhotoSchema.safeParse({ imageBase64: 'a'.repeat(20), mimeType: 'image/png extra' }).success).toBe(false);
    expect(parseReceiptPhotoSchema.safeParse({ imageBase64: 'a'.repeat(20), mimeType: 'prefix image/png' }).success).toBe(false);
    expect(parseReceiptPhotoSchema.safeParse({ imageBase64: 'a'.repeat(20), mimeType: `image/${'a'.repeat(95)}` }).success).toBe(false);
    expect(parseReceiptPhotoSchema.safeParse({ textOrQrUrl: 'a'.repeat(9) }).success).toBe(false);
    expect(parseReceiptPhotoSchema.safeParse({ textOrQrUrl: `   ${'a'.repeat(9)}   ` }).success).toBe(false);
    expect(parseReceiptPhotoSchema.safeParse({ textOrQrUrl: 'x'.repeat(2049) }).success).toBe(false);

    expect(confirmReceiptSplitSchema.safeParse({ categoryId: UUID, amount: '10.00', description: 'a'.repeat(1000) }).success).toBe(true);
    expect(confirmReceiptSplitSchema.safeParse({ categoryId: UUID, amount: 10 }).success).toBe(true);
    expect(confirmReceiptSplitSchema.safeParse({ categoryId: UUID, amount: '10.00', description: 'x'.repeat(1001) }).success).toBe(false);

    expect(confirmReceiptSchema.safeParse({
      entityId: UUID,
      categoryId: UUID,
      description: 'a'.repeat(1000),
      total: '50.00',
      date: '2026-03-01',
      paymentMethod: null,
      accessKey: 'a'.repeat(100),
      issuerCnpj: 'c'.repeat(20),
      splits: [{ categoryId: UUID, amount: 50 }],
    }).success).toBe(true);
    for (const paymentMethod of PAYMENT_METHODS) {
      expect(confirmReceiptSchema.safeParse({
        total: 50,
        paymentMethod,
      }).success).toBe(true);
    }
    expect(confirmReceiptSchema.safeParse({ total: '50.00', description: 'x'.repeat(1001) }).success).toBe(false);
    expect(confirmReceiptSchema.safeParse({ total: '50.00', accessKey: 'x'.repeat(101) }).success).toBe(false);
    expect(confirmReceiptSchema.safeParse({ total: '50.00', issuerCnpj: 'x'.repeat(21) }).success).toBe(false);
  });

  it('valida assistant, telegram, catalog, workspace, auth/user e fiscal schemas exaustivamente', () => {
    expect(chatAssistantSchema.safeParse({
      message: 'x'.repeat(10000),
      history: [
        { role: 'user', content: 'c'.repeat(10000) },
        { role: 'assistant', content: 'ok' },
      ],
    }).success).toBe(true);
    const badChat = chatAssistantSchema.safeParse({ message: '' });
    expect(badChat.success).toBe(false);
    if (!badChat.success) {
      expect(badChat.error.issues[0]?.message).toBe('Mensagem é obrigatória.');
    }
    const nonStrChat = chatAssistantSchema.safeParse({ message: 123 });
    expect(nonStrChat.success).toBe(false);
    if (!nonStrChat.success) {
      expect(nonStrChat.error.issues[0]?.message).toBe('Mensagem é obrigatória.');
    }
    expect(chatAssistantSchema.safeParse({ message: 'x'.repeat(10001) }).success).toBe(false);
    expect(chatAssistantSchema.safeParse({ message: 'Oi', history: [{ role: 'user', content: 'x'.repeat(10001) }] }).success).toBe(false);

    expect(proposeFromTextSchema.safeParse({
      entityId: UUID,
      text: 't'.repeat(10000),
    }).success).toBe(true);
    const badPropose = proposeFromTextSchema.safeParse({ text: '' });
    expect(badPropose.success).toBe(false);
    if (!badPropose.success) {
      expect(badPropose.error.issues[0]?.message).toBe('Texto da mensagem é obrigatório.');
    }
    const nonStrPropose = proposeFromTextSchema.safeParse({ text: 123 });
    expect(nonStrPropose.success).toBe(false);
    if (!nonStrPropose.success) {
      expect(nonStrPropose.error.issues[0]?.message).toBe('Texto da mensagem é obrigatório.');
    }
    expect(proposeFromTextSchema.safeParse({ text: 'x'.repeat(10001) }).success).toBe(false);

    expect(assistantProposalParamSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(assistantProposalParamSchema.safeParse({ id: 'bad' }).success).toBe(false);

    expect(telegramWebhookUpdateSchema.safeParse({
      update_id: 1,
      message: {
        message_id: 10,
        chat: { id: 123, type: 'private', title: 'T', username: 'u' },
        from: { id: 1, is_bot: false, first_name: 'F', username: 'u' },
        date: 1000,
        text: 'x'.repeat(10000),
        caption: 'c'.repeat(10000),
        photo: [{ file_id: 'f1' }],
        document: { file_id: 'd1' },
      },
      callback_query: {
        id: 'cb1',
        from: { id: 1 },
        data: 'd1',
        message: {
          message_id: 20,
          chat: { id: 123 },
        },
      },
    }).success).toBe(true);
    // Testa pass-through do telegram
    const tgParsed = telegramWebhookUpdateSchema.safeParse({
      update_id: 2,
      message: { chat: { id: 'str-id' } },
      custom_extra_field: 'preserved_by_passthrough',
    });
    expect(tgParsed.success).toBe(true);
    if (tgParsed.success) {
      expect((tgParsed.data as Record<string, unknown>).custom_extra_field).toBe('preserved_by_passthrough');
    }
    expect(telegramWebhookUpdateSchema.safeParse({ update_id: 'bad' }).success).toBe(false);
    expect(telegramWebhookUpdateSchema.safeParse({
      update_id: 1,
      message: { chat: { id: 123 }, text: 'x'.repeat(10001) },
    }).success).toBe(false);
    expect(telegramWebhookUpdateSchema.safeParse({
      update_id: 1,
      message: { chat: { id: 123 }, caption: 'x'.repeat(10001) },
    }).success).toBe(false);
    expect(telegramWebhookUpdateSchema.safeParse({
      update_id: 1,
      message: { chat: {} },
    }).success).toBe(false);
    expect(telegramWebhookUpdateSchema.safeParse({
      update_id: 1,
      message: { chat: { id: 123 }, from: { id: 'not-a-number' } },
    }).success).toBe(false);
    expect(telegramWebhookUpdateSchema.safeParse({
      update_id: 1,
      callback_query: {},
    }).success).toBe(false);
    expect(telegramWebhookUpdateSchema.safeParse({
      update_id: 1,
      callback_query: { id: 'cb1', from: {} },
    }).success).toBe(false);
    expect(telegramWebhookUpdateSchema.safeParse({
      update_id: 1,
      callback_query: { id: 'cb1', from: { id: 'bad' } },
    }).success).toBe(false);

    for (const type of ['receita', 'despesa'] as const) {
      expect(createCategorySchema.safeParse({
        name: 'n'.repeat(60),
        type,
        color: 'c'.repeat(20),
        icon: 'i'.repeat(50),
      }).success).toBe(true);
      expect(updateCategorySchema.safeParse({
        name: 'n'.repeat(60),
        type,
        color: 'c'.repeat(20),
        icon: 'i'.repeat(50),
      }).success).toBe(true);
    }
    expect(createCategorySchema.safeParse({ name: '', type: 'receita' }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: 'x'.repeat(61), type: 'receita' }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: 'Vendas', type: 'receita', color: 'x'.repeat(21) }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: 'Vendas', type: 'receita', icon: 'x'.repeat(51) }).success).toBe(false);

    expect(updateCategorySchema.safeParse({ name: '' }).success).toBe(false);
    expect(updateCategorySchema.safeParse({ name: 'x'.repeat(61) }).success).toBe(false);
    expect(updateCategorySchema.safeParse({ color: 'x'.repeat(21) }).success).toBe(false);
    expect(updateCategorySchema.safeParse({ icon: 'x'.repeat(51) }).success).toBe(false);

    expect(updateBusinessProfileSchema.safeParse({
      cnpj: '11222333000181',
      legalName: 'l'.repeat(255),
      tradeName: 't'.repeat(255),
      openedOn: '2026-01-01',
      activity: 'servicos',
    }).success).toBe(true);
    // Testa legalName e tradeName null (enviados pelo ProfilePage.tsx)
    expect(updateBusinessProfileSchema.safeParse({
      cnpj: '11.222.333/0001-81',
      legalName: null,
      tradeName: null,
      openedOn: '2026-01-01',
      activity: 'comercio',
    }).success).toBe(true);
    expect(updateBusinessProfileSchema.safeParse({
      cnpj: '11.222.333/0001-81',
      openedOn: '2026-01-01',
      activity: 'misto',
    }).success).toBe(true);
    expect(updateBusinessProfileSchema.safeParse({
      cnpj: '11.222.333/0001-81',
      openedOn: '2026-01-01',
      activity: 'invalido',
    }).success).toBe(false);
    expect(updateBusinessProfileSchema.safeParse({ legalName: 'x'.repeat(256) }).success).toBe(false);
    expect(updateBusinessProfileSchema.safeParse({ tradeName: 'x'.repeat(256) }).success).toBe(false);

    // Auth & user schemas
    for (const accountType of ['mei', 'pessoa_fisica'] as const) {
      const regParsed = registerUserSchema.safeParse({
        name: '  Ana  ',
        email: '  ANA@TEST.COM ',
        password: 'p'.repeat(255),
        accountType,
      });
      expect(regParsed.success).toBe(true);
      if (regParsed.success) {
        expect(regParsed.data.name).toBe('Ana');
        expect(regParsed.data.email).toBe('ana@test.com');
      }
      expect(updateProfileSchema.safeParse({ accountType }).success).toBe(true);
    }
    expect(registerUserSchema.safeParse({ name: 'n'.repeat(120), email: 'a@b.c', password: '1' }).success).toBe(true);
    expect(registerUserSchema.safeParse({ name: '', email: 'a@b.c', password: '123' }).success).toBe(false);
    expect(registerUserSchema.safeParse({ name: 'x'.repeat(121), email: 'a@b.c', password: '123' }).success).toBe(false);
    expect(registerUserSchema.safeParse({ name: 'Ana', email: 'invalido', password: '123' }).success).toBe(false);
    expect(registerUserSchema.safeParse({ name: 'Ana', email: 'a@b', password: '123' }).success).toBe(false);
    expect(registerUserSchema.safeParse({ name: 'Ana', email: '@b.c', password: '123' }).success).toBe(false);
    expect(registerUserSchema.safeParse({ name: 'Ana', email: 'a @b.c', password: '123' }).success).toBe(false);
    expect(registerUserSchema.safeParse({ name: 'Ana', email: `${'a'.repeat(249)}@b.co`, password: '123' }).success).toBe(true);
    expect(registerUserSchema.safeParse({ name: 'Ana', email: `${'a'.repeat(250)}@b.co`, password: '123' }).success).toBe(false);
    expect(registerUserSchema.safeParse({ name: 'Ana', email: 'a@b.c', password: '' }).success).toBe(false);
    expect(registerUserSchema.safeParse({ name: 'Ana', email: 'a@b.c', password: 'x'.repeat(256) }).success).toBe(false);

    const loginParsed = loginUserSchema.safeParse({ email: ' USER@TEST.COM ', password: 'p'.repeat(255) });
    expect(loginParsed.success).toBe(true);
    if (loginParsed.success) {
      expect(loginParsed.data.email).toBe('user@test.com');
    }
    expect(loginUserSchema.safeParse({ email: 'x'.repeat(254), password: '1' }).success).toBe(true);
    expect(loginUserSchema.safeParse({ email: '   ', password: '123' }).success).toBe(false);
    expect(loginUserSchema.safeParse({ email: 'x'.repeat(255), password: '123' }).success).toBe(false);
    expect(loginUserSchema.safeParse({ email: 'a@b.c', password: '' }).success).toBe(false);
    expect(loginUserSchema.safeParse({ email: 'a@b.c', password: 'x'.repeat(256) }).success).toBe(false);

    const updProfParsed = updateProfileSchema.safeParse({ name: '  Novo Nome  ' });
    expect(updProfParsed.success).toBe(true);
    if (updProfParsed.success) {
      expect(updProfParsed.data.name).toBe('Novo Nome');
    }
    expect(updateProfileSchema.safeParse({ name: 'n'.repeat(120) }).success).toBe(true);
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: 'x'.repeat(121) }).success).toBe(false);

    expect(markDasPaidSchema.safeParse({ paidOn: '2026-03-01', paidAmount: '70.60' }).success).toBe(true);
    expect(markDasPaidSchema.safeParse({ paidOn: '2026-03-01', paidAmount: 70.6 }).success).toBe(true);
    expect(markDasPaidSchema.safeParse({ paidOn: '' }).success).toBe(false);
  });

  it('valida jars, insights, education e compliance schemas exaustivamente', () => {
    expect(customJarInputSchema.safeParse({
      slug: 's'.repeat(100),
      name: 'N'.repeat(100),
      percent: 0,
      fixedAmount: '10',
      rollover: true,
      goalAmount: 100,
      goalDate: '2026-12-31',
    }).success).toBe(true);
    expect(customJarInputSchema.safeParse({
      slug: 's',
      name: 'N',
      percent: 100,
      fixedAmount: 10,
      goalAmount: '100',
    }).success).toBe(true);
    expect(customJarInputSchema.safeParse({ slug: '', name: 'N', percent: 50 }).success).toBe(false);
    expect(customJarInputSchema.safeParse({ slug: 's'.repeat(101), name: 'N', percent: 50 }).success).toBe(false);
    expect(customJarInputSchema.safeParse({ slug: 's', name: '', percent: 50 }).success).toBe(false);
    expect(customJarInputSchema.safeParse({ slug: 's', name: 'N'.repeat(101), percent: 50 }).success).toBe(false);
    expect(customJarInputSchema.safeParse({ slug: 's', name: 'N', percent: -1 }).success).toBe(false);
    expect(customJarInputSchema.safeParse({ slug: 's', name: 'N', percent: 101 }).success).toBe(false);

    for (const baseMode of ['mes_atual', 'mes_anterior', 'media_3_meses'] as const) {
      expect(createJarPlanSchema.safeParse({
        entityId: UUID,
        name: 'n'.repeat(100),
        templateSlug: 't'.repeat(100),
        baseMode,
      }).success).toBe(true);
      expect(updateJarPlanBaseModeSchema.safeParse({ baseMode }).success).toBe(true);
    }
    expect(updateJarPlanBaseModeSchema.safeParse({ baseMode: 'invalido' }).success).toBe(false);
    expect(createJarPlanSchema.safeParse({ customJars: [{ slug: 'p1', name: 'P1', percent: 100 }] }).success).toBe(true);
    const badBaseMode = createJarPlanSchema.safeParse({ templateSlug: 'seis-potes', baseMode: 'invalido' });
    expect(badBaseMode.success).toBe(false);
    if (!badBaseMode.success) {
      expect(badBaseMode.error.issues[0]?.message).toBe('Base de cálculo inválida. Use mes_atual, mes_anterior ou media_3_meses');
    }
    expect(createJarPlanSchema.safeParse({}).success).toBe(false);
    expect(createJarPlanSchema.safeParse({ templateSlug: '' }).success).toBe(false);
    expect(createJarPlanSchema.safeParse({ customJars: [] }).success).toBe(false);
    expect(createJarPlanSchema.safeParse({ templateSlug: 'seis-potes', name: 'x'.repeat(101) }).success).toBe(false);
    expect(createJarPlanSchema.safeParse({ templateSlug: 'x'.repeat(101) }).success).toBe(false);

    const mapCatParsed = mapCategoriesSchema.safeParse({ planId: 'p1', jarId: 'j1' });
    expect(mapCatParsed.success).toBe(true);
    if (mapCatParsed.success) {
      expect(mapCatParsed.data.categoryIds).toEqual([]);
    }
    expect(mapCategoriesSchema.safeParse({ planId: 'p1', jarId: 'j1', categoryIds: [UUID] }).success).toBe(true);
    expect(mapCategoriesSchema.safeParse({ planId: '', jarId: 'j1' }).success).toBe(false);
    expect(mapCategoriesSchema.safeParse({ planId: 'p1', jarId: '' }).success).toBe(false);

    const batchMapParsed = batchMapCategoriesSchema.safeParse({
      planId: 'p1',
      mappings: [{ jarId: 'j1' }],
    });
    expect(batchMapParsed.success).toBe(true);
    if (batchMapParsed.success) {
      expect(batchMapParsed.data.mappings[0]?.categoryIds).toEqual([]);
    }
    expect(batchMapCategoriesSchema.safeParse({ planId: '', mappings: [{ jarId: 'j1' }] }).success).toBe(false);
    expect(batchMapCategoriesSchema.safeParse({ planId: 'p1', mappings: [] }).success).toBe(false);
    expect(batchMapCategoriesSchema.safeParse({ planId: 'p1', mappings: [{ jarId: '' }] }).success).toBe(false);

    const askFinParsed = askFinancesSchema.safeParse({
      entityId: UUID,
      question: '  Qual meu saldo?  ',
    });
    expect(askFinParsed.success).toBe(true);
    if (askFinParsed.success) {
      expect(askFinParsed.data.question).toBe('Qual meu saldo?');
    }
    expect(askFinancesSchema.safeParse({ question: 'q'.repeat(1000) }).success).toBe(true);
    expect(askFinancesSchema.safeParse({ question: '   ' }).success).toBe(false);
    expect(askFinancesSchema.safeParse({ question: 'x'.repeat(1001) }).success).toBe(false);

    for (const value of ['util', 'inutil'] as const) {
      expect(submitInsightFeedbackSchema.safeParse({
        value,
        reason: 'r'.repeat(1000),
      }).success).toBe(true);
    }
    expect(submitInsightFeedbackSchema.safeParse({ value: 'invalido' }).success).toBe(false);
    expect(submitInsightFeedbackSchema.safeParse({ value: 'util', reason: 'x'.repeat(1001) }).success).toBe(false);

    expect(runDetectorsBodySchema.safeParse({ entityId: UUID }).success).toBe(true);
    expect(runDetectorsBodySchema.safeParse({}).success).toBe(true);
    expect(runDetectorsBodySchema.safeParse({ entityId: 'bad' }).success).toBe(false);

    expect(submitQuizBodySchema.safeParse({ answers: Array.from({ length: 100 }, () => 0) }).success).toBe(true);
    expect(submitQuizBodySchema.safeParse({ answers: [] }).success).toBe(false);
    expect(submitQuizBodySchema.safeParse({ answers: [-1] }).success).toBe(false);
    expect(submitQuizBodySchema.safeParse({ answers: Array.from({ length: 101 }, () => 0) }).success).toBe(false);

    const askEduParsed = askQuestionBodySchema.safeParse({ question: '  O que é DAS?  ', contextId: UUID });
    expect(askEduParsed.success).toBe(true);
    if (askEduParsed.success) {
      expect(askEduParsed.data.question).toBe('O que é DAS?');
    }
    expect(askQuestionBodySchema.safeParse({ question: 'q'.repeat(500) }).success).toBe(true);
    expect(askQuestionBodySchema.safeParse({ question: '   ' }).success).toBe(false);
    expect(askQuestionBodySchema.safeParse({ question: 'x'.repeat(501) }).success).toBe(false);

    for (const feedback of ['util', 'inutil'] as const) {
      expect(nudgeFeedbackBodySchema.safeParse({ feedback }).success).toBe(true);
    }
    expect(nudgeFeedbackBodySchema.safeParse({ feedback: 'bad' }).success).toBe(false);

    for (const kind of ['terms', 'privacy', 'ai_processing', 'open_finance'] as const) {
      expect(recordConsentSchema.safeParse({
        kind,
        accepted: true,
        version: 'v'.repeat(50),
      }).success).toBe(true);
    }
    expect(recordConsentSchema.safeParse({ kind: 'terms', accepted: false }).success).toBe(true);
    expect(recordConsentSchema.safeParse({ kind: 'terms', accepted: true, version: 'x'.repeat(51) }).success).toBe(false);
    expect(recordConsentSchema.safeParse({ kind: 'bad', accepted: true }).success).toBe(false);

    expect(eraseAccountSchema.safeParse({ password: 'p'.repeat(255) }).success).toBe(true);
    expect(eraseAccountSchema.safeParse({ password: '' }).success).toBe(false);
    expect(eraseAccountSchema.safeParse({ password: 'x'.repeat(256) }).success).toBe(false);
  });
});
