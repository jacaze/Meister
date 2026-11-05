import type { Prisma } from '@prisma/client';
import prisma from '../../../../config/prisma.js';
import { assertCanWrite, type WorkspaceScope } from '../../../../shared/index.js';
import type { BankingAggregator } from '../ports/BankingAggregator.js';
import { PluggyClient } from '../../infra/PluggyClient.js';
import { TransferDetector } from '../../domain/TransferDetector.js';

export interface ConnectPluggyItemInput {
  readonly itemId: string;
  readonly entityId?: string;
  readonly aggregator?: BankingAggregator;
  readonly daysBack?: number;
}

export interface ConnectPluggyItemResult {
  readonly connectionId: string;
  readonly institution: string;
  readonly accountsCount: number;
  readonly importedTransactionsCount: number;
  readonly duplicatesSkippedCount: number;
  readonly transferSuspectsCount: number;
}

export async function connectPluggyItem(
  scope: WorkspaceScope,
  input: ConnectPluggyItemInput
): Promise<ConnectPluggyItemResult> {
  assertCanWrite(scope);

  const client = input.aggregator || new PluggyClient();

  // 1. Fetch Item info from Pluggy
  const item = await client.fetchItem(input.itemId);
  const institutionName = item.connector?.name || 'Banco Conectado (Pluggy)';

  // 2. Find or create BankConnection
  let connection = await prisma.bankConnection.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      provider: 'pluggy',
      itemId: input.itemId,
    },
  });

  if (!connection) {
    connection = await prisma.bankConnection.create({
      data: {
        workspaceId: scope.workspaceId,
        provider: 'pluggy',
        itemId: input.itemId,
        institution: institutionName,
        status: 'ativa',
        lastSyncAt: new Date(),
      },
    });
  } else {
    connection = await prisma.bankConnection.update({
      where: { id: connection.id },
      data: {
        institution: institutionName,
        status: 'ativa',
        lastSyncAt: new Date(),
      },
    });
  }

  // 3. Fetch categories for auto-mapping
  const categories = await prisma.category.findMany({
    where: { workspaceId: scope.workspaceId },
  });
  const catSlugMap = new Map<string, string>();
  for (const c of categories) {
    catSlugMap.set(c.slug, c.id);
  }

  // Helper to suggest category from Pluggy category or description
  const mapSuggestedCategory = (description: string, pluggyCat?: string): string | undefined => {
    const text = `${description} ${pluggyCat || ''}`.toLowerCase();
    if (/\b(almo[cç]o|restaurante|refei[cç][aã]o|ifood|uber\s*eats|padaria|supermercado|mercado|a[cç]ougue)\b/i.test(text)) {
      return catSlugMap.get('alimentacao');
    }
    if (/\b(uber|99|combustivel|gasolina|posto|estacionamento|pedagio|passagem)\b/i.test(text)) {
      return catSlugMap.get('transporte');
    }
    if (/\b(software|nuvem|aws|google|adobe|hospedagem|internet|celular|telefone|energia|luz|aluguel)\b/i.test(text)) {
      return catSlugMap.get('operacao') || catSlugMap.get('outras-despesas');
    }
    if (/\b(cliente|servi[cç]o|consultoria|projeto|honor[aá]rios|venda)\b/i.test(text)) {
      return catSlugMap.get('prestacao-servicos') || catSlugMap.get('venda-mercadorias');
    }
    return undefined;
  };

  // 4. Fetch accounts
  const accounts = await client.fetchAccounts(input.itemId);
  const targetEntityId = input.entityId || scope.defaultEntityIds.pj || scope.defaultEntityIds.pf;

  let importedTransactionsCount = 0;
  let duplicatesSkippedCount = 0;
  const createdItems = [];

  const daysBack = input.daysBack || 90;
  const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  for (const acc of accounts) {
    // Upsert BankAccount
    let bankAccount = await prisma.bankAccount.findFirst({
      where: {
        connectionId: connection.id,
        externalId: acc.id,
      },
    });

    const kind =
      acc.subtype === 'CREDIT_CARD' || acc.type === 'CREDIT'
        ? 'cartao_credito'
        : acc.subtype === 'SAVINGS_ACCOUNT'
        ? 'poupanca'
        : 'conta_corrente';

    if (!bankAccount) {
      bankAccount = await prisma.bankAccount.create({
        data: {
          connectionId: connection.id,
          externalId: acc.id,
          kind,
          name: acc.name,
          entityId: targetEntityId,
        },
      });
    } else {
      bankAccount = await prisma.bankAccount.update({
        where: { id: bankAccount.id },
        data: {
          name: acc.name,
          kind,
        },
      });
    }

    // 5. Fetch transactions for account
    const txs = await client.fetchTransactions(acc.id, { from: fromDate });

    for (const tx of txs) {
      const existing = await prisma.bankTransaction.findUnique({
        where: {
          provider_externalId: {
            provider: 'pluggy',
            externalId: tx.id,
          },
        },
      });

      if (existing) {
        duplicatesSkippedCount += 1;
        continue;
      }

      // Calculate direction and positive amount
      let direction: 'in' | 'out' = 'out';
      if (tx.type === 'CREDIT' || tx.amount > 0) {
        direction = 'in';
      } else if (tx.type === 'DEBIT' || tx.amount < 0) {
        direction = 'out';
      }

      const absAmount = Math.abs(tx.amount).toFixed(2);
      const occurredDate = new Date(tx.date.slice(0, 10));
      const suggestedCatId = mapSuggestedCategory(tx.description, tx.category);

      const created = await prisma.bankTransaction.create({
        data: {
          connectionId: connection.id,
          bankAccountId: bankAccount.id,
          provider: 'pluggy',
          externalId: tx.id,
          direction,
          amount: absAmount,
          occurredOn: occurredDate,
          description: tx.description,
          suggestedCategoryId: suggestedCatId,
          raw: tx as unknown as Prisma.InputJsonValue,
          status: 'nova',
        },
      });

      createdItems.push(created);
      importedTransactionsCount += 1;
    }
  }

  // 6. Transfer detection among newly created transactions
  const candidates = createdItems.map((c) => ({
    id: c.id,
    direction: c.direction as 'in' | 'out',
    amount: String(c.amount),
    occurredOn: c.occurredOn.toISOString().slice(0, 10),
    description: c.description,
  }));

  const suspects = TransferDetector.findSuspectPairs(candidates);
  for (const pair of suspects) {
    await prisma.bankTransaction.updateMany({
      where: { id: { in: [pair.outId, pair.inId] } },
      data: { isTransferSuspect: true },
    });
  }

  return {
    connectionId: connection.id,
    institution: institutionName,
    accountsCount: accounts.length,
    importedTransactionsCount,
    duplicatesSkippedCount,
    transferSuspectsCount: suspects.length,
  };
}
