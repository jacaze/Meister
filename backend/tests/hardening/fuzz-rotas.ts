import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/config/prisma.js';
import { provisionWorkspace } from '../../src/modules/workspace/public.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(backendDir, '.env.test') });
process.env.NODE_ENV = 'test';

export interface RouteFuzzTarget {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  urlTemplate: string; // ex: '/api/transactions/:id'
  group: string;
  name: string;
  validPayloadBase: Record<string, unknown>;
  hasParamId?: boolean;
}

// 16 rotas de escrita
export const TARGET_ROUTES: RouteFuzzTarget[] = [
  // 1. Grupo Dinheiro
  {
    method: 'POST',
    urlTemplate: '/api/transactions',
    group: '1. Dinheiro',
    name: 'POST /api/transactions',
    validPayloadBase: {
      description: 'Venda de consultoria',
      amount: 150.00,
      type: 'receita',
      transactionDate: '2026-03-15T12:00:00Z',
    },
  },
  {
    method: 'PUT',
    urlTemplate: '/api/transactions/:id',
    group: '1. Dinheiro',
    name: 'PUT /api/transactions/:id',
    hasParamId: true,
    validPayloadBase: {
      description: 'Venda atualizada',
      amount: 180.00,
      type: 'receita',
    },
  },
  {
    method: 'POST',
    urlTemplate: '/api/transfers',
    group: '1. Dinheiro',
    name: 'POST /api/transfers',
    validPayloadBase: {
      amount: 100.00,
      transferType: 'transfer',
      description: 'Transferência entre contas',
    },
  },
  {
    method: 'POST',
    urlTemplate: '/api/owner-withdrawals',
    group: '1. Dinheiro',
    name: 'POST /api/owner-withdrawals',
    validPayloadBase: {
      amount: 250.00,
      description: 'Retirada de pró-labore',
    },
  },

  // 2. Grupo Open Finance
  {
    method: 'POST',
    urlTemplate: '/api/openfinance/connect-token',
    group: '2. Open Finance',
    name: 'POST /api/openfinance/connect-token',
    validPayloadBase: {
      itemId: 'pluggy-item-12345',
    },
  },
  {
    method: 'POST',
    urlTemplate: '/api/openfinance/import-statements',
    group: '2. Open Finance',
    name: 'POST /api/openfinance/import-statements',
    validPayloadBase: {
      connectionId: 'conn-pluggy-01',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    },
  },
  {
    method: 'POST',
    urlTemplate: '/api/openfinance/batch-approve',
    group: '2. Open Finance',
    name: 'POST /api/openfinance/batch-approve',
    validPayloadBase: {
      transactionIds: ['00000000-0000-0000-0000-000000000001'],
    },
  },

  // 3. Grupo Notas Fiscais
  {
    method: 'POST',
    urlTemplate: '/api/receipts/confirm',
    group: '3. Notas Fiscais',
    name: 'POST /api/receipts/confirm',
    validPayloadBase: {
      receiptId: '00000000-0000-0000-0000-000000000001',
      amount: 120.50,
      date: '2026-03-10',
    },
  },

  // 4. Grupo Telegram & Assistente
  {
    method: 'POST',
    urlTemplate: '/telegram/webhook',
    group: '4. Telegram & Assistente',
    name: 'POST /telegram/webhook',
    validPayloadBase: {
      update_id: 10001,
      message: {
        message_id: 1,
        chat: { id: 999999, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: 'Registrar almoço de 45 reais',
      },
    },
  },
  {
    method: 'POST',
    urlTemplate: '/api/assistant/chat',
    group: '4. Telegram & Assistente',
    name: 'POST /api/assistant/chat',
    validPayloadBase: {
      message: 'Quanto gastei este mês?',
    },
  },
  {
    method: 'POST',
    urlTemplate: '/api/assistant/proposals/:id/approve',
    group: '4. Telegram & Assistente',
    name: 'POST /api/assistant/proposals/:id/approve',
    hasParamId: true,
    validPayloadBase: {
      modifications: { amount: 50.00 },
    },
  },

  // 5. Grupo Categorias, Fiscal & Auth
  {
    method: 'POST',
    urlTemplate: '/api/categories',
    group: '5. Categorias, Fiscal & Auth',
    name: 'POST /api/categories',
    validPayloadBase: {
      name: 'Software e Ferramentas',
      type: 'despesa',
    },
  },
  {
    method: 'POST',
    urlTemplate: '/api/fiscal/generate-invoice',
    group: '5. Categorias, Fiscal & Auth',
    name: 'POST /api/fiscal/generate-invoice',
    validPayloadBase: {
      amount: 1500.00,
      description: 'Desenvolvimento de software MEI',
      customerName: 'Cliente Teste',
      customerCpfCnpj: '12345678909',
    },
  },
  {
    method: 'POST',
    urlTemplate: '/api/workspaces/members',
    group: '5. Categorias, Fiscal & Auth',
    name: 'POST /api/workspaces/members',
    validPayloadBase: {
      email: 'colaborador@empresa.com',
      role: 'member',
    },
  },
  {
    method: 'POST',
    urlTemplate: '/api/register',
    group: '5. Categorias, Fiscal & Auth',
    name: 'POST /api/register',
    validPayloadBase: {
      name: 'Novo Usuário',
      email: 'novo_usuario_valido@teste.local',
      password: 'SenhaForte123!',
      accountType: 'mei',
    },
  },

  // 6. Grupo Potes
  {
    method: 'POST',
    urlTemplate: '/api/jars/plan',
    group: '6. Potes',
    name: 'POST /api/jars/plan',
    validPayloadBase: {
      baseMode: 'percentage',
      percentage: 20,
    },
  },
  {
    method: 'PUT',
    urlTemplate: '/api/jars/categories',
    group: '6. Potes',
    name: 'PUT /api/jars/categories',
    validPayloadBase: {
      categoryId: '00000000-0000-0000-0000-000000000001',
      jarId: '00000000-0000-0000-0000-000000000002',
    },
  },
];

// Montador de aninhamento profundo
function makeDeepNestedObject(depth: number): Record<string, unknown> {
  let obj: Record<string, unknown> = { leaf: 'deep_val' };
  for (let i = 0; i < depth; i++) {
    obj = { level: obj };
  }
  return obj;
}

export async function runFuzzProbe() {
  const app: FastifyInstance = await buildApp();

  // Usuário A (requisitante principal)
  let userA = await prisma.user.findFirst({ where: { email: 'fuzz-test@meister.local' } });
  if (!userA) {
    userA = await prisma.user.create({
      data: {
        name: 'Fuzz Tester A',
        email: 'fuzz-test@meister.local',
        passwordHash: 'dummy',
        accountType: 'mei',
      },
    });
  }

  const scopeA = await prisma.workspaceMember.findFirst({
    where: { userId: userA.id },
    include: { workspace: true },
  });
  let workspaceIdA = scopeA?.workspaceId;
  if (!workspaceIdA) {
    const provA = await provisionWorkspace({
      userId: userA.id,
      accountType: 'mei',
      workspaceName: 'Workspace Fuzz A',
    });
    workspaceIdA = provA.workspaceId;
  }

  // Usuário B e recurso no Workspace B (para prova de isolamento entre workspaces)
  let userB = await prisma.user.findFirst({ where: { email: 'other-user@meister.local' } });
  if (!userB) {
    userB = await prisma.user.create({
      data: {
        name: 'User B',
        email: 'other-user@meister.local',
        passwordHash: 'dummy',
        accountType: 'mei',
      },
    });
  }
  const scopeB = await prisma.workspaceMember.findFirst({
    where: { userId: userB.id },
    include: { workspace: true },
  });
  let workspaceIdB = scopeB?.workspaceId;
  if (!workspaceIdB) {
    const provB = await provisionWorkspace({
      userId: userB.id,
      accountType: 'mei',
      workspaceName: 'Workspace B',
    });
    workspaceIdB = provB.workspaceId;
  }

  // Obter ou criar uma transação no Workspace B
  const entityB = await prisma.entity.findFirst({ where: { workspaceId: workspaceIdB } });
  const categoryB = await prisma.category.findFirst({ where: { workspaceId: workspaceIdB } });
  let txInWorkspaceB = await prisma.transaction.findFirst({ where: { workspaceId: workspaceIdB } });
  if (!txInWorkspaceB && entityB && categoryB) {
    txInWorkspaceB = await prisma.transaction.create({
      data: {
        workspaceId: workspaceIdB,
        entityId: entityB.id,
        categoryId: categoryB.id,
        amount: 50.0,
        type: 'despesa',
        description: 'Transação do Workspace B',
        transactionDate: new Date(),
      },
    });
  }
  const foreignResourceId = txInWorkspaceB?.id ?? 'e52692f2-62a2-40b0-bc8f-65dde6949a48';

  const token = app.jwt.sign(
    { sub: userA.id, userId: userA.id, email: userA.email, wid: workspaceIdA },
    { expiresIn: '1h' }
  );

  const defaultHeaders: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  };

  const results: Array<{
    group: string;
    name: string;
    desc: string;
    status: number;
    is500: boolean;
    code?: string;
    message?: string;
  }> = [];

  for (const target of TARGET_ROUTES) {
    // Definir os casos adversariais
    const cases: Array<{
      desc: string;
      urlOverride?: string;
      payloadOverride?: unknown;
      contentType?: string;
      customHeaders?: Record<string, string>;
    }> = [
      { desc: 'corpo null', payloadOverride: null },
      { desc: 'array no lugar de objeto []', payloadOverride: [] },
      { desc: 'Content-Type errado (text/plain)', contentType: 'text/plain', payloadOverride: 'raw text payload' },
      { desc: 'string de 1 MB em campo string', payloadOverride: { ...target.validPayloadBase, description: 'X'.repeat(1024 * 1024), text: 'X'.repeat(1024 * 1024), message: 'X'.repeat(1024 * 1024), name: 'X'.repeat(1024 * 1024) } },
      { desc: 'objeto muito aninhado (profundidade 50)', payloadOverride: { ...target.validPayloadBase, nested: makeDeepNestedObject(50) } },
      { desc: 'chave __proto__ maliciosa', payloadOverride: JSON.parse('{"__proto__": {"admin": true}}') },
      { desc: 'chave constructor maliciosa', payloadOverride: JSON.parse('{"constructor": {"prototype": {"polluted": true}}}') },
      { desc: 'número como string ("1500")', payloadOverride: { ...target.validPayloadBase, amount: '1500', update_id: '1500' } },
      { desc: 'número com vírgula ("1.500,00")', payloadOverride: { ...target.validPayloadBase, amount: '1.500,00' } },
      { desc: 'data inválida ("2026-02-30")', payloadOverride: { ...target.validPayloadBase, transactionDate: '2026-02-30', date: '2026-02-30', dateFrom: '2026-02-30' } },
    ];

    // Se a rota possui parâmetro :id, adicionamos os casos de UUID inválido e ID de outro workspace
    if (target.hasParamId) {
      cases.push({
        desc: 'UUID inválido no :id (formato não-UUID)',
        urlOverride: target.urlTemplate.replace(':id', 'uuid-invalido-123'),
        payloadOverride: target.validPayloadBase,
      });
      cases.push({
        desc: 'id existente de OUTRO workspace no :id',
        urlOverride: target.urlTemplate.replace(':id', foreignResourceId),
        payloadOverride: target.validPayloadBase,
      });
    }

    for (const testCase of cases) {
      const finalUrl = testCase.urlOverride || target.urlTemplate.replace(':id', '00000000-0000-0000-0000-000000000000');
      const reqHeaders: Record<string, string> = {
        ...defaultHeaders,
        ...(testCase.contentType ? { 'content-type': testCase.contentType } : {}),
        ...(testCase.customHeaders || {}),
      };

      if (target.urlTemplate === '/api/register' || target.urlTemplate === '/telegram/webhook') {
        delete reqHeaders['authorization'];
      }

      try {
        const res = await app.inject({
          method: target.method,
          url: finalUrl,
          headers: reqHeaders,
          payload: testCase.payloadOverride as Record<string, unknown>,
        });

        const status = res.statusCode;
        let responseBody: Record<string, unknown> = {};
        try {
          responseBody = res.json() as Record<string, unknown>;
        } catch {
          // ignore non-json
        }

        results.push({
          group: target.group,
          name: target.name,
          desc: testCase.desc,
          status,
          is500: status >= 500,
          code: typeof responseBody?.code === 'string' ? responseBody.code : undefined,
          message: typeof responseBody?.message === 'string' ? responseBody.message : undefined,
        });
      } catch (err: unknown) {
        const error = err as Error;
        results.push({
          group: target.group,
          name: target.name,
          desc: testCase.desc,
          status: 500,
          is500: true,
          code: 'UNCAUGHT_EXCEPTION',
          message: error?.message,
        });
      }
    }
  }

  await app.close();
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runFuzzProbe().then((results) => {
    console.log('\n========================================================================');
    console.log('       RELATÓRIO OFICIAL DO PROBE DE FUZZ ADVERSARIAL (ANTES)           ');
    console.log('========================================================================\n');

    let total500 = 0;
    const totalTested = results.length;

    console.log('| Grupo | Rota | Cenário Adversarial | Status | Código de Erro |');
    console.log('|---|---|---|:---:|---|');
    for (const r of results) {
      if (r.is500) total500++;
      const statusLabel = r.is500 ? `🔴 ${r.status}` : `${r.status}`;
      console.log(`| ${r.group} | ${r.name} | ${r.desc} | ${statusLabel} | ${r.code || '-'} |`);
    }

    console.log('\n------------------------------------------------------------------------');
    console.log(`Total de requisições de fuzz testadas: ${totalTested}`);
    console.log(`Total de respostas 500 (Erros Internos): ${total500}`);
    console.log('------------------------------------------------------------------------\n');
  });
}
