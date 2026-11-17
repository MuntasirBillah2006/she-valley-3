import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { BD_PHONE_REGEX, inferDeliveryZone, normalizeBdPhone } from '../../config/bangladesh.ts';
import { db } from '../../db/index.ts';
import {
  addresses,
  customers,
  orderItems,
  orderStatusHistory,
  orders,
  productImages,
  productTranslations,
  products,
  users,
  wishlists,
} from '../../db/schema.ts';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.ts';
import { requireAuth, type AuthRequest } from '../rbac.ts';

export const accountRouter = Router();
accountRouter.use(requireAuth);

async function ensureCustomerProfile(principal: NonNullable<AuthRequest['principal']>) {
  const [existing] = await db
    .select()
    .from(customers)
    .where(eq(customers.userId, principal.userId))
    .limit(1);
  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(customers)
    .values({
      userId: principal.userId,
      fullName: principal.fullName,
      phone: principal.phone || `pending-${principal.userId.slice(0, 8)}`,
      email: principal.email,
    })
    .onConflictDoNothing()
    .returning();

  if (created) {
    return created;
  }

  const [fallback] = await db
    .select()
    .from(customers)
    .where(eq(customers.userId, principal.userId))
    .limit(1);
  return fallback;
}

accountRouter.get('/profile', async (req: AuthRequest, res, next) => {
  try {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        fullName: users.fullName,
        preferredLocale: users.preferredLocale,
        emailVerified: users.emailVerified,
        mfaEnabled: users.mfaEnabled,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.principal!.userId))
      .limit(1);

    return res.json({ success: true, data: { profile: user } });
  } catch (err) {
    next(err);
  }
});

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(BD_PHONE_REGEX).optional(),
  preferredLocale: z.enum(['en', 'bn']).optional(),
});

accountRouter.patch('/profile', async (req: AuthRequest, res, next) => {
  try {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid profile details.', undefined, req.requestId);
    }

    const phone = parsed.data.phone ? normalizeBdPhone(parsed.data.phone) : undefined;
    const [updated] = await db
      .update(users)
      .set({
        fullName: parsed.data.fullName,
        ...(phone ? { phone } : {}),
        ...(parsed.data.preferredLocale ? { preferredLocale: parsed.data.preferredLocale } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.principal!.userId))
      .returning({
        id: users.id,
        email: users.email,
        phone: users.phone,
        fullName: users.fullName,
        preferredLocale: users.preferredLocale,
      });

    await db
      .update(customers)
      .set({
        fullName: parsed.data.fullName,
        ...(phone ? { phone } : {}),
        updatedAt: new Date(),
      })
      .where(eq(customers.userId, req.principal!.userId));

    return res.json({ success: true, data: { profile: updated } });
  } catch (err) {
    next(err);
  }
});

accountRouter.get('/addresses', async (req: AuthRequest, res, next) => {
  try {
    const cust = await ensureCustomerProfile(req.principal!);
    const rows = cust
      ? await db
          .select()
          .from(addresses)
          .where(eq(addresses.customerId, cust.id))
          .orderBy(desc(addresses.isDefault), desc(addresses.createdAt))
      : [];
    return res.json({ success: true, data: { addresses: rows } });
  } catch (err) {
    next(err);
  }
});

const addressCreateSchema = z.object({
  label: z.string().trim().min(1).max(40).default('Home'),
  recipientName: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(BD_PHONE_REGEX),
  division: z.string().trim().min(2),
  district: z.string().trim().min(2),
  upazilaOrArea: z.string().trim().min(2),
  streetAddress: z.string().trim().min(5).max(300),
  postalCode: z.string().trim().max(15).optional(),
  isDefault: z.boolean().default(false),
});

accountRouter.post('/addresses', async (req: AuthRequest, res, next) => {
  try {
    const parsed = addressCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid Bangladesh delivery address.', undefined, req.requestId);
    }

    const cust = await ensureCustomerProfile(req.principal!);
    const zone = inferDeliveryZone(parsed.data.district, parsed.data.upazilaOrArea);
    const phone = normalizeBdPhone(parsed.data.phone);

    const created = await db.transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx
          .update(addresses)
          .set({ isDefault: false })
          .where(eq(addresses.customerId, cust.id));
      }
      const [row] = await tx
        .insert(addresses)
        .values({
          customerId: cust.id,
          label: parsed.data.label,
          recipientName: parsed.data.recipientName,
          phone,
          division: parsed.data.division,
          district: parsed.data.district,
          upazilaOrArea: parsed.data.upazilaOrArea,
          streetAddress: parsed.data.streetAddress,
          postalCode: parsed.data.postalCode || null,
          deliveryZone: zone,
          isDefault: parsed.data.isDefault,
        })
        .returning();
      return row;
    });

    return res.status(201).json({ success: true, data: { address: created } });
  } catch (err) {
    next(err);
  }
});

accountRouter.delete('/addresses/:id', async (req: AuthRequest, res, next) => {
  try {
    const cust = await ensureCustomerProfile(req.principal!);
    await db
      .delete(addresses)
      .where(and(eq(addresses.id, req.params.id), eq(addresses.customerId, cust.id)));
    return res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

accountRouter.get('/orders', async (req: AuthRequest, res, next) => {
  try {
    const cust = await ensureCustomerProfile(req.principal!);
    const condition = cust
      ? or(eq(orders.userId, req.principal!.userId), eq(orders.customerId, cust.id))
      : eq(orders.userId, req.principal!.userId);

    const userOrders = await db
      .select()
      .from(orders)
      .where(condition)
      .orderBy(desc(orders.createdAt));

    return res.json({ success: true, data: { orders: userOrders } });
  } catch (err) {
    next(err);
  }
});

accountRouter.get('/orders/:id', async (req: AuthRequest, res, next) => {
  try {
    const cust = await ensureCustomerProfile(req.principal!);
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, req.params.id))
      .limit(1);

    if (!order) {
      throw new NotFoundError('Order', req.requestId);
    }

    // Strict ownership enforcement: a customer can NEVER view another customer's order (Task 02.66)
    const ownsByUser = order.userId && order.userId === req.principal!.userId;
    const ownsByCustomer = cust && order.customerId && order.customerId === cust.id;
    if (!ownsByUser && !ownsByCustomer) {
      throw new ForbiddenError('You do not have access to this order.', req.requestId);
    }

    const [items, history] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
      db
        .select()
        .from(orderStatusHistory)
        .where(and(eq(orderStatusHistory.orderId, order.id), eq(orderStatusHistory.isInternalNote, false)))
        .orderBy(desc(orderStatusHistory.createdAt)),
    ]);

    return res.json({ success: true, data: { order, items, timeline: history } });
  } catch (err) {
    next(err);
  }
});

accountRouter.get('/wishlist', async (req: AuthRequest, res, next) => {
  try {
    const rows = await db
      .select()
      .from(wishlists)
      .where(eq(wishlists.userId, req.principal!.userId))
      .orderBy(desc(wishlists.createdAt));

    if (rows.length === 0) {
      return res.json({ success: true, data: { items: [] } });
    }

    const productIds = rows.map((r) => r.productId);
    const [prodRows, transRows, imageRows] = await Promise.all([
      db.select().from(products).where(inArray(products.id, productIds)),
      db.select().from(productTranslations).where(inArray(productTranslations.productId, productIds)),
      db.select().from(productImages).where(inArray(productImages.productId, productIds)),
    ]);

    const items = rows
      .map((w) => {
        const prod = prodRows.find((p) => p.id === w.productId);
        if (!prod) {
          return null;
        }
        const en = transRows.find((t) => t.productId === prod.id && t.locale === 'en');
        const bn = transRows.find((t) => t.productId === prod.id && t.locale === 'bn');
        const img = imageRows.find((i) => i.productId === prod.id && i.isPrimary) ?? imageRows[0];
        return {
          id: w.id,
          productId: prod.id,
          slug: prod.slug,
          basePriceBdt: Number(prod.basePriceBdt),
          imageUrl: img?.url ?? null,
          name: { en: en?.name ?? prod.slug, bn: bn?.name ?? en?.name ?? prod.slug },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return res.json({ success: true, data: { items } });
  } catch (err) {
    next(err);
  }
});

accountRouter.post('/wishlist', async (req: AuthRequest, res, next) => {
  try {
    const productId = typeof req.body?.productId === 'string' ? req.body.productId : '';
    if (!productId) {
      throw new ValidationError('productId is required.', undefined, req.requestId);
    }

    await db
      .insert(wishlists)
      .values({ userId: req.principal!.userId, productId })
      .onConflictDoNothing();

    return res.status(201).json({ success: true, data: { saved: true } });
  } catch (err) {
    next(err);
  }
});

accountRouter.delete('/wishlist/:productId', async (req: AuthRequest, res, next) => {
  try {
    await db
      .delete(wishlists)
      .where(
        and(
          eq(wishlists.userId, req.principal!.userId),
          eq(wishlists.productId, req.params.productId),
        ),
      );

    return res.json({ success: true, data: { removed: true } });
  } catch (err) {
    next(err);
  }
});
