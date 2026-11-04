import prisma from '../../../../config/prisma.js';

export interface WriteAuditLogInput {
  readonly workspaceId?: string | null;
  readonly userId?: string | null;
  readonly actor: string;
  readonly action: string;
  readonly target?: string | null;
  readonly meta?: Record<string, unknown> | null;
}

export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId ?? undefined,
        userId: input.userId ?? undefined,
        actor: input.actor,
        action: input.action,
        target: input.target ?? undefined,
        meta: input.meta ? JSON.parse(JSON.stringify(input.meta)) : undefined,
      },
    });
  } catch (err) {
    console.error('[WriteAuditLog] Failed to record audit log:', err);
  }
}
