import { desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { BD_PHONE_REGEX, normalizeBdPhone } from '../../config/bangladesh.ts';
import { db } from '../../db/index.ts';
import {
  conversationMessages,
  conversations,
  customers,
  marketingEvents,
  orders,
  supportTickets,
} from '../../db/schema.ts';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../../lib/errors.ts';
import { requireAuth, type AuthRequest } from '../rbac.ts';
import { dispatchAutomationEvent, verifyHmacSignature } from '../services/automationService.ts';
import { processCourierWebhook, type ShipmentStatus } from '../services/courierService.ts';
import { processMetaWebhookEvent } from '../services/messagingAdapterService.ts';
import {
  getPaymentConfig,
  getPaymentProvidersStatus,
  initiateOrderPayment,
  processPaymentWebhook,
  verifyPaymentServerSide,
} from '../services/paymentService.ts';

export const operationsRouter = Router();

// ============================================================================
// 1. PAYMENTS (PUBLIC/CUSTOMER & WEBHOOKS)
// ============================================================================

operationsRouter.get('/payments/methods', async (_req, res, next) => {
  try {
    const methods = await getPaymentProvidersStatus();
    return res.json({ success: true, data: { methods } });
  } catch (err) {
    next(err);
  }
});

const initiatePaymentSchema = z.object({
  orderId: z.string().uuid(),
  provider: z.enum(['COD', 'BKASH', 'NAGAD', 'SSLCOMMERZ']),
});

operationsRouter.post('/payments/initiate', async (req: AuthRequest, res, next) => {
  try {
    const parsed = initiatePaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Valid orderId and payment provider are required.', undefined, req.requestId);
    }
    const idempotencyKey =
      (typeof req.headers['idempotency-key'] === 'string' && req.headers['idempotency-key'].trim()) ||
      `init_${parsed.data.orderId}_${parsed.data.provider}`;

    const result = await initiateOrderPayment({
      orderId: parsed.data.orderId,
      provider: parsed.data.provider,
      idempotencyKey,
      actorUserId: req.principal?.userId ?? null,
      requestId: req.requestId || 'unknown',
    });

    return res.status(result.deduplicated ? 200 : 201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

const verifyPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  outcome: z.enum(['PAID', 'FAILED']),
  externalTransactionId: z.string().trim().max(100).optional(),
  failureReason: z.string().trim().max(240).optional(),
});

// Server-side payment verification (never trusts browser redirects in production)
operationsRouter.post('/payments/verify', async (req: AuthRequest, res, next) => {
  try {
    const parsed = verifyPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('paymentId and outcome are required.', undefined, req.requestId);
    }

    const payCfg = await getPaymentConfig();
    const isStaffVerifier = Boolean(
      req.principal &&
        req.principal.mfaVerified &&
        (req.principal.permissions.includes('approve') || req.principal.permissions.includes('edit')),
    );
    const isDevSandbox = process.env.NODE_ENV !== 'production' && payCfg.sandboxModeEnabled;
    if (!isStaffVerifier && !isDevSandbox) {
      throw new ForbiddenError(
        'Server-side payment verification requires authorized gateway webhook or staff approval.',
        req.requestId,
      );
    }

    const result = await verifyPaymentServerSide({
      paymentId: parsed.data.paymentId,
      outcome: parsed.data.outcome,
      externalTransactionId: parsed.data.externalTransactionId,
      failureReason: parsed.data.failureReason,
      actorUserId: req.principal?.userId ?? null,
      requestId: req.requestId || 'unknown',
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

const paymentWebhookSchema = z.object({
  externalEventId: z.string().trim().min(3).max(120),
  paymentId: z.string().uuid(),
  status: z.enum(['PAID', 'FAILED']),
  transactionRef: z.string().trim().max(120).optional(),
  reason: z.string().trim().max(240).optional(),
});

operationsRouter.post('/webhooks/payments/:provider', async (req: AuthRequest, res, next) => {
  try {
    const parsed = paymentWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid payment webhook payload.', undefined, req.requestId);
    }

    const rawBody = req.rawBody ?? JSON.stringify(req.body);
    const sigHeader =
      (typeof req.headers['x-shevalley-signature'] === 'string' && req.headers['x-shevalley-signature']) ||
      (typeof req.headers['x-webhook-signature'] === 'string' && req.headers['x-webhook-signature']) ||
      undefined;

    const result = await processPaymentWebhook({
      provider: req.params.provider,
      rawBody,
      signatureHeader: sigHeader,
      payload: parsed.data,
      requestId: req.requestId || 'unknown',
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 2. COURIER, META & N8N WEBHOOKS
// ============================================================================

const courierWebhookSchema = z.object({
  consignmentId: z.string().trim().min(3),
  status: z.enum([
    'PENDING_BOOKING',
    'BOOKED',
    'PICKED_UP',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'FAILED_DELIVERY',
    'RETURN_INITIATED',
    'RETURNED',
    'EXCHANGE_REQUESTED',
  ]),
  note: z.string().trim().max(300).optional(),
  codCollectedBdt: z.number().nonnegative().optional(),
});

operationsRouter.post('/webhooks/couriers/:provider', async (req: AuthRequest, res, next) => {
  try {
    const parsed = courierWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid courier webhook payload.', undefined, req.requestId);
    }
    const rawBody = req.rawBody ?? JSON.stringify(req.body);
    const sigHeader =
      (typeof req.headers['x-shevalley-signature'] === 'string' && req.headers['x-shevalley-signature']) ||
      undefined;

    const shipment = await processCourierWebhook({
      provider: req.params.provider,
      rawBody,
      signatureHeader: sigHeader,
      payload: {
        ...parsed.data,
        status: parsed.data.status as ShipmentStatus,
      },
      requestId: req.requestId || 'unknown',
    });

    return res.json({ success: true, data: { shipment } });
  } catch (err) {
    next(err);
  }
});

// Meta WhatsApp / Messenger Webhook Challenge & Receiver
operationsRouter.get('/webhooks/meta', (req: AuthRequest, res, next) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.META_VERIFY_TOKEN || 'shevalley-meta-verify';

  if (mode === 'subscribe' && token === expectedToken && typeof challenge === 'string') {
    return res.status(200).send(challenge);
  }
  return next(new UnauthorizedError('Meta webhook verification failed.', req.requestId));
});

operationsRouter.post('/webhooks/meta', async (req: AuthRequest, res, next) => {
  try {
    const rawBody = req.rawBody ?? JSON.stringify(req.body);
    const sig =
      (typeof req.headers['x-hub-signature-256'] === 'string' && req.headers['x-hub-signature-256']) || undefined;
    const result = await processMetaWebhookEvent({
      rawBody,
      signatureHeader: sig,
      payload: (req.body ?? {}) as Record<string, unknown>,
      requestId: req.requestId || 'unknown',
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

operationsRouter.post('/webhooks/n8n', async (req: AuthRequest, res, next) => {
  try {
    const rawBody = req.rawBody ?? JSON.stringify(req.body);
    const sig =
      (typeof req.headers['x-shevalley-signature'] === 'string' && req.headers['x-shevalley-signature']) || undefined;
    const secret = process.env.N8N_WEBHOOK_SECRET || 'shevalley-n8n-dev';
    if (!verifyHmacSignature(rawBody, sig, secret)) {
      throw new UnauthorizedError('Invalid n8n webhook signature.', req.requestId);
    }
    return res.json({ success: true, data: { acknowledged: true } });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 3. SUPPORT CONTACT FORM & CUSTOMER TICKETS
// ============================================================================

const contactSupportSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(BD_PHONE_REGEX, 'Enter a valid 11-digit Bangladesh mobile number.'),
  email: z.string().trim().email().optional().or(z.literal('')),
  orderNumber: z.string().trim().max(40).optional(),
  category: z.enum(['GENERAL', 'SIZING', 'ORDER_INQUIRY', 'COMPLAINT', 'RETURN_EXCHANGE']).default('GENERAL'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  subject: z.string().trim().min(3).max(150),
  message: z.string().trim().min(5).max(1500),
});

operationsRouter.post('/support/contact', async (req: AuthRequest, res, next) => {
  try {
    const parsed = contactSupportSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'Please complete your name, valid BD mobile number, subject, and message.',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        req.requestId,
      );
    }

    const phoneNorm = normalizeBdPhone(parsed.data.phone);

    // Match customer & optional order
    const [cust] = await db.select().from(customers).where(eq(customers.phone, phoneNorm)).limit(1);
    let matchedOrderId: string | null = null;
    if (parsed.data.orderNumber) {
      const [ord] = await db
        .select()
        .from(orders)
        .where(eq(orders.orderNumber, parsed.data.orderNumber.toUpperCase()))
        .limit(1);
      if (ord) matchedOrderId = ord.id;
    }

    const created = await db.transaction(async (tx) => {
      const [conv] = await tx
        .insert(conversations)
        .values({
          channel: 'WEB_CONTACT',
          customerId: cust?.id ?? null,
          guestName: parsed.data.name,
          guestPhone: phoneNorm,
          guestEmail: parsed.data.email || null,
          orderId: matchedOrderId,
          subject: parsed.data.subject,
          status: 'OPEN',
          priority: parsed.data.priority,
          category: parsed.data.category,
        })
        .returning();

      await tx.insert(conversationMessages).values({
        conversationId: conv.id,
        senderType: 'CUSTOMER',
        senderUserId: req.principal?.userId ?? null,
        senderName: parsed.data.name,
        body: parsed.data.message,
        isInternalNote: false,
        deliveryStatus: 'LOCAL',
      });

      const ticketNum = `SV-TKT-${Date.now().toString().slice(-6)}-${Math.random()
        .toString(36)
        .slice(2, 5)
        .toUpperCase()}`;

      const [ticket] = await tx
        .insert(supportTickets)
        .values({
          ticketNumber: ticketNum,
          conversationId: conv.id,
          customerId: cust?.id ?? null,
          orderId: matchedOrderId,
          contactPhone: phoneNorm,
          category: parsed.data.category === 'ORDER_INQUIRY' ? 'DELIVERY' : parsed.data.category,
          priority: parsed.data.priority,
          status: 'OPEN',
        })
        .returning();

      return { conversation: conv, ticket };
    });

    await dispatchAutomationEvent({
      eventType: 'NEW_TICKET_MODERATOR_ASSIGN',
      dedupeKey: `ticket_${created.ticket.id}`,
      payload: {
        ticketId: created.ticket.id,
        ticketNumber: created.ticket.ticketNumber,
        category: created.ticket.category,
        priority: created.ticket.priority,
      },
    }).catch(() => undefined);

    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

operationsRouter.get('/account/tickets', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const [cust] = await db
      .select()
      .from(customers)
      .where(eq(customers.userId, req.principal!.userId))
      .limit(1);

    if (!cust) {
      return res.json({ success: true, data: { tickets: [], conversations: [] } });
    }

    const [ticketRows, convRows] = await Promise.all([
      db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.customerId, cust.id))
        .orderBy(desc(supportTickets.createdAt)),
      db
        .select()
        .from(conversations)
        .where(eq(conversations.customerId, cust.id))
        .orderBy(desc(conversations.lastMessageAt)),
    ]);

    return res.json({ success: true, data: { tickets: ticketRows, conversations: convRows } });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 4. MARKETING & CONVERSION DEDUPLICATION TRACKING
// ============================================================================

const marketingEventSchema = z.object({
  eventId: z.string().trim().min(4).max(120),
  eventName: z.enum([
    'ViewContent',
    'Search',
    'AddToCart',
    'InitiateCheckout',
    'Purchase',
    'Contact',
    'Lead',
  ]),
  valueBdt: z.number().nonnegative().optional(),
  orderId: z.string().uuid().optional(),
  consentGranted: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

operationsRouter.post('/marketing/events', async (req: AuthRequest, res, next) => {
  try {
    const parsed = marketingEventSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid marketing event payload.', undefined, req.requestId);
    }

    // Deduplicate eventId (prevents double Purchase tracking!)
    const [existing] = await db
      .select()
      .from(marketingEvents)
      .where(eq(marketingEvents.eventId, parsed.data.eventId))
      .limit(1);

    if (existing) {
      return res.json({ success: true, data: { event: existing, deduplicated: true } });
    }

    const [created] = await db
      .insert(marketingEvents)
      .values({
        eventId: parsed.data.eventId,
        eventName: parsed.data.eventName,
        source: process.env.META_CAPI_ACCESS_TOKEN ? 'BOTH' : 'CLIENT',
        valueBdt: parsed.data.valueBdt !== undefined ? parsed.data.valueBdt.toFixed(2) : null,
        currency: 'BDT',
        orderId: parsed.data.orderId ?? null,
        consentGranted: parsed.data.consentGranted,
        metadata: parsed.data.metadata ?? null,
      })
      .returning();

    return res.status(201).json({ success: true, data: { event: created, deduplicated: false } });
  } catch (err) {
    next(err);
  }
});
