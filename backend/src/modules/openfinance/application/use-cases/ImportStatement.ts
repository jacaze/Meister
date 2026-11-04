import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import { StatementParser } from '../../domain/StatementParser.js';
import { TransferDetector } from '../../domain/TransferDetector.js';

export interface ImportStatementInput {
  readonly content: string;
  readonly provider?: 'ofx' | 'csv' | 'pluggy';
  readonly institution?: string;
  readonly accountKind?: 'conta_corrente' | 'cartao_credito' | 'poupanca';
  readonly entityId?: string;
}

export interface ImportStatementResult {
  readonly connectionId: string;
  readonly totalParsed: number;
  readonly importedCount: number;
  readonly duplicatesSkipped: number;
  readonly transferSuspectsCount: number;
}

export async function importStatement(
  scope: WorkspaceScope,
  input: ImportStatementInput
): Promise<ImportStatementResult> {
  const provider = input.provider || 'ofx';
  const parsed = StatementParser.parse(input.content);

  if (parsed.length === 0) {
    return {
      connectionId: '',
      totalParsed: 0,
      importedCount: 0,
      duplicatesSkipped: 0,
      transferSuspectsCount: 0,
    };
  }

  // 1. Get or create BankConnection for statement imports
  let connection = await prisma.bankConnection.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      provider,
    },
  });

  if (!connection) {
    connection = await prisma.bankConnection.create({
      data: {
        workspaceId: scope.workspaceId,
        provider,
        institution: input.institution || (provider === 'ofx' ? 'Extrato OFX' : 'Extrato CSV'),
        status: 'ativa',
        lastSyncAt: new Date(),
      },
    });
  } else {
    await prisma.bankConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date() },
    });
  }

  // 2. Fetch Categories to map slugs
  const categories = await prisma.category.findMany({
    where: { workspaceId: scope.workspaceId },
  });
  const catSlugMap = new Map<string, string>();
  for (const c of categories) {
    catSlugMap.set(c.slug, c.id);
  }

  let importedCount = 0;
  let duplicatesSkipped = 0;
  const createdItems = [];

  for (const item of parsed) {
    const existing = await prisma.bankTransaction.findUnique({
      where: {
        provider_externalId: {
          provider,
          externalId: item.externalId,
        },
      },
    });

    if (existing) {
      duplicatesSkipped += 1;
      continue;
    }

    const suggestedCatId = item.suggestedCategorySlug
      ? catSlugMap.get(item.suggestedCategorySlug)
      : undefined;

    const created = await prisma.bankTransaction.create({
      data: {
        connectionId: connection.id,
        provider,
        externalId: item.externalId,
        direction: item.direction,
        amount: item.amount,
        occurredOn: new Date(item.occurredOn),
        description: item.description,
        suggestedCategoryId: suggestedCatId,
        raw: item.raw ? JSON.parse(JSON.stringify(item.raw)) : undefined,
        status: 'nova',
      },
    });

    createdItems.push(created);
    importedCount += 1;
  }

  // 3. Detect Own Transfers among newly imported items
  const candidates = createdItems.map((c) => ({
    id: c.id,
    direction: c.direction as 'in' | 'out',
    amount: String(c.amount),
    occurredOn: c.occurredOn.toISOString().slice(0, 10),
    description: c.description,
  }));

  const suspects = TransferDetector.findSuspectPairs(candidates);
  let transferSuspectsCount = suspects.length;

  for (const pair of suspects) {
    await prisma.bankTransaction.updateMany({
      where: { id: { in: [pair.outId, pair.inId] } },
      data: { isTransferSuspect: true },
    });
  }

  return {
    connectionId: connection.id,
    totalParsed: parsed.length,
    importedCount,
    duplicatesSkipped,
    transferSuspectsCount,
  };
}
