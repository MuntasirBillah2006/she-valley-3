import { eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { conversationMessages, conversations, settings } from '../../db/schema.ts';
import { UnauthorizedError } from '../../lib/errors.ts';
import { verifyHmacSignature } from './automationService.ts';

export interface MessagingChannelStatus {
  channel: 'WEB_CONTACT' | 'WHATSAPP' | 'MESSENGER' | 'INSTAGRAM' | 'EMAIL';
  label: string;
  connectionStatus: 'ACTIVE' | 'NOT_CONNECTED';
  apiConfigured: boolean;
  contactFallbackUrl?: string;
  note: string;
}

export async function getMessagingChannelsStatus(): Promise<MessagingChannelStatus[]> {
  const [socialRow] = await db.select().from(settings).where(eq(settings.key, 'contact_social')).limit(1);
  const social = (socialRow?.valueJson as {
    whatsappNumber?: string;
    messengerUrl?: string;
    instagramUrl?: string;
  }) ?? {};

  const waDigits = (social.whatsappNumber || '01828-298143').replace(/\D/g, '');
  const waHref = waDigits.startsWith('88') ? `https://wa.me/${waDigits}` : `https://wa.me/88${waDigits}`;

  const waConnected = Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const metaConnected = Boolean(process.env.META_APP_SECRET);

  return [
    {
      channel: 'WEB_CONTACT',
      label: 'Website Contact & Support Desk',
      connectionStatus: 'ACTIVE',
      apiConfigured: true,
      note: 'Active directly on storefront and customer account.',
    },
    {
      channel: 'WHATSAPP',
      label: 'WhatsApp Business Cloud API',
      connectionStatus: waConnected ? 'ACTIVE' : 'NOT_CONNECTED',
      apiConfigured: waConnected,
      contactFallbackUrl: waHref,
      note: waConnected
        ? 'Cloud API connected.'
        : 'Not Connected (API credentials missing). Public wa.me deep-links work for direct customer inquiries.',
    },
    {
      channel: 'MESSENGER',
      label: 'Meta Messenger Platform',
      connectionStatus: metaConnected ? 'ACTIVE' : 'NOT_CONNECTED',
      apiConfigured: metaConnected,
      contactFallbackUrl: social.messengerUrl || 'https://m.me/SheValley',
      note: metaConnected
        ? 'Meta webhook & Messenger API configured.'
        : 'Not Connected (META_APP_SECRET missing). Public m.me link works for customer chat handoff.',
    },
    {
      channel: 'INSTAGRAM',
      label: 'Instagram Messaging',
      connectionStatus: metaConnected ? 'ACTIVE' : 'NOT_CONNECTED',
      apiConfigured: metaConnected,
      contactFallbackUrl: social.instagramUrl || 'https://instagram.com/she-valley',
      note: metaConnected
        ? 'Meta Instagram Messaging configured.'
        : 'Not Connected (requires authorized Meta Business App permissions).',
    },
  ];
}

export async function processMetaWebhookEvent(params: {
  rawBody: string;
  signatureHeader: string | undefined;
  payload: Record<string, unknown>;
  requestId: string;
}) {
  const secret = process.env.META_APP_SECRET || '';
  if (!secret || !verifyHmacSignature(params.rawBody, params.signatureHeader, secret)) {
    throw new UnauthorizedError('Invalid or unconfigured Meta webhook signature.', params.requestId);
  }

  // Handle verified inbound WhatsApp / Messenger messages without fabricating data
  const entries = Array.isArray(params.payload.entry) ? (params.payload.entry as Record<string, unknown>[]) : [];
  let recorded = 0;

  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? (entry.changes as Record<string, unknown>[]) : [];
    for (const ch of changes) {
      const value = (ch.value ?? {}) as Record<string, unknown>;
      const messages = Array.isArray(value.messages) ? (value.messages as Record<string, unknown>[]) : [];
      for (const msg of messages) {
        const fromPhone = typeof msg.from === 'string' ? msg.from : 'Unknown';
        const textBody =
          typeof (msg.text as Record<string, unknown> | undefined)?.body === 'string'
            ? ((msg.text as Record<string, unknown>).body as string)
            : '[Unsupported message type]';
        const extId = typeof msg.id === 'string' ? msg.id : undefined;

        const [conv] = await db
          .insert(conversations)
          .values({
            channel: 'WHATSAPP',
            externalThreadId: fromPhone,
            guestName: `WhatsApp ${fromPhone}`,
            guestPhone: fromPhone,
            subject: 'Inbound WhatsApp Message',
            status: 'OPEN',
            priority: 'MEDIUM',
          })
          .returning();

        await db.insert(conversationMessages).values({
          conversationId: conv.id,
          senderType: 'CUSTOMER',
          senderName: fromPhone,
          body: textBody,
          externalMessageId: extId ?? null,
          deliveryStatus: 'DELIVERED',
        });
        recorded += 1;
      }
    }
  }

  return { recorded };
}
