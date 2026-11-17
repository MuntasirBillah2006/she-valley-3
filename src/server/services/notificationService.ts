import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { notificationLogs, settings } from '../../db/schema.ts';
import { appLogger } from '../../lib/logger.ts';

export type NotificationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'IN_APP';

export const NOTIFICATION_TEMPLATES: Record<
  string,
  { channel: NotificationChannel; subjectEn: string; bodyEn: string; bodyBn: string }
> = {
  ORDER_CONFIRMATION: {
    channel: 'WHATSAPP',
    subjectEn: 'SHE-VALLEY Order Confirmed',
    bodyEn: 'Dear {customerName}, your SHE-VALLEY order {orderNumber} (Total: ৳{totalBdt}) has been confirmed in discreet packaging.',
    bodyBn: 'প্রিয় {customerName}, আপনার SHE-VALLEY অর্ডার {orderNumber} (মোট: ৳{totalBdt}) গোপনীয় প্যাকেজিংয়ে নিশ্চিত হয়েছে।',
  },
  DELIVERY_FEEDBACK_REQUEST: {
    channel: 'WHATSAPP',
    subjectEn: 'How did it fit? — SHE-VALLEY',
    bodyEn: 'Dear {customerName}, we hope order {orderNumber} arrived comfortably. Share your fit feedback anytime.',
    bodyBn: 'প্রিয় {customerName}, আশা করি আপনার অর্ডার {orderNumber} সঠিকভাবে পৌঁছেছে।',
  },
  ORDER_SHIPPED_SMS: {
    channel: 'SMS',
    subjectEn: 'Order Dispatched',
    bodyEn: 'SHE-VALLEY: Order {orderNumber} dispatched via {provider}. Tracking: {trackingCode}.',
    bodyBn: 'SHE-VALLEY: অর্ডার {orderNumber} ({provider}) পাঠানো হয়েছে। ট্র্যাকিং: {trackingCode}।',
  },
  REFUND_PROCESSED_EMAIL: {
    channel: 'EMAIL',
    subjectEn: 'SHE-VALLEY Refund Update',
    bodyEn: 'Your refund of ৳{amountBdt} for order {orderNumber} has been processed.',
    bodyBn: 'অর্ডার {orderNumber}-এর জন্য ৳{amountBdt} রিফান্ড প্রক্রিয়া সম্পন্ন হয়েছে।',
  },
};

export function renderNotificationTemplate(
  templateKey: string,
  variables: Record<string, string | number>,
  locale: 'en' | 'bn' = 'en',
): { subject: string; body: string; channel: NotificationChannel } {
  const tpl = NOTIFICATION_TEMPLATES[templateKey] ?? {
    channel: 'IN_APP' as NotificationChannel,
    subjectEn: templateKey,
    bodyEn: Object.entries(variables)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', '),
    bodyBn: Object.entries(variables)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', '),
  };

  let body = locale === 'bn' ? tpl.bodyBn : tpl.bodyEn;
  let subject = tpl.subjectEn;
  for (const [k, v] of Object.entries(variables)) {
    body = body.replaceAll(`{${k}}`, String(v));
    subject = subject.replaceAll(`{${k}}`, String(v));
  }
  return { subject, body, channel: tpl.channel };
}

async function getNotificationPolicy() {
  const [row] = await db.select().from(settings).where(eq(settings.key, 'notification_config')).limit(1);
  return (row?.valueJson as {
    sendRealExternalMessages?: boolean;
    ownerApprovedExternalDispatch?: boolean;
  }) ?? { sendRealExternalMessages: false, ownerApprovedExternalDispatch: false };
}

export async function sendOrQueueNotification(params: {
  channel: NotificationChannel;
  templateKey: string;
  recipient: string;
  subject?: string;
  body: string;
  referenceType?: string;
  referenceId?: string;
  requiresApproval?: boolean;
  simulateFailure?: boolean;
}): Promise<typeof notificationLogs.$inferSelect> {
  const policy = await getNotificationPolicy();
  const externalChannel = params.channel === 'SMS' || params.channel === 'WHATSAPP' || params.channel === 'EMAIL';

  // Enforce strict owner-approval / non-test safeguard: never send real external messages without approval
  const requiresApproval =
    params.requiresApproval ?? (externalChannel && !policy.ownerApprovedExternalDispatch);

  const [created] = await db
    .insert(notificationLogs)
    .values({
      channel: params.channel,
      templateKey: params.templateKey,
      recipient: params.recipient,
      subject: params.subject ?? null,
      body: params.body,
      status: requiresApproval ? 'WAITING_APPROVAL' : 'QUEUED',
      attempts: 0,
      maxAttempts: 3,
      referenceType: params.referenceType ?? null,
      referenceId: params.referenceId ?? null,
      requiresApproval,
    })
    .returning();

  if (requiresApproval) {
    return created;
  }

  return attemptNotificationDelivery(created.id, { simulateFailure: params.simulateFailure });
}

export async function attemptNotificationDelivery(
  notificationId: string,
  opts: { simulateFailure?: boolean; approvedByUserId?: string } = {},
): Promise<typeof notificationLogs.$inferSelect> {
  const [row] = await db
    .select()
    .from(notificationLogs)
    .where(eq(notificationLogs.id, notificationId))
    .limit(1);
  if (!row) {
    throw new Error('Notification log not found.');
  }

  const nextAttempts = row.attempts + 1;
  try {
    if (opts.simulateFailure) {
      throw new Error('Simulated provider delivery timeout');
    }

    const policy = await getNotificationPolicy();
    const canLiveWhatsApp =
      row.channel === 'WHATSAPP' &&
      policy.sendRealExternalMessages &&
      policy.ownerApprovedExternalDispatch &&
      Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) &&
      process.env.NODE_ENV === 'production';

    let finalStatus: 'SENT' | 'MOCK_SENT' = 'MOCK_SENT';
    if (row.channel === 'IN_APP') {
      finalStatus = 'SENT';
    } else if (canLiveWhatsApp) {
      const resp = await fetch(
        `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: row.recipient,
            type: 'text',
            text: { body: row.body },
          }),
        },
      );
      if (!resp.ok) {
        throw new Error(`WhatsApp API returned HTTP ${resp.status}`);
      }
      finalStatus = 'SENT';
    } else {
      appLogger.info('Notification dispatched via sandbox/mock channel', {
        channel: row.channel,
        templateKey: row.templateKey,
        recipient: row.recipient,
      });
    }

    const [updated] = await db
      .update(notificationLogs)
      .set({
        status: finalStatus,
        attempts: nextAttempts,
        errorMessage: null,
        approvedByUserId: opts.approvedByUserId ?? row.approvedByUserId,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(notificationLogs.id, row.id))
      .returning();
    return updated;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Delivery error';
    const nextStatus = nextAttempts >= row.maxAttempts ? 'DEAD_LETTER' : 'FAILED';
    const [failed] = await db
      .update(notificationLogs)
      .set({
        status: nextStatus,
        attempts: nextAttempts,
        errorMessage: errMsg,
        updatedAt: new Date(),
      })
      .where(eq(notificationLogs.id, row.id))
      .returning();
    return failed;
  }
}

export async function listNotificationLogs(limit = 60) {
  return db.select().from(notificationLogs).orderBy(desc(notificationLogs.createdAt)).limit(limit);
}
