import type { DatabaseClient } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { appLogger } from '../lib/logger.ts';

export interface AuditLogInput {
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress?: string | null;
  requestId: string;
}

export async function recordAuditLog(
  dbOrTx: Pick<DatabaseClient, 'insert'>,
  input: AuditLogInput,
): Promise<void> {
  try {
    await dbOrTx.insert(auditLogs).values({
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail ?? null,
      actorRole: input.actorRole,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeState: input.beforeState ?? null,
      afterState: input.afterState ?? null,
      ipAddress: input.ipAddress ?? null,
      requestId: input.requestId,
    });
  } catch (err) {
    appLogger.error('Failed to persist audit log entry', {
      action: input.action,
      entityType: input.entityType,
      requestId: input.requestId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}
