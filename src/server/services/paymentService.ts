import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { orders, paymentEvents, payments, refunds, settings } from '../../db/schema.ts';
import { BusinessRuleError, NotFoundError, UnauthorizedError } from '../../lib/errors.ts';
import { recordAuditLog } from '../audit.ts';
import { dispatchAutomationEvent, verifyHmacSignature } from './automationService.ts';

export type PaymentProviderCode = 'COD' | 'BKASH' | 'NAGAD' | 'SSLCOMMERZ';

export interface PaymentProviderStatus {
  provider: PaymentProviderCode;
  label: string;
  labelBn: string;
  enabled: boolean;
  connectionStatus: 'ACTIVE' | 'SANDBOX' | 'PENDING_CREDENTIALS';
  credentialsConfigured: boolean;
  liveApproved: boolean;
  feeRatePercent: number;
  note: string;
}

export interface PaymentConfigDoc {
  codEnabled: boolean;
  codMaxAmountBdt: number;
  liveActivationApprovedByOwner: boolean;
  sandboxModeEnabled: boolean;
  providers: Record<
    string,
    { enabled?: boolean; mode?: string; feeRatePercent?: number }
  >;
}

const FEE_RATES: Record<PaymentProviderCode, number> = {
  COD: 0,
  BKASH: 1.5,
  NAGAD: 1.4,
  SSLCOMMERZ: 2.5,
};

export async function getPaymentConfig(): Promise<PaymentConfigDoc> {
  const [row] = await db.select().from(settings).where(eq(settings.key, 'payment_config')).limit(1);
  return (
    (row?.valueJson as PaymentConfigDoc) ?? {
      codEnabled: true,
      codMaxAmountBdt: 25000,
      liveActivationApprovedByOwner: false,
      sandboxModeEnabled: process.env.NODE_ENV !== 'production',
      providers: {},
    }
  );
}

export async function getPaymentProvidersStatus(): Promise<PaymentProviderStatus[]> {
  const cfg = await getPaymentConfig();
  const isProd = process.env.NODE_ENV === 'production';

  const bkashCreds = Boolean(process.env.BKASH_APP_KEY && process.env.BKASH_APP_SECRET);
  const nagadCreds = Boolean(process.env.NAGAD_MERCHANT_ID && process.env.NAGAD_PRIVATE_KEY);
  const sslCreds = Boolean(process.env.SSLCOMMERZ_STORE_ID && process.env.SSLCOMMERZ_STORE_PASSWD);

  const resolveOnlineStatus = (hasCreds: boolean): 'SANDBOX' | 'PENDING_CREDENTIALS' => {
    if (hasCreds && cfg.liveActivationApprovedByOwner) {
      return 'SANDBOX'; // Replace with 'LIVE' only when live gateway URL + owner activation are confirmed
    }
    if (cfg.sandboxModeEnabled && !isProd) {
      return hasCreds ? 'SANDBOX' : 'PENDING_CREDENTIALS';
    }
    return 'PENDING_CREDENTIALS';
  };

  return [
    {
      provider: 'COD',
      label: 'Cash on Delivery (COD)',
      labelBn: 'ক্যাশ অন ডেলিভারি (COD)',
      enabled: cfg.codEnabled !== false,
      connectionStatus: 'ACTIVE',
      credentialsConfigured: true,
      liveApproved: true,
      feeRatePercent: 0,
      note: 'Primary active payment method across Bangladesh.',
    },
    {
      provider: 'BKASH',
      label: 'bKash Checkout',
      labelBn: 'বিকাশ (bKash)',
      enabled: cfg.providers?.BKASH?.enabled ?? true,
      connectionStatus: resolveOnlineStatus(bkashCreds),
      credentialsConfigured: bkashCreds,
      liveApproved: cfg.liveActivationApprovedByOwner,
      feeRatePercent: cfg.providers?.BKASH?.feeRatePercent ?? FEE_RATES.BKASH,
      note: bkashCreds
        ? 'Sandbox/Merchant credentials detected (requires server-side verification).'
        : 'Pending Credentials: configure BKASH_APP_KEY & BKASH_APP_SECRET.',
    },
    {
      provider: 'NAGAD',
      label: 'Nagad Payment',
      labelBn: 'নগদ (Nagad)',
      enabled: cfg.providers?.NAGAD?.enabled ?? true,
      connectionStatus: resolveOnlineStatus(nagadCreds),
      credentialsConfigured: nagadCreds,
      liveApproved: cfg.liveActivationApprovedByOwner,
      feeRatePercent: cfg.providers?.NAGAD?.feeRatePercent ?? FEE_RATES.NAGAD,
      note: nagadCreds
        ? 'Sandbox/Merchant credentials detected.'
        : 'Pending Credentials: configure NAGAD_MERCHANT_ID & NAGAD_PRIVATE_KEY.',
    },
    {
      provider: 'SSLCOMMERZ',
      label: 'Cards & NetBanking (SSLCommerz)',
      labelBn: 'কার্ড ও অনলাইন ব্যাংকিং (SSLCommerz)',
      enabled: cfg.providers?.SSLCOMMERZ?.enabled ?? true,
      connectionStatus: resolveOnlineStatus(sslCreds),
      credentialsConfigured: sslCreds,
      liveApproved: cfg.liveActivationApprovedByOwner,
      feeRatePercent: cfg.providers?.SSLCOMMERZ?.feeRatePercent ?? FEE_RATES.SSLCOMMERZ,
      note: sslCreds
        ? 'Gateway credentials configured.'
        : 'Pending Credentials: configure SSLCOMMERZ_STORE_ID & SSLCOMMERZ_STORE_PASSWD.',
    },
  ];
}

export async function initiateOrderPayment(params: {
  orderId: string;
  provider: PaymentProviderCode;
  idempotencyKey: string;
  actorUserId?: string | null;
  requestId: string;
}) {
  // Prevent duplicate initiation via idempotency key
  const [existingByKey] = await db
    .select()
    .from(payments)
    .where(eq(payments.idempotencyKey, params.idempotencyKey))
    .limit(1);
  if (existingByKey) {
    return { payment: existingByKey, deduplicated: true, mode: 'EXISTING' as const };
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, params.orderId)).limit(1);
  if (!order) {
    throw new NotFoundError('Order', params.requestId);
  }
  if (order.paymentStatus === 'PAID') {
    throw new BusinessRuleError('Order is already marked as PAID.', undefined, params.requestId);
  }

  const cfg = await getPaymentConfig();
  if (params.provider !== 'COD') {
    const statuses = await getPaymentProvidersStatus();
    const match = statuses.find((s) => s.provider === params.provider);
    if (!match || !match.enabled) {
      throw new BusinessRuleError(`${params.provider} is disabled.`, undefined, params.requestId);
    }
    if (!match.credentialsConfigured && !cfg.sandboxModeEnabled) {
      throw new BusinessRuleError(
        `${params.provider} is Pending Credentials and cannot initiate live payment.`,
        undefined,
        params.requestId,
      );
    }
  }

  const amountNum = Number(order.totalBdt);
  const feeRate = cfg.providers?.[params.provider]?.feeRatePercent ?? FEE_RATES[params.provider] ?? 0;
  const gatewayFee = params.provider === 'COD' ? 0 : Number(((amountNum * feeRate) / 100).toFixed(2));
  const netAmount = Number((amountNum - gatewayFee).toFixed(2));
  const ref = `${params.provider}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const [payment] = await db
    .insert(payments)
    .values({
      orderId: order.id,
      provider: params.provider,
      transactionRef: ref,
      amountBdt: amountNum.toFixed(2),
      gatewayFeeBdt: gatewayFee.toFixed(2),
      netAmountBdt: netAmount.toFixed(2),
      status: params.provider === 'COD' ? 'PENDING' : 'INITIATED',
      idempotencyKey: params.idempotencyKey,
      verifiedServerSide: false,
      webhookVerified: false,
      gatewayPayload: {
        initiatedAt: new Date().toISOString(),
        sandboxSimulated: params.provider !== 'COD',
        note:
          params.provider === 'COD'
            ? 'Cash on Delivery scheduled upon parcel handover'
            : 'Awaiting server-side gateway verification (browser redirects are never trusted)',
      },
    })
    .returning();

  await db
    .update(orders)
    .set({ paymentMethod: params.provider, updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  await recordAuditLog(db, {
    actorUserId: params.actorUserId ?? null,
    actorRole: params.actorUserId ? 'USER' : 'GUEST',
    action: 'PAYMENT_INITIATED',
    entityType: 'payments',
    entityId: payment.id,
    afterState: { orderId: order.id, provider: params.provider, amountBdt: amountNum },
    requestId: params.requestId,
  });

  const instructions =
    params.provider === 'COD'
      ? 'Cash on Delivery scheduled upon parcel handover.'
      : `Reference ${ref} created in ${params.provider} sandbox/gateway mode. Complete server-side or HMAC webhook verification to confirm payment.`;

  return {
    payment,
    deduplicated: false,
    mode: params.provider === 'COD' ? ('COD' as const) : ('SANDBOX_OR_GATEWAY' as const),
    instructions,
    gatewayTransactionId: payment.transactionRef,
  };
}

export async function verifyPaymentServerSide(params: {
  paymentId: string;
  outcome: 'PAID' | 'FAILED';
  externalTransactionId?: string;
  failureReason?: string;
  viaWebhook?: boolean;
  actorUserId?: string | null;
  requestId: string;
}) {
  const result = await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, params.paymentId)).limit(1);
    if (!payment) {
      throw new NotFoundError('Payment', params.requestId);
    }

    // Prevent duplicate PAID transition
    if (payment.status === 'PAID' && params.outcome === 'PAID') {
      return { payment, alreadyPaid: true };
    }

    const nextStatus = params.outcome === 'PAID' ? 'PAID' : 'FAILED';
    const [updated] = await tx
      .update(payments)
      .set({
        status: nextStatus,
        transactionRef: params.externalTransactionId ?? payment.transactionRef,
        verifiedServerSide: true,
        webhookVerified: Boolean(params.viaWebhook || payment.webhookVerified),
        failureReason: params.outcome === 'FAILED' ? params.failureReason || 'Gateway verification failed' : null,
        paidAt: params.outcome === 'PAID' ? new Date() : payment.paidAt,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id))
      .returning();

    await tx
      .update(orders)
      .set({
        paymentStatus: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, payment.orderId));

    await recordAuditLog(tx, {
      actorUserId: params.actorUserId ?? null,
      actorRole: params.viaWebhook ? 'WEBHOOK' : 'SYSTEM',
      action: params.outcome === 'PAID' ? 'PAYMENT_VERIFIED_PAID' : 'PAYMENT_VERIFICATION_FAILED',
      entityType: 'payments',
      entityId: payment.id,
      beforeState: { status: payment.status },
      afterState: { status: nextStatus, externalTransactionId: updated.transactionRef },
      requestId: params.requestId,
    });

    return { payment: updated, alreadyPaid: false };
  });

  if (params.outcome === 'PAID' && !result.alreadyPaid) {
    await dispatchAutomationEvent({
      eventType: 'PAYMENT_SUCCESS_UPDATE',
      dedupeKey: `payment_paid_${result.payment.id}`,
      payload: { paymentId: result.payment.id, orderId: result.payment.orderId, provider: result.payment.provider },
    });
  }

  return result;
}

export async function processPaymentWebhook(params: {
  provider: string;
  rawBody: string;
  signatureHeader: string | undefined;
  payload: {
    externalEventId: string;
    paymentId: string;
    status: 'PAID' | 'FAILED';
    transactionRef?: string;
    reason?: string;
  };
  requestId: string;
}) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET || 'shevalley-dev-webhook-secret';
  const validSig = verifyHmacSignature(params.rawBody, params.signatureHeader, secret);
  if (!validSig) {
    throw new UnauthorizedError('Invalid webhook signature.', params.requestId);
  }

  // Deduplicate duplicate webhook delivery by externalEventId
  const [existingEvent] = await db
    .select()
    .from(paymentEvents)
    .where(eq(paymentEvents.externalEventId, params.payload.externalEventId))
    .limit(1);

  if (existingEvent) {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, existingEvent.paymentId))
      .limit(1);
    return { deduplicated: true, event: existingEvent, payment };
  }

  const [paymentRow] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, params.payload.paymentId))
    .limit(1);
  if (!paymentRow) {
    throw new NotFoundError('Payment', params.requestId);
  }

  const [event] = await db
    .insert(paymentEvents)
    .values({
      paymentId: paymentRow.id,
      provider: params.provider.toUpperCase(),
      eventType: `PAYMENT_${params.payload.status}`,
      externalEventId: params.payload.externalEventId,
      signatureValid: true,
      rawPayload: params.payload,
    })
    .returning();

  const verified = await verifyPaymentServerSide({
    paymentId: paymentRow.id,
    outcome: params.payload.status,
    externalTransactionId: params.payload.transactionRef,
    failureReason: params.payload.reason,
    viaWebhook: true,
    requestId: params.requestId,
  });

  return { deduplicated: false, event, payment: verified.payment };
}

export async function recordCodCollection(params: {
  paymentId: string;
  collectedAmountBdt: number;
  reconcileNow?: boolean;
  actorUserId: string;
  requestId: string;
}) {
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, params.paymentId)).limit(1);
    if (!payment) {
      throw new NotFoundError('Payment', params.requestId);
    }

    const [updated] = await tx
      .update(payments)
      .set({
        status: 'PAID',
        netAmountBdt: params.collectedAmountBdt.toFixed(2),
        verifiedServerSide: true,
        paidAt: payment.paidAt ?? new Date(),
        settledAt: params.reconcileNow ? new Date() : payment.settledAt,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id))
      .returning();

    await tx
      .update(orders)
      .set({ paymentStatus: 'PAID', updatedAt: new Date() })
      .where(eq(orders.id, payment.orderId));

    await recordAuditLog(tx, {
      actorUserId: params.actorUserId,
      actorRole: 'STAFF',
      action: 'COD_PAYMENT_COLLECTED',
      entityType: 'payments',
      entityId: payment.id,
      afterState: { collectedAmountBdt: params.collectedAmountBdt, reconciled: Boolean(params.reconcileNow) },
      requestId: params.requestId,
    });

    return updated;
  });
}

export async function createOrProcessRefund(params: {
  paymentId: string;
  amountBdt: number;
  reason: string;
  approveAndProcess?: boolean;
  actorUserId: string;
  requestId: string;
}) {
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, params.paymentId)).limit(1);
    if (!payment) {
      throw new NotFoundError('Payment', params.requestId);
    }
    if (payment.status !== 'PAID' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw new BusinessRuleError('Only PAID payments can be refunded.', undefined, params.requestId);
    }
    if (params.amountBdt > Number(payment.amountBdt)) {
      throw new BusinessRuleError('Refund amount exceeds original payment amount.', undefined, params.requestId);
    }

    const existingRefunds = await tx
      .select()
      .from(refunds)
      .where(and(eq(refunds.paymentId, payment.id)));
    const refundedSoFar = existingRefunds
      .filter((r) => r.status !== 'REJECTED')
      .reduce((sum, r) => sum + Number(r.amountBdt), 0);

    if (refundedSoFar + params.amountBdt > Number(payment.amountBdt)) {
      throw new BusinessRuleError('Total refunded amount cannot exceed original payment.', undefined, params.requestId);
    }

    const status = params.approveAndProcess ? 'PROCESSED' : 'PENDING';
    const refundRef = `RF-${Date.now().toString().slice(-6)}`;
    const [refund] = await tx
      .insert(refunds)
      .values({
        paymentId: payment.id,
        orderId: payment.orderId,
        amountBdt: params.amountBdt.toFixed(2),
        reason: params.reason,
        status,
        refundRef,
        requestedByUserId: params.actorUserId,
        approvedByUserId: params.approveAndProcess ? params.actorUserId : null,
        processedAt: params.approveAndProcess ? new Date() : null,
      })
      .returning();

    if (params.approveAndProcess) {
      const totalAfter = refundedSoFar + params.amountBdt;
      const nextPayStatus = totalAfter >= Number(payment.amountBdt) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      await tx
        .update(payments)
        .set({ status: nextPayStatus, updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
      await tx
        .update(orders)
        .set({ paymentStatus: nextPayStatus, updatedAt: new Date() })
        .where(eq(orders.id, payment.orderId));
    }

    await recordAuditLog(tx, {
      actorUserId: params.actorUserId,
      actorRole: 'STAFF',
      action: 'REFUND_RECORDED',
      entityType: 'refunds',
      entityId: refund.id,
      afterState: { amountBdt: params.amountBdt, status, reason: params.reason },
      requestId: params.requestId,
    });

    return refund;
  });
}

export async function listPaymentsAndRefunds() {
  const [paymentRows, refundRows, orderRows] = await Promise.all([
    db.select().from(payments).orderBy(desc(payments.createdAt)),
    db.select().from(refunds).orderBy(desc(refunds.createdAt)),
    db.select({ id: orders.id, orderNumber: orders.orderNumber, guestName: orders.guestName, status: orders.status }).from(orders),
  ]);
  const orderMap = new Map(orderRows.map((o) => [o.id, o]));
  return {
    payments: paymentRows.map((p) => ({ ...p, order: orderMap.get(p.orderId) ?? null })),
    refunds: refundRows.map((r) => ({ ...r, order: orderMap.get(r.orderId) ?? null })),
  };
}
