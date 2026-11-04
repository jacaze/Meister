import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import type { ConsentKind, ConsentRecord } from '../../domain/ComplianceTypes.js';
import { writeAuditLog } from './WriteAuditLog.js';

export interface RecordConsentInput {
  readonly kind: ConsentKind;
  readonly version?: string;
  readonly accepted: boolean;
  readonly ipAddress?: string | null;
}

export async function recordConsent(
  scope: WorkspaceScope,
  input: RecordConsentInput
): Promise<ConsentRecord> {
  const version = input.version || '1.0';

  const consent = await prisma.userConsent.upsert({
    where: {
      userId_kind_version: {
        userId: scope.actorUserId,
        kind: input.kind,
        version,
      },
    },
    update: {
      accepted: input.accepted,
      ipAddress: input.ipAddress ?? undefined,
    },
    create: {
      userId: scope.actorUserId,
      kind: input.kind,
      version,
      accepted: input.accepted,
      ipAddress: input.ipAddress ?? undefined,
    },
  });

  await writeAuditLog({
    workspaceId: scope.workspaceId,
    userId: scope.actorUserId,
    actor: scope.actorUserId,
    action: 'compliance.consent',
    target: input.kind,
    meta: { version, accepted: input.accepted },
  });

  return {
    kind: consent.kind as ConsentKind,
    version: consent.version,
    accepted: consent.accepted,
    acceptedAt: consent.createdAt.toISOString(),
    ipAddress: consent.ipAddress,
  };
}

export async function listConsents(scope: WorkspaceScope): Promise<readonly ConsentRecord[]> {
  const records = await prisma.userConsent.findMany({
    where: {
      userId: scope.actorUserId,
    },
    orderBy: { createdAt: 'desc' },
  });

  return records.map((r) => ({
    kind: r.kind as ConsentKind,
    version: r.version,
    accepted: r.accepted,
    acceptedAt: r.createdAt.toISOString(),
    ipAddress: r.ipAddress,
  }));
}
