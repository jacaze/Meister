/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import {
  LocalDate,
  ValidationError,
  ForbiddenError,
  assertCanWrite,
  type WorkspaceScope,
} from '../../../shared/index.js';
import { listTransactions } from '../application/use-cases/ListTransactions.js';
import { createTransaction } from '../application/use-cases/CreateTransaction.js';
import { updateTransaction } from '../application/use-cases/UpdateTransaction.js';
import prisma from '../../../config/prisma.js';

describe('Ledger Module — Unit & Domain Hardening', () => {
  const scope: WorkspaceScope = {
    workspaceId: 'ws-test-ledger-1',
    actorUserId: 'user-test-ledger-1',
    role: 'owner',
    defaultEntityIds: {
      pf: 'entity-pf-1',
      pj: 'entity-pj-1',
    },
  };

  describe('🔴 Bug 3: ListTransactions com saldo líquido negativo', () => {
    it('deve calcular o resumo com resultado negativo sem lançar erro de Money negativo', async () => {
      // Mocking prisma.transaction queries used by listTransactions
      const originalFindMany = prisma.transaction.findMany;
      const originalCount = prisma.transaction.count;

      try {
        // Mock findMany: first call for items, second call for allMatching
        let callCount = 0;
        prisma.transaction.findMany = (async (_args: any) => {
          callCount++;
          if (callCount === 1) {
            return []; // items
          }
          // allMatching: 100 receita, 250 despesa -> saldo -150
          return [
            { amount: 100, type: 'receita' },
            { amount: 250, type: 'despesa' },
          ];
        }) as any;

        prisma.transaction.count = (async () => 2) as any;

        const result = await listTransactions(scope, { page: 1, pageSize: 10 });
        expect(result.resumo.totalEntradas).toBe('100.00');
        expect(result.resumo.totalDespesas).toBe('250.00');
        expect(result.resumo.resultado).toBe('-150.00');
      } finally {
        prisma.transaction.findMany = originalFindMany;
        prisma.transaction.count = originalCount;
      }
    });
  });

  describe('🔴 Bug 2: LocalDate.fromInput com formato brasileiro e rejeição de strings inválidas', () => {
    it('deve interpretar data brasileira DD/MM/AAAA corretamente', () => {
      const parsed = LocalDate.fromInput('04/11/2026', { label: 'Data da transação' });
      expect(parsed.toIsoDate()).toBe('2026-11-04');
      expect(parsed.day).toBe(4);
      expect(parsed.month).toBe(11);
      expect(parsed.year).toBe(2026);
    });

    it('deve rejeitar ano solto ou string ambígua que antes caía em new Date()', () => {
      expect(() => LocalDate.fromInput('2026', { label: 'Data' })).toThrow(ValidationError);
      expect(() => LocalDate.fromInput('not-a-date', { label: 'Data' })).toThrow(ValidationError);
    });
  });

  describe('🟠 Segurança de Papéis: assertCanWrite allowlist', () => {
    it('permite escrita apenas para owner e editor, bloqueando qualquer outro papel', () => {
      expect(() => assertCanWrite({ ...scope, role: 'owner' })).not.toThrow();
      expect(() => assertCanWrite({ ...scope, role: 'editor' })).not.toThrow();
      expect(() => assertCanWrite({ ...scope, role: 'viewer' })).toThrow(ForbiddenError);
      // Papéis arbitrários / desconhecidos devem ser bloqueados
      expect(() => assertCanWrite({ ...scope, role: 'auditor' as any })).toThrow(ForbiddenError);
      expect(() => assertCanWrite({ ...scope, role: 'guest' as any })).toThrow(ForbiddenError);
    });
  });

  describe('🟠 Isolamento Multi-tenant: Categoria de outro workspace com status pendente_revisao', () => {
    it('deve rejeitar categoryId de outro workspace mesmo com status pendente_revisao', async () => {
      const originalFindUnique = prisma.transaction.findUnique;
      const originalFindFirstEntity = prisma.entity.findFirst;
      const originalFindFirstCat = prisma.category.findFirst;

      try {
        prisma.transaction.findUnique = (async () => null) as any;
        prisma.entity.findFirst = (async () => ({ id: 'entity-pf-1', workspaceId: scope.workspaceId })) as any;
        // Category pertence a outro workspace (findFirst com scope.workspaceId retorna null)
        prisma.category.findFirst = (async () => null) as any;

        await expect(
          createTransaction(scope, {
            type: 'despesa',
            amount: '50.00',
            description: 'Compra com categoria externa',
            occurredOn: '2026-11-04',
            status: 'pendente_revisao',
            categoryId: 'cat-from-other-workspace',
          })
        ).rejects.toThrow(ValidationError);
      } finally {
        prisma.transaction.findUnique = originalFindUnique;
        prisma.entity.findFirst = originalFindFirstEntity;
        prisma.category.findFirst = originalFindFirstCat;
      }
    });
  });

  describe('🟠 Validação de Splits na Atualização: UpdateTransaction', () => {
    it('deve rejeitar atualização de valor que divirja da soma dos splits existentes', async () => {
      const originalFindFirst = prisma.transaction.findFirst;

      try {
        prisma.transaction.findFirst = (async () => ({
          id: 'tx-with-splits',
          workspaceId: scope.workspaceId,
          amount: 100,
          type: 'despesa',
          description: 'Lançamento com splits',
          transactionDate: new Date('2026-11-04T00:00:00.000Z'),
          splits: [
            { categoryId: 'cat-1', amount: 60 },
            { categoryId: 'cat-2', amount: 40 },
          ],
        })) as any;

        await expect(
          updateTransaction(scope, 'tx-with-splits', {
            amount: '999.00',
          })
        ).rejects.toThrow(ValidationError);
      } finally {
        prisma.transaction.findFirst = originalFindFirst;
      }
    });
  });
});
