// @vitest-environment node
import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.ts';
import {
  automationJobs,
  banners,
  businessExpenses,
  categories,
  conversations,
  customerTags,
  customers,
  marketingEvents,
  notificationLogs,
  orders,
  paymentEvents,
  payments,
  products,
  refunds,
  shipments,
  supportTickets,
  users,
} from '../src/db/schema.ts';
import { ensureSystemBootstrap } from '../src/db/seed.ts';
import { createApp } from '../src/server/app.ts';
import { computeHmacSha256Hex } from '../src/server/services/automationService.ts';

const hasSqlEnv = Boolean(process.env.SQL_HOST && process.env.SQL_DB_NAME && process.env.SQL_USER);

describe.skipIf(!hasSqlEnv)('SHE-VALLEY Command 03 Business Operations & Integrations', () => {
  const app = createApp();
  let adminAgent: ReturnType<typeof request.agent>;
  let modAgent: ReturnType<typeof request.agent>;
  let custAgent: ReturnType<typeof request.agent>;

  const uniqueSuffix = Date.now().toString(36);
  const custEmail = `c3-cust-${uniqueSuffix}@shevalley.test`;
  const custPhone = `019${String(Math.floor(10000000 + Math.random() * 89999999))}`;

  let testCategoryId = '';
  let createdProductId = '';
  let createdVariantId = '';
  let codOrderId = '';
  let codPaymentId = '';
  let onlineOrderId = '';
  let onlinePaymentId = '';
  let createdShipmentId = '';
  let createdTicketId = '';
  let createdConversationId = '';
  let createdNotificationId = '';
  let createdExpenseId = '';
  let createdBannerId = '';
  const createdAutomationDedupeKeys: string[] = [];
  const createdMarketingEventIds: string[] = [];

  beforeAll(async () => {
    await ensureSystemBootstrap();
    adminAgent = request.agent(app);
    modAgent = request.agent(app);
    custAgent = request.agent(app);

    const [cat] = await db.select().from(categories).where(eq(categories.isActive, true)).limit(1);
    testCategoryId = cat.id;

    // Login Super Admin + Verify MFA
    await adminAgent.post('/api/v1/auth/login').send({
      identifier: 'admin@shevalley.local',
      password: 'SheValleyAdmin!2026',
    });
    await adminAgent.post('/api/v1/auth/mfa/verify').send({ passcode: '246810' });

    // Login Moderator
    await modAgent.post('/api/v1/auth/login').send({
      identifier: 'moderator@shevalley.local',
      password: 'SheValleyMod!2026',
    });

    // Register test customer
    await custAgent.post('/api/v1/auth/register').send({
      fullName: 'Command03 Tester',
      email: custEmail,
      phone: custPhone,
      password: 'Password!2026',
      preferredLocale: 'en',
    });

    // Create test product with cost price and stock
    const prodRes = await adminAgent.post('/api/v1/admin/products').send({
      categoryId: testCategoryId,
      slug: `c3-test-bra-${uniqueSuffix}`,
      skuPrefix: 'SV-C3',
      status: 'ACTIVE',
      isFeatured: false,
      isNewArrival: true,
      basePriceBdt: 1200,
      nameEn: 'Command 03 Comfort Bra',
      nameBn: 'কমফোর্ট ব্রা সি৩',
      descriptionEn: 'Breathable test product for Command 03 integration verification.',
      descriptionBn: 'কমান্ড ০৩ ইন্টিগ্রেশন পরীক্ষার পণ্য।',
      initialVariant: {
        sku: `SV-C3-${uniqueSuffix.toUpperCase()}`,
        size: '34B',
        colorName: 'Dusty Nude',
        colorHex: '#DEC8BF',
        priceBdt: 1200,
        costPriceBdt: 650,
        initialStock: 10,
      },
    });
    createdProductId = prodRes.body.data.product.id;
    createdVariantId = prodRes.body.data.variant.id;
  }, 45000);

  afterAll(async () => {
    try {
      if (createdTicketId) await db.delete(supportTickets).where(eq(supportTickets.id, createdTicketId));
      if (createdConversationId) await db.delete(conversations).where(eq(conversations.id, createdConversationId));
      if (createdShipmentId) await db.delete(shipments).where(eq(shipments.id, createdShipmentId));
      if (createdExpenseId) await db.delete(businessExpenses).where(eq(businessExpenses.id, createdExpenseId));
      if (createdNotificationId) await db.delete(notificationLogs).where(eq(notificationLogs.id, createdNotificationId));
      if (createdBannerId) await db.delete(banners).where(eq(banners.id, createdBannerId));
      if (createdMarketingEventIds.length > 0) {
        await db.delete(marketingEvents).where(inArray(marketingEvents.eventId, createdMarketingEventIds));
      }
      if (createdAutomationDedupeKeys.length > 0) {
        await db.delete(automationJobs).where(inArray(automationJobs.dedupeKey, createdAutomationDedupeKeys));
      }
      const orderIds = [codOrderId, onlineOrderId].filter(Boolean);
      for (const oid of orderIds) {
        const payRows = await db.select({ id: payments.id }).from(payments).where(eq(payments.orderId, oid));
        const pIds = payRows.map((p) => p.id);
        if (pIds.length > 0) {
          await db.delete(refunds).where(inArray(refunds.paymentId, pIds));
          await db.delete(paymentEvents).where(inArray(paymentEvents.paymentId, pIds));
          await db.delete(payments).where(inArray(payments.id, pIds));
        }
        await db.delete(orders).where(eq(orders.id, oid));
      }
      if (createdProductId) await db.delete(products).where(eq(products.id, createdProductId));
      const [cust] = await db.select().from(customers).where(eq(customers.phone, custPhone)).limit(1);
      if (cust) {
        await db.delete(customerTags).where(eq(customerTags.customerId, cust.id));
        await db.delete(customers).where(eq(customers.id, cust.id));
      }
      await db.delete(users).where(eq(users.email, custEmail));
    } catch {
      // Best-effort test cleanup
    }
  });

  it('supports COD checkout, collection reconciliation, and refund RBAC/over-refund guards', async () => {
    const res = await custAgent
      .post('/api/v1/orders')
      .set('Idempotency-Key', `c3-cod-${uniqueSuffix}`)
      .send({
        customerName: 'Command03 Tester',
        phone: custPhone,
        division: 'Dhaka',
        district: 'Dhaka',
        upazilaOrArea: 'Dhanmondi',
        streetAddress: 'Road 7, Dhanmondi',
        paymentMethod: 'COD',
        isDiscreetPackaging: true,
        items: [{ variantId: createdVariantId, quantity: 1 }],
      });
    expect(res.status).toBe(201);
    codOrderId = res.body.data.order.id;

    // Fetch payments list to locate auto-created COD payment row
    const listRes = await adminAgent.get('/api/v1/admin/payments');
    expect(listRes.status).toBe(200);
    const match = (listRes.body.data.payments as { id: string; orderId: string }[]).find(
      (p) => p.orderId === codOrderId,
    );
    expect(match).toBeDefined();
    codPaymentId = match!.id;

    // COD collection & reconciliation
    const collectRes = await adminAgent.post(`/api/v1/admin/payments/${codPaymentId}/cod-collect`).send({
      collectedAmountBdt: 1270,
      reconcileNow: true,
    });
    expect(collectRes.status).toBe(200);
    expect(collectRes.body.data.payment.status).toBe('PAID');
    expect(collectRes.body.data.payment.settledAt).toBeTruthy();

    // Moderator must NOT have 'refund' permission
    const modRefund = await modAgent.post(`/api/v1/admin/payments/${codPaymentId}/refunds`).send({
      amountBdt: 200,
      reason: 'Unauthorized refund check',
    });
    expect(modRefund.status).toBe(403);

    // Super Admin can issue partial refund
    const refundOk = await adminAgent.post(`/api/v1/admin/payments/${codPaymentId}/refunds`).send({
      amountBdt: 200,
      reason: 'Size adjustment courtesy credit',
      approveAndProcess: true,
    });
    expect(refundOk.status).toBe(201);
    expect(refundOk.body.data.refund.status).toBe('PROCESSED');

    // Over-refund guard blocks exceeding original payment amount
    const overRefund = await adminAgent.post(`/api/v1/admin/payments/${codPaymentId}/refunds`).send({
      amountBdt: 5000,
      reason: 'Excessive refund check',
      approveAndProcess: true,
    });
    expect(overRefund.status).toBe(422);
  });

  it('handles gateway initiation idempotency, HMAC webhook verification, duplicate webhook prevention, and failure handling', async () => {
    const methodsRes = await request(app).get('/api/v1/payments/methods');
    expect(methodsRes.status).toBe(200);
    const providers = (methodsRes.body.data.methods as { provider: string; connectionStatus: string }[]);
    expect(providers.find((p) => p.provider === 'COD')?.connectionStatus).toBe('ACTIVE');
    expect(providers.find((p) => p.provider === 'BKASH')?.connectionStatus).toBe('PENDING_CREDENTIALS');

    const orderRes = await custAgent
      .post('/api/v1/orders')
      .set('Idempotency-Key', `c3-bk-${uniqueSuffix}`)
      .send({
        customerName: 'Command03 Tester',
        phone: custPhone,
        division: 'Dhaka',
        district: 'Dhaka',
        upazilaOrArea: 'Banani',
        streetAddress: 'Road 11, Banani',
        paymentMethod: 'COD',
        isDiscreetPackaging: true,
        items: [{ variantId: createdVariantId, quantity: 1 }],
      });
    expect(orderRes.status).toBe(201);
    onlineOrderId = orderRes.body.data.order.id;

    // Initiate bKash sandbox payment twice with same Idempotency-Key
    const init1 = await custAgent
      .post('/api/v1/payments/initiate')
      .set('Idempotency-Key', `pay-init-${uniqueSuffix}`)
      .send({ orderId: onlineOrderId, provider: 'BKASH' });
    expect(init1.status).toBe(201);
    expect(init1.body.data.deduplicated).toBe(false);
    onlinePaymentId = init1.body.data.payment.id;

    const init2 = await custAgent
      .post('/api/v1/payments/initiate')
      .set('Idempotency-Key', `pay-init-${uniqueSuffix}`)
      .send({ orderId: onlineOrderId, provider: 'BKASH' });
    expect(init2.status).toBe(200);
    expect(init2.body.data.deduplicated).toBe(true);
    expect(init2.body.data.payment.id).toBe(onlinePaymentId);

    // Reject forged payment webhook signature
    const webhookPayload = {
      externalEventId: `evt-bk-${uniqueSuffix}`,
      paymentId: onlinePaymentId,
      status: 'PAID',
      transactionRef: `TRX-${uniqueSuffix.toUpperCase()}`,
    };
    const badSig = await request(app)
      .post('/api/v1/webhooks/payments/bkash')
      .set('x-shevalley-signature', 'invalid-hmac')
      .send(webhookPayload);
    expect(badSig.status).toBe(401);

    // Valid HMAC signature marks payment PAID
    const paySecret = process.env.PAYMENT_WEBHOOK_SECRET || 'shevalley-dev-webhook-secret';
    const rawBody = JSON.stringify(webhookPayload);
    const sig = computeHmacSha256Hex(rawBody, paySecret);

    const goodHook = await request(app)
      .post('/api/v1/webhooks/payments/bkash')
      .set('Content-Type', 'application/json')
      .set('x-shevalley-signature', sig)
      .send(rawBody);
    expect(goodHook.status).toBe(200);
    expect(goodHook.body.data.deduplicated).toBe(false);
    expect(goodHook.body.data.payment.status).toBe('PAID');
    expect(goodHook.body.data.payment.verifiedServerSide).toBe(true);
    createdAutomationDedupeKeys.push(`payment_paid_${onlinePaymentId}`);

    // Duplicate externalEventId webhook deduplicates cleanly
    const dupHook = await request(app)
      .post('/api/v1/webhooks/payments/bkash')
      .set('Content-Type', 'application/json')
      .set('x-shevalley-signature', sig)
      .send(rawBody);
    expect(dupHook.status).toBe(200);
    expect(dupHook.body.data.deduplicated).toBe(true);
  });

  it('books discreet courier parcel, syncs status via signed webhook, and calculates courier performance', async () => {
    const bookRes = await adminAgent.post('/api/v1/admin/shipments').send({
      orderId: onlineOrderId,
      provider: 'STEADFAST',
      deliveryChargeBdt: 70,
      discreetLabel: true,
    });
    expect(bookRes.status).toBe(201);
    createdShipmentId = bookRes.body.data.shipment.id;
    const consignmentId = bookRes.body.data.shipment.consignmentId as string;
    expect(bookRes.body.data.shipment.discreetLabel).toBe(true);
    expect(JSON.stringify(bookRes.body.data.shipment.rawTrackingEvents)).not.toContain('Command 03 Comfort Bra');

    // Courier webhook with invalid signature rejected
    const badCourier = await request(app)
      .post('/api/v1/webhooks/couriers/steadfast')
      .set('x-shevalley-signature', 'bad-sig')
      .send({ consignmentId, status: 'DELIVERED' });
    expect(badCourier.status).toBe(401);

    // Valid courier webhook updates shipment & parent order
    const courierBody = JSON.stringify({
      consignmentId,
      status: 'DELIVERED',
      note: 'Handed over in plain parcel',
      codCollectedBdt: 0,
    });
    const courierSecret = process.env.COURIER_WEBHOOK_SECRET || 'shevalley-dev-courier-secret';
    const courierSig = computeHmacSha256Hex(courierBody, courierSecret);

    const hookOk = await request(app)
      .post('/api/v1/webhooks/couriers/steadfast')
      .set('Content-Type', 'application/json')
      .set('x-shevalley-signature', courierSig)
      .send(courierBody);
    expect(hookOk.status).toBe(200);
    expect(hookOk.body.data.shipment.status).toBe('DELIVERED');
    createdAutomationDedupeKeys.push(`courier_${createdShipmentId}_DELIVERED`, `delivered_feedback_${onlineOrderId}`);

    const listCourier = await adminAgent.get('/api/v1/admin/couriers');
    expect(listCourier.status).toBe(200);
    expect(listCourier.body.data.performanceByProvider.STEADFAST.delivered).toBeGreaterThanOrEqual(1);
  });

  it('creates contact support ticket + conversation, replies in inbox, updates CRM tags/notes, and shows ticket to customer', async () => {
    const contactRes = await custAgent.post('/api/v1/support/contact').send({
      name: 'Command03 Tester',
      phone: custPhone,
      email: custEmail,
      category: 'SIZING',
      priority: 'HIGH',
      subject: 'Band fit guidance',
      message: 'Should I choose 34B or 36B for humid weather comfort?',
    });
    expect(contactRes.status).toBe(201);
    createdTicketId = contactRes.body.data.ticket.id;
    createdConversationId = contactRes.body.data.conversation.id;
    createdAutomationDedupeKeys.push(`ticket_${createdTicketId}`);

    // Admin inbox reply + internal note
    const replyRes = await adminAgent.post(`/api/v1/admin/inbox/${createdConversationId}/messages`).send({
      body: 'We recommend 34B with soft extender for calm daily fit.',
      isInternalNote: false,
    });
    expect(replyRes.status).toBe(201);

    // Customer sees ticket under /api/v1/account/tickets
    const myTickets = await custAgent.get('/api/v1/account/tickets');
    expect(myTickets.status).toBe(200);
    expect((myTickets.body.data.tickets as { id: string }[]).some((t) => t.id === createdTicketId)).toBe(true);

    // CRM list shows repeat customer segmentation & supports tag/notes
    const crmList = await adminAgent.get('/api/v1/admin/crm/customers');
    expect(crmList.status).toBe(200);
    const crmCust = (crmList.body.data.customers as { id: string; phone: string; isRepeatCustomer: boolean }[]).find(
      (c) => c.phone === custPhone,
    );
    expect(crmCust).toBeDefined();
    expect(crmCust!.isRepeatCustomer).toBe(true);

    const tagRes = await adminAgent.post(`/api/v1/admin/crm/customers/${crmCust!.id}/tags`).send({ tag: 'FIT_CARE' });
    expect(tagRes.status).toBe(201);
  });

  it('enforces notification failure/retry, automation deduplication + n8n signed webhook, marketing dedupe, SEO & financial reports', async () => {
    // Notification queue with simulated failure -> retry success
    const notifRes = await adminAgent.post('/api/v1/admin/notifications/test').send({
      channel: 'WHATSAPP',
      recipient: custPhone,
      templateKey: 'ORDER_CONFIRMATION',
      simulateFailure: true,
      requiresApproval: false,
    });
    expect(notifRes.status).toBe(201);
    createdNotificationId = notifRes.body.data.notification.id;
    expect(notifRes.body.data.notification.status).toBe('FAILED');

    const retryNotif = await adminAgent.post(`/api/v1/admin/notifications/${createdNotificationId}/retry`).send({});
    expect(retryNotif.status).toBe(200);
    expect(retryNotif.body.data.notification.status).toBe('MOCK_SENT');

    // Automation failure -> retry -> DEAD_LETTER on 3rd failure
    const failKey = `c3-dl-${uniqueSuffix}`;
    createdAutomationDedupeKeys.push(failKey);
    const dl1 = await adminAgent.post('/api/v1/admin/automation/dispatch').send({
      eventType: 'FAILED_AUTOMATION_ERROR_LOG',
      dedupeKey: failKey,
      payload: { reason: 'test' },
      simulateFailure: true,
    });
    expect(dl1.status).toBe(201);
    expect(dl1.body.data.job.status).toBe('FAILED');
    const dlId = dl1.body.data.job.id as string;
    await adminAgent.post(`/api/v1/admin/automation/jobs/${dlId}/retry`).send({ simulateFailure: true });
    const dl3 = await adminAgent.post(`/api/v1/admin/automation/jobs/${dlId}/retry`).send({ simulateFailure: true });
    expect(dl3.body.data.job.status).toBe('DEAD_LETTER');

    // Automation dispatch deduplication
    const dedupeKey = `c3-auto-${uniqueSuffix}`;
    createdAutomationDedupeKeys.push(dedupeKey);
    const auto1 = await adminAgent.post('/api/v1/admin/automation/dispatch').send({
      eventType: 'LOW_STOCK_ADMIN_ALERT',
      dedupeKey,
      payload: { sku: 'SV-C3-TEST', availableQty: 3 },
    });
    expect(auto1.status).toBe(201);
    expect(auto1.body.data.deduplicated).toBe(false);

    const auto2 = await adminAgent.post('/api/v1/admin/automation/dispatch').send({
      eventType: 'LOW_STOCK_ADMIN_ALERT',
      dedupeKey,
      payload: { sku: 'SV-C3-TEST', availableQty: 3 },
    });
    expect(auto2.status).toBe(200);
    expect(auto2.body.data.deduplicated).toBe(true);

    // n8n signed webhook check
    const n8nBody = JSON.stringify({ event: 'PING' });
    const n8nSecret = process.env.N8N_WEBHOOK_SECRET || 'shevalley-n8n-dev';
    const n8nSig = computeHmacSha256Hex(n8nBody, n8nSecret);
    const n8nBad = await request(app).post('/api/v1/webhooks/n8n').set('x-shevalley-signature', 'bad').send(n8nBody);
    expect(n8nBad.status).toBe(401);
    const n8nGood = await request(app)
      .post('/api/v1/webhooks/n8n')
      .set('Content-Type', 'application/json')
      .set('x-shevalley-signature', n8nSig)
      .send(n8nBody);
    expect(n8nGood.status).toBe(200);

    // Marketing event deduplication
    const mktId = `pur_${uniqueSuffix}`;
    createdMarketingEventIds.push(mktId);
    const m1 = await request(app).post('/api/v1/marketing/events').send({
      eventId: mktId,
      eventName: 'Purchase',
      valueBdt: 1270,
      orderId: onlineOrderId,
      consentGranted: true,
    });
    expect(m1.status).toBe(201);
    expect(m1.body.data.deduplicated).toBe(false);

    const m2 = await request(app).post('/api/v1/marketing/events').send({
      eventId: mktId,
      eventName: 'Purchase',
      valueBdt: 1270,
      orderId: onlineOrderId,
      consentGranted: true,
    });
    expect(m2.status).toBe(200);
    expect(m2.body.data.deduplicated).toBe(true);

    // Record business expense & verify financial summary
    const expRes = await adminAgent.post('/api/v1/admin/expenses').send({
      category: 'PACKAGING',
      title: 'Discreet Kraft Mailers Batch',
      amountBdt: 350,
    });
    expect(expRes.status).toBe(201);
    createdExpenseId = expRes.body.data.expense.id;

    const finRes = await adminAgent.get('/api/v1/admin/reports/financial');
    expect(finRes.status).toBe(200);
    expect(finRes.body.data.report.grossRevenueBdt).toBeGreaterThan(0);
    expect(finRes.body.data.report.disclaimer).toMatch(/Estimated/i);

    // SEO sitemap.xml & robots.txt
    const [robotsRes, sitemapRes] = await Promise.all([
      request(app).get('/robots.txt'),
      request(app).get('/sitemap.xml'),
    ]);
    expect(robotsRes.status).toBe(200);
    expect(robotsRes.text).toContain('Disallow: /admin');
    expect(sitemapRes.status).toBe(200);
    expect(sitemapRes.text).toContain('hreflang="bn"');

    // Scheduled Banner window filtering
    const futureBanner = await adminAgent.post('/api/v1/admin/banners').send({
      placement: 'ANNOUNCEMENT',
      titleEn: `Future Campaign ${uniqueSuffix}`,
      titleBn: 'ভবিষ্যৎ ক্যাম্পেইন',
      startsAt: new Date(Date.now() + 86400_000).toISOString(),
    });
    expect(futureBanner.status).toBe(201);
    createdBannerId = futureBanner.body.data.banner.id;

    const bootRes = await request(app).get('/api/v1/storefront/bootstrap');
    const activeTitles = (bootRes.body.data.banners as { titleEn: string }[]).map((b) => b.titleEn);
    expect(activeTitles).not.toContain(`Future Campaign ${uniqueSuffix}`);
  });
});
