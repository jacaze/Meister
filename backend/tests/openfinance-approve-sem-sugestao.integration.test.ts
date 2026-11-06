import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

/**
 * Regressão: lançamento importado sem categoria sugerida (coluna suggested_category_id nula).
 * O ReviewInboxPage envia `categoryId: null` nesse caso, tanto na aprovação individual quanto
 * em lote, e o backend deve cair na categoria padrão do tipo — como fazia antes dos schemas zod.
 */
describe('Open Finance: aprovar lançamento sem categoria sugerida (Integration)', () => {
  let app: FastifyInstance;
  let token: string;
  let workspaceId: string;

  const auth = () => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await buildApp();
    // Conta criada pelo fluxo real de cadastro: já vem com as categorias padrão do workspace.
    const email = `of-sem-sugestao-${Date.now()}@test.local`;
    const password = 'Password123!';
    const reg = await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'OF Sem Sugestão', email, password, accountType: 'mei' },
    });
    expect(reg.statusCode).toBe(201);
    token = (await app.inject({ method: 'POST', url: '/api/login', payload: { email, password } })).json().token;
    workspaceId = (await app.inject({ method: 'GET', url: '/api/workspace', headers: auth() })).json().workspace.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function importarSemSugestao(quantidade: number): Promise<string[]> {
    const stamp = Date.now();
    // Descrições que nenhuma palavra-chave reconhece: suggestedCategoryId fica nulo
    const transacoes = Array.from({ length: quantidade }, (_, i) => `
  <STMTTRN>
    <TRNTYPE>DEBIT</TRNTYPE>
    <DTPOSTED>2026110${i + 1}120000</DTPOSTED>
    <TRNAMT>-${(42 + i).toFixed(2)}</TRNAMT>
    <FITID>SEM-SUG-${stamp}-${i}</FITID>
    <MEMO>ZXQW ${stamp} ${i} KJHGF</MEMO>
  </STMTTRN>`).join('');
    const ofx = `OFXHEADER:100\n<OFX>${transacoes}\n</OFX>`;

    const imp = await app.inject({
      method: 'POST',
      url: '/api/imports/statement',
      headers: auth(),
      payload: { content: ofx, provider: 'ofx', institution: 'Banco Teste' },
    });
    expect(imp.statusCode).toBe(201);

    const inbox = await app.inject({ method: 'GET', url: '/api/imports', headers: auth() });
    const itens = (inbox.json().items as Array<{ id: string; description: string; suggestedCategoryId?: string | null }>)
      .filter((it) => it.description.includes(String(stamp)));
    expect(itens).toHaveLength(quantidade);
    for (const it of itens) expect(it.suggestedCategoryId ?? null).toBeNull();
    return itens.map((it) => it.id);
  }

  async function expectImportadoComCategoriaPadrao(bankTransactionId: string) {
    const bank = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: bankTransactionId } });
    expect(bank.status).toBe('importada');
    const lancamento = await prisma.transaction.findUniqueOrThrow({ where: { id: bank.importedTransactionId! } });
    const categoria = await prisma.category.findUniqueOrThrow({ where: { id: lancamento.categoryId! } });
    expect(categoria.workspaceId).toBe(workspaceId);
    expect(categoria.type).toBe('despesa');
  }

  it('aprova um item com categoryId: null (corpo exato do ReviewInboxPage)', async () => {
    const [id] = await importarSemSugestao(1);

    const res = await app.inject({
      method: 'POST',
      url: '/api/imports/approve',
      headers: auth(),
      payload: { bankTransactionId: id, categoryId: null },
    });

    expect(res.statusCode).toBe(200);
    await expectImportadoComCategoriaPadrao(id!);
  });

  it('aprova em lote itens com categoryId: null usando a categoria padrão', async () => {
    const ids = await importarSemSugestao(2);

    const res = await app.inject({
      method: 'POST',
      url: '/api/imports/batch-approve',
      headers: auth(),
      payload: { items: ids.map((bankTransactionId) => ({ bankTransactionId, categoryId: null })) },
    });

    expect(res.statusCode).toBe(200);
    for (const id of ids) await expectImportadoComCategoriaPadrao(id);
  });
});
