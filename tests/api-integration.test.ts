// @vitest-environment node
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.ts';
import {
  auditLogs,
  categories,
  inventory,
  orders,
  productVariants,
  products,
  stockMovements,
  users,
} from '../src/db/schema.ts';
import { ensureSystemBootstrap } from '../src/db/seed.ts';
import { createApp } from '../src/server/app.ts';

const hasSqlEnv = Boolean(process.env.SQL_HOST && process.env.SQL_DB_NAME && process.env.SQL_USER);

describe.skipIf(!hasSqlEnv)('SHE-VALLEY Backend API, Auth, RBAC & Concurrency Integration', () => {
  const app = createApp();
  let adminAgent: ReturnType<typeof request.agent>;
  let modAgent: ReturnType<typeof request.agent>;
  let custAgent: ReturnType<typeof request.agent>;
  let otherCustAgent: ReturnType<typeof request.agent>;

  let testCategoryId = '';
  let createdProductId = '';
  let createdVariantId = '';
  let createdOrderId = '';
  let createdOrderNumber = '';

  const uniqueSuffix = Date.now().toString(36);
  const custEmail = `test-cust-${uniqueSuffix}@shevalley.test`;
  const custPhone = `017${String(Math.floor(10000000 + Math.random() * 89999999))}`;
  const otherCustEmail = `test-other-${uniqueSuffix}@shevalley.test`;
  const otherCustPhone = `018${String(Math.floor(10000000 + Math.random() * 89999999))}`;

  beforeAll(async () => {
    await ensureSystemBootstrap();
    adminAgent = request.agent(app);
    modAgent = request.agent(app);
    custAgent = request.agent(app);
    otherCustAgent = request.agent(app);

    const [cat] = await db.select().from(categories).where(eq(categories.isActive, true)).limit(1);
    testCategoryId = cat.id;
  }, 30000);

  afterAll(async () => {
    try {
      if (createdOrderId) {
        await db.delete(orders).where(eq(orders.id, createdOrderId));
      }
      if (createdProductId) {
        await db.delete(products).where(eq(products.id, createdProductId));
      }
      await db.delete(users).where(eq(users.email, custEmail));
      await db.delete(users).where(eq(users.email, otherCustEmail));
    } catch {
      // Ignore best-effort cleanup errors
    }
  });

  it('returns healthy status from /api/v1/health and storefront bootstrap', async () => {
    const health = await request(app).get('/api/v1/health');
    expect(health.status).toBe(200);
    expect(health.body.success).toBe(true);

    const boot = await request(app).get('/api/v1/storefront/bootstrap');
    expect(boot.status).toBe(200);
    expect(boot.body.data.categories.length).toBeGreaterThan(0);
    expect(boot.body.data.featuredProducts.length).toBeGreaterThan(0);
    // Task 02.145: policy pages must stay unpublished by default
    const publishedSlugs = (boot.body.data.staticPages as { slug: string }[]).map((p) => p.slug);
    expect(publishedSlugs).not.toContain('privacy-policy');
    expect(publishedSlugs).not.toContain('return-policy');
  });

  it('rejects unauthenticated access to privileged admin routes with 401', async () => {
    const res = await request(app).get('/api/v1/admin/overview');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('registers customer, logs in, and enforces Admin MFA before granting admin access', async () => {
    const reg = await custAgent.post('/api/v1/auth/register').send({
      fullName: 'Test Customer',
      email: custEmail,
      phone: custPhone,
      password: 'Password!2026',
      preferredLocale: 'en',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.roles).toContain('CUSTOMER');

    // Customer cannot access admin overview
    const custAdminAttempt = await custAgent.get('/api/v1/admin/overview');
    expect(custAdminAttempt.status).toBe(403);

    // Super Admin login triggers MFA challenge
    const adminLogin = await adminAgent.post('/api/v1/auth/login').send({
      identifier: 'admin@shevalley.local',
      password: 'SheValleyAdmin!2026',
    });
    expect(adminLogin.status).toBe(200);
    expect(adminLogin.body.data.mfaRequired).toBe(true);

    // Before MFA verify, admin routes reject with 403
    const beforeMfa = await adminAgent.get('/api/v1/admin/overview');
    expect(beforeMfa.status).toBe(403);

    // Verify MFA
    const mfaRes = await adminAgent.post('/api/v1/auth/mfa/verify').send({ passcode: '246810' });
    expect(mfaRes.status).toBe(200);
    expect(mfaRes.body.data.mfaVerified).toBe(true);

    const afterMfa = await adminAgent.get('/api/v1/admin/overview');
    expect(afterMfa.status).toBe(200);
    expect(afterMfa.body.data.kpis).toBeDefined();
  });

  it('enforces Moderator restrictions (no staff management, settings, or pricing/product edits)', async () => {
    const modLogin = await modAgent.post('/api/v1/auth/login').send({
      identifier: 'moderator@shevalley.local',
      password: 'SheValleyMod!2026',
    });
    expect(modLogin.status).toBe(200);

    // Moderator can view overview and moderate reviews
    const viewOverview = await modAgent.get('/api/v1/admin/overview');
    expect(viewOverview.status).toBe(200);

    // Moderator CANNOT manage users, edit settings, or create/edit products
    const staffAttempt = await modAgent.get('/api/v1/admin/staff');
    expect(staffAttempt.status).toBe(403);

    const settingsAttempt = await modAgent.patch('/api/v1/admin/settings/delivery_zones').send({
      valueJson: { DHAKA_METRO: 50, SUB_DHAKA: 90, OUTSIDE_DHAKA: 120, freeDeliveryThresholdBdt: 2500 },
    });
    expect(settingsAttempt.status).toBe(403);

    const productAttempt = await modAgent.post('/api/v1/admin/products').send({});
    expect(productAttempt.status).toBe(403);
  });

  it('allows Super Admin to create product, update variant price with audit log, and enforce policy approval guard', async () => {
    const slug = `test-soft-bra-${uniqueSuffix}`;
    const sku = `SV-TST-${uniqueSuffix.toUpperCase()}`;

    const createRes = await adminAgent.post('/api/v1/admin/products').send({
      categoryId: testCategoryId,
      slug,
      skuPrefix: 'SV-TST',
      status: 'ACTIVE',
      isFeatured: false,
      isNewArrival: true,
      basePriceBdt: 1050,
      nameEn: 'Test Breathable Bra',
      nameBn: 'টেস্ট ব্রেথেবল ব্রা',
      descriptionEn: 'Soft cotton test bra for automated integration checks.',
      descriptionBn: 'অটোমেটেড টেস্টের জন্য কটন ব্রা।',
      initialVariant: {
        sku,
        size: '34B',
        colorName: 'Ivory',
        colorHex: '#F7F1EB',
        priceBdt: 1050,
        costPriceBdt: 600,
        initialStock: 2,
      },
    });
    expect(createRes.status).toBe(201);
    createdProductId = createRes.body.data.product.id;
    createdVariantId = createRes.body.data.variant.id;

    // Update variant price and confirm audit log records before/after price
    const priceRes = await adminAgent.patch(`/api/v1/admin/variants/${createdVariantId}`).send({
      priceBdt: 1100,
    });
    expect(priceRes.status).toBe(200);
    expect(Number(priceRes.body.data.variant.priceBdt)).toBe(1100);

    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, createdVariantId));
    expect(logs.some((l) => l.action === 'VARIANT_PRICE_CHANGED')).toBe(true);

    // Policy publish guard: cannot publish without ownerApproved === true
    const policyFail = await adminAgent.patch('/api/v1/admin/pages/privacy-policy').send({
      isPublished: true,
      ownerApproved: false,
    });
    expect(policyFail.status).toBe(422);
  });

  it('prevents overselling under concurrent checkout and deduplicates Idempotency-Key', async () => {
    // Stock is currently 2 units for createdVariantId.
    // Fire two concurrent orders each requesting 2 units -> strictly 1 succeeds, 1 fails with 422!
    const payload = {
      customerName: 'Test Customer',
      phone: custPhone,
      division: 'Dhaka',
      district: 'Dhaka',
      upazilaOrArea: 'Dhanmondi',
      streetAddress: 'House 12, Road 5, Dhanmondi',
      paymentMethod: 'COD',
      isDiscreetPackaging: true,
      items: [{ variantId: createdVariantId, quantity: 2 }],
    };

    const [resA, resB] = await Promise.all([
      custAgent.post('/api/v1/orders').set('Idempotency-Key', `idem-a-${uniqueSuffix}`).send(payload),
      custAgent.post('/api/v1/orders').set('Idempotency-Key', `idem-b-${uniqueSuffix}`).send(payload),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 422]);

    const winner = resA.status === 201 ? resA : resB;
    const winnerKey = resA.status === 201 ? `idem-a-${uniqueSuffix}` : `idem-b-${uniqueSuffix}`;
    createdOrderId = winner.body.data.order.id;
    createdOrderNumber = winner.body.data.order.orderNumber;

    // Duplicate checkout with same Idempotency-Key returns same order without double-reserving stock
    const dupRes = await custAgent
      .post('/api/v1/orders')
      .set('Idempotency-Key', winnerKey)
      .send(payload);
    expect(dupRes.status).toBe(200);
    expect(dupRes.body.data.deduplicated).toBe(true);
    expect(dupRes.body.data.order.id).toBe(createdOrderId);

    // Verify customer isolation: another customer gets 403 on createdOrderId
    await otherCustAgent.post('/api/v1/auth/register').send({
      fullName: 'Other Customer',
      email: otherCustEmail,
      phone: otherCustPhone,
      password: 'Password!2026',
      preferredLocale: 'en',
    });
    const forbiddenOrderView = await otherCustAgent.get(`/api/v1/account/orders/${createdOrderId}`);
    expect(forbiddenOrderView.status).toBe(403);

    // Guest tracking requires matching phone
    const trackOk = await request(app).post('/api/v1/orders/track').send({
      orderNumber: createdOrderNumber,
      phone: custPhone,
    });
    expect(trackOk.status).toBe(200);
    expect(trackOk.body.data.order.orderNumber).toBe(createdOrderNumber);
  });

  it('restores stock idempotently (exactly once) when order is cancelled multiple times', async () => {
    const [invBefore] = await db
      .select()
      .from(inventory)
      .where(eq(inventory.variantId, createdVariantId));
    expect(invBefore.reservedQty).toBe(2);

    // First cancellation releases 2 reserved units
    const cancel1 = await adminAgent.patch(`/api/v1/admin/orders/${createdOrderId}/status`).send({
      status: 'CANCELLED',
      note: 'Customer requested cancellation',
    });
    expect(cancel1.status).toBe(200);
    expect(cancel1.body.data.order.stockRestored).toBe(true);

    const [invAfterFirst] = await db
      .select()
      .from(inventory)
      .where(eq(inventory.variantId, createdVariantId));
    expect(invAfterFirst.reservedQty).toBe(0);
    expect(invAfterFirst.onHandQty).toBe(2);

    // Second transition to FAILED_DELIVERY or CANCELLED MUST NOT double-restore stock
    const cancel2 = await adminAgent.patch(`/api/v1/admin/orders/${createdOrderId}/status`).send({
      status: 'CANCELLED',
      note: 'Duplicate cancel click',
    });
    expect(cancel2.status).toBe(200);

    const [invAfterSecond] = await db
      .select()
      .from(inventory)
      .where(eq(inventory.variantId, createdVariantId));
    expect(invAfterSecond.reservedQty).toBe(0);
    expect(invAfterSecond.onHandQty).toBe(2);

    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.referenceId, createdOrderId));
    const releaseMovements = movements.filter((m) => m.type === 'RELEASE');
    expect(releaseMovements.length).toBe(1);
  });
});
