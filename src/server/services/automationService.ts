import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { automationJobs, notifications, orders, settings } from '../../db/schema.ts';
import { appLogger } from '../../lib/logger.ts';
import { validateSafePublicUrl } from '../../lib/security.ts';

export type AutomationEventType =
  | 'NEW_ORDER_ADMIN_ALERT'
  | 'CONFIRMED_ORDER_CUSTOMER_NOTIFY'
  | 'PAYMENT_SUCCESS_UPDATE'
  | 'LOW_STOCK_ADMIN_ALERT'
  | 'OUT_OF_STOCK_AVAILABILITY_UPDATE'
  | 'COURIER_STATUS_ORDER_TIMELINE'
  | 'DELIVERED_ORDER_FEEDBACK_REQUEST'
  | 'NEW_TICKET_MODERATOR_ASSIGN'
  | 'FAILED_NOTIFICATION_RETRY'
  | 'FAILED_AUTOMATION_ERROR_LOG';

export const AUTOMATION_EVENT_REGISTRY: Record<
  AutomationEventType,
  { workflowKey: string; description: string; defaultRequiresApproval: boolean }
> = {
  NEW_ORDER_ADMIN_ALERT: {
    workflowKey: 'wf_new_order_admin_alert',
    description: 'Notify operations admins immediately when a new order is placed.',
    defaultRequiresApproval: false,
  },
  CONFIRMED_ORDER_CUSTOMER_NOTIFY: {
    workflowKey: 'wf_confirmed_order_customer_notify',
    description: 'Queue customer order confirmation message (requires approval before external send).',
    defaultRequiresApproval: true,
  },
  PAYMENT_SUCCESS_UPDATE: {
    workflowKey: 'wf_payment_success_update',
    description: 'Record payment verification milestone & sync order payment status.',
    defaultRequiresApproval: false,
  },
  LOW_STOCK_ADMIN_ALERT: {
    workflowKey: 'wf_low_stock_admin_alert',
    description: 'Alert inventory staff when available units hit threshold.',
    defaultRequiresApproval: false,
  },
  OUT_OF_STOCK_AVAILABILITY_UPDATE: {
    workflowKey: 'wf_out_of_stock_availability',
    description: 'Flag variant as out-of-stock in operations alerts.',
    defaultRequiresApproval: false,
  },
  COURIER_STATUS_ORDER_TIMELINE: {
    workflowKey: 'wf_courier_status_timeline',
    description: 'Append courier tracking updates to order timeline.',
    defaultRequiresApproval: false,
  },
  DELIVERED_ORDER_FEEDBACK_REQUEST: {
    workflowKey: 'wf_delivered_order_feedback',
    description: 'Queue discreet feedback invitation after successful delivery.',
    defaultRequiresApproval: true,
  },
  NEW_TICKET_MODERATOR_ASSIGN: {
    workflowKey: 'wf_new_ticket_moderator_assign',
    description: 'Route new customer support tickets to available moderator/support staff.',
    defaultRequiresApproval: false,
  },
  FAILED_NOTIFICATION_RETRY: {
    workflowKey: 'wf_failed_notification_retry',
    description: 'Schedule retry for failed outbound notifications.',
    defaultRequiresApproval: false,
  },
  FAILED_AUTOMATION_ERROR_LOG: {
    workflowKey: 'wf_failed_automation_error_log',
    description: 'Capture dead-letter automation errors for ops inspection.',
    defaultRequiresApproval: false,
  },
};

export function computeHmacSha256Hex(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

export function verifyHmacSignature(rawBody: string, providedSignature: string | undefined, secret: string): boolean {
  if (!providedSignature || !secret) {
    return false;
  }
  const cleanProvided = providedSignature.replace(/^sha256=/i, '').trim();
  const expected = computeHmacSha256Hex(rawBody, secret);
  if (cleanProvided.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(cleanProvided, 'utf8'), Buffer.from(expected, 'utf8'));
}

async function getAutomationSettings() {
  const [row] = await db.select().from(settings).where(eq(settings.key, 'automation_config')).limit(1);
  return (row?.valueJson as {
    enabled?: boolean;
    n8nWebhookUrl?: string;
    workflows?: Record<string, { enabled?: boolean; requiresApproval?: boolean }>;
  }) ?? { enabled: true, workflows: {} };
}

export async function dispatchAutomationEvent(params: {
  eventType: AutomationEventType;
  dedupeKey: string;
  payload: Record<string, unknown>;
  simulateFailure?: boolean;
}): Promise<{ job: typeof automationJobs.$inferSelect; deduplicated: boolean }> {
  const registry = AUTOMATION_EVENT_REGISTRY[params.eventType];
  const cfg = await getAutomationSettings();

  const [existing] = await db
    .select()
    .from(automationJobs)
    .where(eq(automationJobs.dedupeKey, params.dedupeKey))
    .limit(1);

  if (existing) {
    return { job: existing, deduplicated: true };
  }

  const wfRule = cfg.workflows?.[params.eventType];
  const enabled = cfg.enabled !== false && (wfRule?.enabled ?? true);
  const requiresApproval = wfRule?.requiresApproval ?? registry.defaultRequiresApproval;

  if (!enabled) {
    const [skipped] = await db
      .insert(automationJobs)
      .values({
        eventType: params.eventType,
        workflowKey: registry.workflowKey,
        dedupeKey: params.dedupeKey,
        payload: params.payload,
        status: 'COMPLETED',
        attempts: 0,
        lastError: 'Workflow disabled in automation_config',
        requiresApproval: false,
        completedAt: new Date(),
      })
      .returning();
    return { job: skipped, deduplicated: false };
  }

  const initialStatus = requiresApproval ? 'WAITING_APPROVAL' : 'PENDING';
  const [created] = await db
    .insert(automationJobs)
    .values({
      eventType: params.eventType,
      workflowKey: registry.workflowKey,
      dedupeKey: params.dedupeKey,
      payload: params.payload,
      status: initialStatus,
      attempts: 0,
      maxAttempts: 3,
      requiresApproval,
    })
    .returning();

  if (requiresApproval) {
    return { job: created, deduplicated: false };
  }

  const executed = await executeAutomationJob(created.id, { simulateFailure: params.simulateFailure });
  return { job: executed, deduplicated: false };
}

export async function executeAutomationJob(
  jobId: string,
  opts: { simulateFailure?: boolean; approvedByUserId?: string } = {},
): Promise<typeof automationJobs.$inferSelect> {
  const [job] = await db.select().from(automationJobs).where(eq(automationJobs.id, jobId)).limit(1);
  if (!job) {
    throw new Error('Automation job not found.');
  }

  const nextAttempts = job.attempts + 1;
  try {
    if (opts.simulateFailure) {
      throw new Error('Simulated downstream automation failure');
    }

    const payload = (job.payload ?? {}) as Record<string, unknown>;
    if (job.eventType === 'NEW_ORDER_ADMIN_ALERT') {
      await db.insert(notifications).values({
        title: `New order ${String(payload.orderNumber || '')}`,
        message: `COD order received for ৳${String(payload.totalBdt || '0')}.`,
        type: 'ORDER',
        linkHref: '/admin',
      });
    } else if (job.eventType === 'LOW_STOCK_ADMIN_ALERT' || job.eventType === 'OUT_OF_STOCK_AVAILABILITY_UPDATE') {
      await db.insert(notifications).values({
        title:
          job.eventType === 'OUT_OF_STOCK_AVAILABILITY_UPDATE'
            ? `Out of stock: ${String(payload.sku || '')}`
            : `Low stock alert: ${String(payload.sku || '')}`,
        message: `Available quantity is now ${String(payload.availableQty ?? 0)}.`,
        type: 'LOW_STOCK',
        linkHref: '/admin',
      });
    } else if (job.eventType === 'PAYMENT_SUCCESS_UPDATE' && typeof payload.orderId === 'string') {
      await db
        .update(orders)
        .set({ paymentStatus: 'PAID', updatedAt: new Date() })
        .where(eq(orders.id, payload.orderId));
    }

    // Optional signed n8n webhook relay (only when N8N_WEBHOOK_URL passes SSRF validation)
    const cfg = await getAutomationSettings();
    const targetUrl = process.env.N8N_WEBHOOK_URL || cfg.n8nWebhookUrl;
    if (targetUrl && validateSafePublicUrl(targetUrl)) {
      const bodyStr = JSON.stringify({
        eventId: job.id,
        eventType: job.eventType,
        workflowKey: job.workflowKey,
        dedupeKey: job.dedupeKey,
        payload,
      });
      const secret = process.env.N8N_WEBHOOK_SECRET || 'shevalley-n8n-dev';
      try {
        await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-shevalley-signature': computeHmacSha256Hex(bodyStr, secret),
          },
          body: bodyStr,
          signal: AbortSignal.timeout(5000),
        });
      } catch (webhookErr) {
        appLogger.warn('n8n webhook relay unreachable', {
          jobId: job.id,
          error: webhookErr instanceof Error ? webhookErr.message : 'unknown',
        });
      }
    }

    const [completed] = await db
      .update(automationJobs)
      .set({
        status: 'COMPLETED',
        attempts: nextAttempts,
        lastError: null,
        approvedByUserId: opts.approvedByUserId ?? job.approvedByUserId,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(automationJobs.id, job.id))
      .returning();
    return completed;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Execution error';
    const nextStatus = nextAttempts >= job.maxAttempts ? 'DEAD_LETTER' : 'FAILED';
    const [failed] = await db
      .update(automationJobs)
      .set({
        status: nextStatus,
        attempts: nextAttempts,
        lastError: errMsg,
        updatedAt: new Date(),
      })
      .where(eq(automationJobs.id, job.id))
      .returning();

    if (job.eventType !== 'FAILED_AUTOMATION_ERROR_LOG') {
      await db.insert(notifications).values({
        title: `Automation ${nextStatus}: ${job.eventType}`,
        message: errMsg,
        type: 'SYSTEM',
        linkHref: '/admin',
      });
    }
    return failed;
  }
}

export async function listAutomationJobs(limit = 60) {
  return db.select().from(automationJobs).orderBy(desc(automationJobs.createdAt)).limit(limit);
}
