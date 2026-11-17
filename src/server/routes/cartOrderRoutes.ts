import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  BD_PHONE_REGEX,
  DEFAULT_DELIVERY_CHARGES,
  calculateDeliveryFeeBdt,
  inferDeliveryZone,
  normalizeBdPhone,
  type DeliveryChargeConfig,
} from '../../config/bangladesh.ts';
import { db } from '../../db/index.ts';
import {
  cartItems,
  carts,
  customers,
  inventory,
  orderItems,
  orderStatusHistory,
  orders,
  payments,
  productImages,
  productTranslations,
  productVariants,
  products,
  settings,
  shipments,
  stockMovements,
} from '../../db/schema.ts';
import { BusinessRuleError, NotFoundError, ValidationError } from '../../lib/errors.ts';
import { recordAuditLog } from '../audit.ts';
import { generateOpaqueToken } from '../rateLimit.ts';
import type { AuthRequest } from '../rbac.ts';
import { dispatchAutomationEvent } from '../services/automationService.ts';
import { getPaymentConfig, getPaymentProvidersStatus } from '../services/paymentService.ts';

const CART_COOKIE_NAME = 'sv_cart_token';

export const cartOrderRouter = Router();

async function resolveOrCreateCart(req: AuthRequest, res: Response) {
  let token =
    (typeof req.cookies?.[CART_COOKIE_NAME] === 'string' && req.cookies[CART_COOKIE_NAME]) ||
    (typeof req.headers['x-cart-token'] === 'string' && req.headers['x-cart-token']) ||
    '';

  if (token) {
    const [existing] = await db
      .select()
      .from(carts)
      .where(eq(carts.sessionToken, token))
      .limit(1);
    if (existing) {
      return existing;
    }
  }

  token = generateOpaqueToken(16);
  const [created] = await db
    .insert(carts)
    .values({
      sessionToken: token,
      locale: 'en',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    })
    .returning();

  res.cookie(CART_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });

  return created;
}

async function buildCartResponse(cartId: string) {
  const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cartId));
  if (items.length === 0) {
    return { cartId, items: [], subtotalBdt: 0, itemCount: 0 };
  }

  const variantIds = items.map((i) => i.variantId);
  const variantRows = await db
    .select()
    .from(productVariants)
    .where(inArray(productVariants.id, variantIds));
  const productIds = Array.from(new Set(variantRows.map((v) => v.productId)));

  const [transRows, imageRows, invRows, prodRows] = await Promise.all([
    db.select().from(productTranslations).where(inArray(productTranslations.productId, productIds)),
    db.select().from(productImages).where(inArray(productImages.productId, productIds)),
    db.select().from(inventory).where(inArray(inventory.variantId, variantIds)),
    db.select().from(products).where(inArray(products.id, productIds)),
  ]);

  const enriched = items
    .map((item) => {
      const variant = variantRows.find((v) => v.id === item.variantId);
      if (!variant) {
        return null;
      }
      const prod = prodRows.find((p) => p.id === variant.productId);
      const en = transRows.find((t) => t.productId === variant.productId && t.locale === 'en');
      const bn = transRows.find((t) => t.productId === variant.productId && t.locale === 'bn');
      const img = imageRows.find((i) => i.productId === variant.productId && i.isPrimary) ?? imageRows[0];
      const inv = invRows.find((i) => i.variantId === variant.id);
      const availableQty = inv ? Math.max(0, inv.onHandQty - inv.reservedQty) : 0;
      const unitPriceBdt = Number(variant.priceBdt);

      return {
        id: item.id,
        variantId: variant.id,
        productId: variant.productId,
        slug: prod?.slug ?? '',
        sku: variant.sku,
        size: variant.size,
        colorName: variant.colorName,
        colorHex: variant.colorHex,
        quantity: item.quantity,
        availableQty,
        unitPriceBdt,
        lineTotalBdt: unitPriceBdt * item.quantity,
        imageUrl: img?.url ?? null,
        name: {
          en: en?.name ?? variant.sku,
          bn: bn?.name ?? en?.name ?? variant.sku,
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const subtotalBdt = enriched.reduce((sum, i) => sum + i.lineTotalBdt, 0);
  const itemCount = enriched.reduce((sum, i) => sum + i.quantity, 0);

  return { cartId, items: enriched, subtotalBdt, itemCount };
}

cartOrderRouter.get('/cart', async (req: AuthRequest, res, next) => {
  try {
    const cart = await resolveOrCreateCart(req, res);
    const data = await buildCartResponse(cart.id);
    return res.json({ success: true, data: { ...data, sessionToken: cart.sessionToken } });
  } catch (err) {
    next(err);
  }
});

const cartAddSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
});

cartOrderRouter.post('/cart/items', async (req: AuthRequest, res, next) => {
  try {
    const parsed = cartAddSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Valid variant and quantity (1-20) are required.', undefined, req.requestId);
    }

    const [variant] = await db
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.id, parsed.data.variantId), eq(productVariants.isActive, true)))
      .limit(1);
    if (!variant) {
      throw new NotFoundError('Product variant', req.requestId);
    }

    const [inv] = await db
      .select()
      .from(inventory)
      .where(eq(inventory.variantId, variant.id))
      .limit(1);
    const available = inv ? inv.onHandQty - inv.reservedQty : 0;

    const cart = await resolveOrCreateCart(req, res);
    const [existingItem] = await db
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variant.id)))
      .limit(1);

    const targetQty = (existingItem?.quantity ?? 0) + parsed.data.quantity;
    if (targetQty > available) {
      throw new BusinessRuleError(
        `Only ${available} unit(s) currently available for ${variant.sku}.`,
        undefined,
        req.requestId,
      );
    }

    if (existingItem) {
      await db
        .update(cartItems)
        .set({
          quantity: targetQty,
          unitPriceSnapshotBdt: variant.priceBdt,
          updatedAt: new Date(),
        })
        .where(eq(cartItems.id, existingItem.id));
    } else {
      await db.insert(cartItems).values({
        cartId: cart.id,
        variantId: variant.id,
        quantity: targetQty,
        unitPriceSnapshotBdt: variant.priceBdt,
      });
    }

    const data = await buildCartResponse(cart.id);
    return res.status(201).json({ success: true, data: { ...data, sessionToken: cart.sessionToken } });
  } catch (err) {
    next(err);
  }
});

const cartUpdateSchema = z.object({
  quantity: z.number().int().min(1).max(20),
});

cartOrderRouter.patch('/cart/items/:variantId', async (req: AuthRequest, res, next) => {
  try {
    const parsed = cartUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Quantity must be between 1 and 20.', undefined, req.requestId);
    }

    const cart = await resolveOrCreateCart(req, res);
    const [inv] = await db
      .select()
      .from(inventory)
      .where(eq(inventory.variantId, req.params.variantId))
      .limit(1);
    const available = inv ? inv.onHandQty - inv.reservedQty : 0;

    if (parsed.data.quantity > available) {
      throw new BusinessRuleError(
        `Only ${available} unit(s) available in stock.`,
        undefined,
        req.requestId,
      );
    }

    await db
      .update(cartItems)
      .set({ quantity: parsed.data.quantity, updatedAt: new Date() })
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, req.params.variantId)));

    const data = await buildCartResponse(cart.id);
    return res.json({ success: true, data: { ...data, sessionToken: cart.sessionToken } });
  } catch (err) {
    next(err);
  }
});

cartOrderRouter.delete('/cart/items/:variantId', async (req: AuthRequest, res, next) => {
  try {
    const cart = await resolveOrCreateCart(req, res);
    await db
      .delete(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, req.params.variantId)));
    const data = await buildCartResponse(cart.id);
    return res.json({ success: true, data: { ...data, sessionToken: cart.sessionToken } });
  } catch (err) {
    next(err);
  }
});

const checkoutOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(BD_PHONE_REGEX, 'Enter a valid 11-digit Bangladesh mobile number.'),
  email: z.string().trim().email().optional().or(z.literal('')),
  division: z.string().trim().min(2),
  district: z.string().trim().min(2),
  upazilaOrArea: z.string().trim().min(2),
  streetAddress: z.string().trim().min(5).max(300),
  postalCode: z.string().trim().max(15).optional(),
  paymentMethod: z.enum(['COD', 'BKASH', 'NAGAD', 'SSLCOMMERZ']).default('COD'),
  isDiscreetPackaging: z.boolean().default(true),
  customerNote: z.string().trim().max(400).optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1),
});

cartOrderRouter.post('/orders', async (req: AuthRequest, res, next) => {
  try {
    const parsed = checkoutOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'Please review checkout address and contact fields.',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        req.requestId,
      );
    }

    if (parsed.data.paymentMethod !== 'COD') {
      const [payCfg, providers] = await Promise.all([getPaymentConfig(), getPaymentProvidersStatus()]);
      const match = providers.find((p) => p.provider === parsed.data.paymentMethod);
      if (!match || !match.enabled) {
        throw new BusinessRuleError(`${parsed.data.paymentMethod} is currently disabled.`, undefined, req.requestId);
      }
      if (!match.credentialsConfigured && !payCfg.sandboxModeEnabled) {
        throw new BusinessRuleError(
          `${parsed.data.paymentMethod} is Pending Credentials. Please select Cash on Delivery (COD).`,
          undefined,
          req.requestId,
        );
      }
    }

    const idempotencyKey =
      (typeof req.headers['idempotency-key'] === 'string' && req.headers['idempotency-key'].trim()) ||
      null;

    if (idempotencyKey) {
      const [existingOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existingOrder) {
        const existingItems = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, existingOrder.id));
        return res.status(200).json({
          success: true,
          data: { order: existingOrder, items: existingItems, deduplicated: true },
        });
      }
    }

    const normalizedPhone = normalizeBdPhone(parsed.data.phone);
    const deliveryZone = inferDeliveryZone(parsed.data.district, parsed.data.upazilaOrArea);

    const [deliverySettingRow] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, 'delivery_zones'))
      .limit(1);
    const deliveryConfig = (deliverySettingRow?.valueJson as DeliveryChargeConfig) ?? DEFAULT_DELIVERY_CHARGES;

    const createdResult = await db.transaction(async (tx) => {
      // Consolidate duplicate variantIds in request payload
      const qtyByVariant = new Map<string, number>();
      for (const line of parsed.data.items) {
        qtyByVariant.set(line.variantId, (qtyByVariant.get(line.variantId) ?? 0) + line.quantity);
      }

      const sortedVariantIds = Array.from(qtyByVariant.keys()).sort();
      let subtotalBdt = 0;

      const preparedLines: {
        variantId: string;
        sku: string;
        size: string;
        colorName: string;
        productNameEn: string;
        productNameBn: string;
        quantity: number;
        unitPriceBdt: number;
        lineTotalBdt: number;
      }[] = [];

      for (const variantId of sortedVariantIds) {
        const qty = qtyByVariant.get(variantId)!;

        // Lock inventory row for concurrency safety (prevents overselling)
        const lockedInv = await tx.execute(
          sql`SELECT id, on_hand_qty, reserved_qty FROM inventory WHERE variant_id = ${variantId} FOR UPDATE`,
        );
        const invRow = lockedInv.rows[0] as
          | { id: string; on_hand_qty: number; reserved_qty: number }
          | undefined;

        if (!invRow) {
          throw new NotFoundError('Product inventory record', req.requestId);
        }

        const available = Number(invRow.on_hand_qty) - Number(invRow.reserved_qty);
        if (available < qty) {
          throw new BusinessRuleError(
            `Insufficient stock for requested item (available: ${available}, requested: ${qty}).`,
            undefined,
            req.requestId,
          );
        }

        const [variant] = await tx
          .select()
          .from(productVariants)
          .where(and(eq(productVariants.id, variantId), eq(productVariants.isActive, true)))
          .limit(1);
        if (!variant) {
          throw new NotFoundError('Product variant', req.requestId);
        }

        const translations = await tx
          .select()
          .from(productTranslations)
          .where(eq(productTranslations.productId, variant.productId));
        const en = translations.find((t) => t.locale === 'en');
        const bn = translations.find((t) => t.locale === 'bn');

        const unitPrice = Number(variant.priceBdt);
        const lineTotal = unitPrice * qty;
        subtotalBdt += lineTotal;

        // Reserve stock atomically
        const nextReserved = Number(invRow.reserved_qty) + qty;
        await tx
          .update(inventory)
          .set({ reservedQty: nextReserved, updatedAt: new Date() })
          .where(eq(inventory.id, invRow.id));

        preparedLines.push({
          variantId,
          sku: variant.sku,
          size: variant.size,
          colorName: variant.colorName,
          productNameEn: en?.name ?? variant.sku,
          productNameBn: bn?.name ?? en?.name ?? variant.sku,
          quantity: qty,
          unitPriceBdt: unitPrice,
          lineTotalBdt: lineTotal,
        });
      }

      const deliveryFeeBdt = calculateDeliveryFeeBdt(deliveryZone, subtotalBdt, deliveryConfig);
      const totalBdt = subtotalBdt + deliveryFeeBdt;

      // Upsert or match customer record
      let customerId: string | null = null;
      if (req.principal?.userId) {
        const [byUser] = await tx
          .select()
          .from(customers)
          .where(eq(customers.userId, req.principal.userId))
          .limit(1);
        if (byUser) {
          customerId = byUser.id;
        }
      }
      if (!customerId) {
        const [cust] = await tx
          .insert(customers)
          .values({
            userId: req.principal?.userId ?? null,
            fullName: parsed.data.customerName,
            phone: normalizedPhone,
            email: parsed.data.email || null,
          })
          .onConflictDoUpdate({
            target: customers.phone,
            set: {
              fullName: parsed.data.customerName,
              email: parsed.data.email || null,
              updatedAt: new Date(),
            },
          })
          .returning();
        customerId = cust.id;
      }

      const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
      const orderNumber = `SV-${dateTag}-${suffix}`;

      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber,
          idempotencyKey,
          customerId,
          userId: req.principal?.userId ?? null,
          guestName: parsed.data.customerName,
          guestPhone: normalizedPhone,
          guestEmail: parsed.data.email || null,
          shippingAddressSnapshot: {
            recipientName: parsed.data.customerName,
            phone: normalizedPhone,
            division: parsed.data.division,
            district: parsed.data.district,
            upazilaOrArea: parsed.data.upazilaOrArea,
            streetAddress: parsed.data.streetAddress,
            postalCode: parsed.data.postalCode || '',
          },
          deliveryZone,
          status: 'PENDING_VERIFICATION',
          paymentMethod: parsed.data.paymentMethod,
          paymentStatus: 'PENDING',
          subtotalBdt: subtotalBdt.toFixed(2),
          deliveryFeeBdt: deliveryFeeBdt.toFixed(2),
          discountBdt: '0.00',
          totalBdt: totalBdt.toFixed(2),
          isDiscreetPackaging: parsed.data.isDiscreetPackaging,
          customerNote: parsed.data.customerNote || null,
        })
        .returning();

      const insertedItems = await tx
        .insert(orderItems)
        .values(
          preparedLines.map((line) => ({
            orderId: order.id,
            variantId: line.variantId,
            productNameSnapshotEn: line.productNameEn,
            productNameSnapshotBn: line.productNameBn,
            variantLabelSnapshot: `${line.size} · ${line.colorName}`,
            skuSnapshot: line.sku,
            quantity: line.quantity,
            unitPriceBdt: line.unitPriceBdt.toFixed(2),
            lineTotalBdt: line.lineTotalBdt.toFixed(2),
          })),
        )
        .returning();

      for (const line of preparedLines) {
        const [invAfter] = await tx
          .select()
          .from(inventory)
          .where(eq(inventory.variantId, line.variantId))
          .limit(1);
        await tx.insert(stockMovements).values({
          variantId: line.variantId,
          warehouseId: invAfter?.warehouseId ?? null,
          type: 'RESERVE',
          quantityDelta: -line.quantity,
          balanceAfter: invAfter ? invAfter.onHandQty - invAfter.reservedQty : 0,
          referenceType: 'ORDER',
          referenceId: order.id,
          reason: `Stock reserved for order ${order.orderNumber}`,
          actorUserId: req.principal?.userId ?? null,
        });
      }

      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: null,
        toStatus: 'PENDING_VERIFICATION',
        note: 'Order placed via Cash on Delivery',
        isInternalNote: false,
        actorUserId: req.principal?.userId ?? null,
      });

      const [createdPayment] = await tx
        .insert(payments)
        .values({
          orderId: order.id,
          provider: parsed.data.paymentMethod,
          amountBdt: totalBdt.toFixed(2),
          status: parsed.data.paymentMethod === 'COD' ? 'PENDING' : 'INITIATED',
          idempotencyKey: `pay_${order.id}`,
        })
        .returning();

      // Clear active session cart if cookie/header exists
      const cartToken =
        (typeof req.cookies?.[CART_COOKIE_NAME] === 'string' && req.cookies[CART_COOKIE_NAME]) ||
        (typeof req.headers['x-cart-token'] === 'string' && req.headers['x-cart-token']) ||
        null;
      if (cartToken) {
        const [activeCart] = await tx
          .select()
          .from(carts)
          .where(eq(carts.sessionToken, cartToken))
          .limit(1);
        if (activeCart) {
          await tx.delete(cartItems).where(eq(cartItems.cartId, activeCart.id));
        }
      }

      await recordAuditLog(tx, {
        actorUserId: req.principal?.userId ?? null,
        actorEmail: req.principal?.email ?? parsed.data.email ?? null,
        actorRole: req.principal?.roles[0] ?? 'GUEST',
        action: 'ORDER_CREATED',
        entityType: 'orders',
        entityId: order.id,
        afterState: { orderNumber: order.orderNumber, totalBdt, paymentMethod: parsed.data.paymentMethod },
        ipAddress: req.ip,
        requestId: req.requestId || 'unknown',
      });

      return { order, items: insertedItems, payment: createdPayment };
    });

    // Fire post-commit automation events (non-blocking for checkout correctness, deduplicated)
    await dispatchAutomationEvent({
      eventType: 'NEW_ORDER_ADMIN_ALERT',
      dedupeKey: `new_order_${createdResult.order.id}`,
      payload: {
        orderId: createdResult.order.id,
        orderNumber: createdResult.order.orderNumber,
        totalBdt: createdResult.order.totalBdt,
        paymentMethod: createdResult.order.paymentMethod,
      },
    }).catch(() => undefined);

    for (const line of createdResult.items) {
      const [invRow] = await db
        .select()
        .from(inventory)
        .where(eq(inventory.variantId, line.variantId))
        .limit(1);
      if (invRow) {
        const avail = invRow.onHandQty - invRow.reservedQty;
        if (avail <= 0) {
          await dispatchAutomationEvent({
            eventType: 'OUT_OF_STOCK_AVAILABILITY_UPDATE',
            dedupeKey: `oos_${line.variantId}_${createdResult.order.id}`,
            payload: { variantId: line.variantId, sku: line.skuSnapshot, availableQty: avail },
          }).catch(() => undefined);
        } else if (avail <= invRow.lowStockThreshold) {
          await dispatchAutomationEvent({
            eventType: 'LOW_STOCK_ADMIN_ALERT',
            dedupeKey: `low_stock_${line.variantId}_${createdResult.order.id}`,
            payload: { variantId: line.variantId, sku: line.skuSnapshot, availableQty: avail },
          }).catch(() => undefined);
        }
      }
    }

    return res.status(201).json({
      success: true,
      data: createdResult,
    });
  } catch (err) {
    next(err);
  }
});

const trackOrderSchema = z.object({
  orderNumber: z.string().trim().min(5),
  phone: z.string().trim().regex(BD_PHONE_REGEX, 'Enter the 11-digit mobile number used for this order.'),
});

cartOrderRouter.post('/orders/track', async (req: AuthRequest, res, next) => {
  try {
    const parsed = trackOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Order number and matching mobile number are required.', undefined, req.requestId);
    }

    const normalizedPhone = normalizeBdPhone(parsed.data.phone);
    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.orderNumber, parsed.data.orderNumber.toUpperCase()),
          eq(orders.guestPhone, normalizedPhone),
        ),
      )
      .limit(1);

    if (!order) {
      throw new NotFoundError('Matching order', req.requestId);
    }

    const [items, history, shipmentRows] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
      db
        .select()
        .from(orderStatusHistory)
        .where(and(eq(orderStatusHistory.orderId, order.id), eq(orderStatusHistory.isInternalNote, false)))
        .orderBy(desc(orderStatusHistory.createdAt)),
      db.select().from(shipments).where(eq(shipments.orderId, order.id)).orderBy(desc(shipments.createdAt)).limit(1),
    ]);

    const addr = order.shippingAddressSnapshot as { district?: string; division?: string };
    const ship = shipmentRows[0];

    return res.json({
      success: true,
      data: {
        order: {
          orderNumber: order.orderNumber,
          status: order.status,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          subtotalBdt: Number(order.subtotalBdt),
          deliveryFeeBdt: Number(order.deliveryFeeBdt),
          totalBdt: Number(order.totalBdt),
          deliveryZone: order.deliveryZone,
          isDiscreetPackaging: order.isDiscreetPackaging,
          districtSummary: `${addr?.district ?? ''}, ${addr?.division ?? ''}`,
          createdAt: order.createdAt,
        },
        items,
        timeline: history,
        shipment: ship
          ? {
              provider: ship.provider,
              trackingCode: ship.trackingCode,
              consignmentId: ship.consignmentId,
              status: ship.status,
              connectionMode: ship.connectionMode,
            }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});
