import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { Router } from 'express';
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
  auditLogs,
  banners,
  blogPosts,
  categories,
  categoryTranslations,
  contentPages,
  customers,
  faqs,
  inventory,
  notifications,
  orderItems,
  orderStatusHistory,
  orders,
  payments,
  productImages,
  productTranslations,
  productVariants,
  products,
  purchaseRecords,
  reviews,
  roles,
  sessions,
  settings,
  stockMovements,
  suppliers,
  userRoles,
  users,
  warehouses,
} from '../../db/schema.ts';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../lib/errors.ts';
import { sanitizeCsvCell, sanitizeUrlHref, validateSafePublicUrl } from '../../lib/security.ts';
import { recordAuditLog } from '../audit.ts';
import { hashPassword, type RoleCode } from '../auth.ts';
import { requireAuth, requirePermission, requireStaff, type AuthRequest } from '../rbac.ts';
import { dispatchAutomationEvent } from '../services/automationService.ts';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireStaff);

// ============================================================================
// 1. DASHBOARD OVERVIEW, SEARCH & NOTIFICATIONS (TASKS 02.70-02.79)
// ============================================================================

adminRouter.get('/overview', requirePermission('view'), async (_req: AuthRequest, res, next) => {
  try {
    const [orderAggRows, prodCountRows, lowStockRows, recentOrders, recentActivity, unreadNotifications] =
      await Promise.all([
        db.execute(sql`
          SELECT
            COUNT(*)::int AS total_orders,
            COALESCE(SUM(CASE WHEN status NOT IN ('CANCELLED','FAILED_DELIVERY','RETURNED') THEN total_bdt ELSE 0 END), 0)::numeric AS gross_sales_bdt,
            COUNT(*) FILTER (WHERE status = 'PENDING_VERIFICATION')::int AS pending_verification,
            COUNT(*) FILTER (WHERE status IN ('CONFIRMED','PROCESSING','PACKAGING','READY_TO_SHIP'))::int AS active_fulfillment,
            COUNT(*) FILTER (WHERE status = 'DELIVERED')::int AS delivered_orders,
            COUNT(*) FILTER (WHERE status IN ('CANCELLED','FAILED_DELIVERY','RETURNED'))::int AS cancelled_or_returned
          FROM orders
        `),
        db.execute(sql`SELECT COUNT(*)::int AS active_products FROM products WHERE status = 'ACTIVE'`),
        db
          .select({
            inventoryId: inventory.id,
            variantId: productVariants.id,
            sku: productVariants.sku,
            size: productVariants.size,
            colorName: productVariants.colorName,
            onHandQty: inventory.onHandQty,
            reservedQty: inventory.reservedQty,
            lowStockThreshold: inventory.lowStockThreshold,
            productSlug: products.slug,
          })
          .from(inventory)
          .innerJoin(productVariants, eq(inventory.variantId, productVariants.id))
          .innerJoin(products, eq(productVariants.productId, products.id))
          .where(sql`(${inventory.onHandQty} - ${inventory.reservedQty}) <= ${inventory.lowStockThreshold}`)
          .orderBy(asc(sql`${inventory.onHandQty} - ${inventory.reservedQty}`))
          .limit(15),
        db.select().from(orders).orderBy(desc(orders.createdAt)).limit(8),
        db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(12),
        db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(12),
      ]);

    const agg = orderAggRows.rows[0] as Record<string, unknown>;
    const prodAgg = prodCountRows.rows[0] as Record<string, unknown>;

    return res.json({
      success: true,
      data: {
        kpis: {
          totalOrders: Number(agg?.total_orders ?? 0),
          grossSalesBdt: Number(agg?.gross_sales_bdt ?? 0),
          pendingVerification: Number(agg?.pending_verification ?? 0),
          activeFulfillment: Number(agg?.active_fulfillment ?? 0),
          deliveredOrders: Number(agg?.delivered_orders ?? 0),
          cancelledOrReturned: Number(agg?.cancelled_or_returned ?? 0),
          activeProducts: Number(prodAgg?.active_products ?? 0),
          lowStockCount: lowStockRows.length,
        },
        lowStockAlerts: lowStockRows.map((r) => ({
          ...r,
          availableQty: Math.max(0, r.onHandQty - r.reservedQty),
        })),
        recentOrders,
        recentActivity,
        notifications: unreadNotifications,
      },
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/notifications/:id/read', requirePermission('view'), async (req, res, next) => {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, req.params.id));
    return res.json({ success: true, data: { read: true } });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/search', requirePermission('view'), async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    if (!q) {
      return res.json({ success: true, data: { orders: [], products: [], customers: [] } });
    }

    const [allOrders, allTrans, allCust] = await Promise.all([
      db.select().from(orders).orderBy(desc(orders.createdAt)).limit(50),
      db.select().from(productTranslations),
      db.select().from(customers).limit(50),
    ]);

    return res.json({
      success: true,
      data: {
        orders: allOrders
          .filter(
            (o) =>
              o.orderNumber.toLowerCase().includes(q) ||
              o.guestName.toLowerCase().includes(q) ||
              o.guestPhone.includes(q),
          )
          .slice(0, 8),
        products: allTrans
          .filter((t) => t.name.toLowerCase().includes(q))
          .slice(0, 8),
        customers: allCust
          .filter((c) => c.fullName.toLowerCase().includes(q) || c.phone.includes(q))
          .slice(0, 8),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 2. CATEGORIES & SUBCATEGORIES (TASKS 02.84, 02.85)
// ============================================================================

adminRouter.get('/categories', requirePermission('view'), async (_req, res, next) => {
  try {
    const [cats, trans] = await Promise.all([
      db.select().from(categories).orderBy(asc(categories.sortOrder)),
      db.select().from(categoryTranslations),
    ]);
    const list = cats.map((c) => ({
      ...c,
      en: trans.find((t) => t.categoryId === c.id && t.locale === 'en') ?? null,
      bn: trans.find((t) => t.categoryId === c.id && t.locale === 'bn') ?? null,
    }));
    return res.json({ success: true, data: { categories: list } });
  } catch (err) {
    next(err);
  }
});

const categoryUpsertSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  slug: z.string().trim().min(2).max(80),
  nameEn: z.string().trim().min(2).max(100),
  nameBn: z.string().trim().min(2).max(100),
  descriptionEn: z.string().trim().optional(),
  descriptionBn: z.string().trim().optional(),
  isActive: z.boolean().default(true),
  isReturnableByHygiene: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

adminRouter.post('/categories', requirePermission('create'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = categoryUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid category payload.', undefined, req.requestId);
    }

    const created = await db.transaction(async (tx) => {
      const [cat] = await tx
        .insert(categories)
        .values({
          parentId: parsed.data.parentId ?? null,
          slug: parsed.data.slug.toLowerCase(),
          isActive: parsed.data.isActive,
          isReturnableByHygiene: parsed.data.isReturnableByHygiene,
          sortOrder: parsed.data.sortOrder,
        })
        .returning();

      await tx.insert(categoryTranslations).values([
        {
          categoryId: cat.id,
          locale: 'en',
          name: parsed.data.nameEn,
          description: parsed.data.descriptionEn ?? null,
        },
        {
          categoryId: cat.id,
          locale: 'bn',
          name: parsed.data.nameBn,
          description: parsed.data.descriptionBn ?? null,
        },
      ]);

      return cat;
    });

    return res.status(201).json({ success: true, data: { category: created } });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 3. PRODUCT, VARIANT, PRICE AUDIT & BULK CSV (TASKS 02.80-02.99)
// ============================================================================

adminRouter.get('/products', requirePermission('view'), async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const [prodRows, transRows, variantRows, invRows, imgRows] = await Promise.all([
      db.select().from(products).orderBy(desc(products.createdAt)),
      db.select().from(productTranslations),
      db.select().from(productVariants),
      db.select().from(inventory),
      db.select().from(productImages),
    ]);

    const invMap = new Map(invRows.map((i) => [i.variantId, i]));

    let list = prodRows.map((p) => {
      const en = transRows.find((t) => t.productId === p.id && t.locale === 'en');
      const bn = transRows.find((t) => t.productId === p.id && t.locale === 'bn');
      const vars = variantRows
        .filter((v) => v.productId === p.id)
        .map((v) => {
          const inv = invMap.get(v.id);
          return {
            ...v,
            priceBdt: Number(v.priceBdt),
            onHandQty: inv?.onHandQty ?? 0,
            reservedQty: inv?.reservedQty ?? 0,
            availableQty: inv ? Math.max(0, inv.onHandQty - inv.reservedQty) : 0,
          };
        });
      const imgs = imgRows.filter((i) => i.productId === p.id);
      return {
        ...p,
        basePriceBdt: Number(p.basePriceBdt),
        en,
        bn,
        variants: vars,
        images: imgs,
      };
    });

    if (q) {
      list = list.filter(
        (p) =>
          p.slug.toLowerCase().includes(q) ||
          p.skuPrefix.toLowerCase().includes(q) ||
          (p.en?.name ?? '').toLowerCase().includes(q) ||
          (p.bn?.name ?? '').toLowerCase().includes(q),
      );
    }

    return res.json({ success: true, data: { products: list } });
  } catch (err) {
    next(err);
  }
});

const createProductSchema = z.object({
  categoryId: z.string().uuid(),
  slug: z.string().trim().min(2).max(120),
  skuPrefix: z.string().trim().min(2).max(30),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('ACTIVE'),
  isFeatured: z.boolean().default(false),
  isNewArrival: z.boolean().default(true),
  basePriceBdt: z.number().nonnegative(),
  nameEn: z.string().trim().min(2),
  nameBn: z.string().trim().min(2),
  shortDescriptionEn: z.string().trim().optional(),
  shortDescriptionBn: z.string().trim().optional(),
  descriptionEn: z.string().trim().min(5),
  descriptionBn: z.string().trim().min(5),
  fabricSpecEn: z.string().trim().optional(),
  fabricSpecBn: z.string().trim().optional(),
  careInstructionsEn: z.string().trim().optional(),
  careInstructionsBn: z.string().trim().optional(),
  seoTitleEn: z.string().trim().optional(),
  seoDescriptionEn: z.string().trim().optional(),
  imageUrl: z.string().trim().optional(),
  initialVariant: z.object({
    sku: z.string().trim().min(2),
    size: z.string().trim().min(1),
    colorName: z.string().trim().min(1),
    colorHex: z.string().trim().default('#DEC8BF'),
    priceBdt: z.number().nonnegative(),
    costPriceBdt: z.number().nonnegative().optional(),
    initialStock: z.number().int().min(0).default(0),
  }),
});

adminRouter.post('/products', requirePermission('create'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'Please complete required product, translation, and variant fields.',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        req.requestId,
      );
    }

    const result = await db.transaction(async (tx) => {
      const [prod] = await tx
        .insert(products)
        .values({
          categoryId: parsed.data.categoryId,
          slug: parsed.data.slug.toLowerCase(),
          skuPrefix: parsed.data.skuPrefix.toUpperCase(),
          status: parsed.data.status,
          isFeatured: parsed.data.isFeatured,
          isNewArrival: parsed.data.isNewArrival,
          basePriceBdt: parsed.data.basePriceBdt.toFixed(2),
          fabricSpecEn: parsed.data.fabricSpecEn ?? null,
          fabricSpecBn: parsed.data.fabricSpecBn ?? null,
          careInstructionsEn: parsed.data.careInstructionsEn ?? null,
          careInstructionsBn: parsed.data.careInstructionsBn ?? null,
        })
        .returning();

      await tx.insert(productTranslations).values([
        {
          productId: prod.id,
          locale: 'en',
          name: parsed.data.nameEn,
          shortDescription: parsed.data.shortDescriptionEn ?? null,
          description: parsed.data.descriptionEn,
          seoTitle: parsed.data.seoTitleEn ?? parsed.data.nameEn,
          seoDescription: parsed.data.seoDescriptionEn ?? parsed.data.shortDescriptionEn ?? null,
        },
        {
          productId: prod.id,
          locale: 'bn',
          name: parsed.data.nameBn,
          shortDescription: parsed.data.shortDescriptionBn ?? null,
          description: parsed.data.descriptionBn,
        },
      ]);

      let sanitizedPrimaryImageUrl: string | null = null;
      if (parsed.data.imageUrl) {
        sanitizedPrimaryImageUrl = sanitizeUrlHref(parsed.data.imageUrl);
        if (!sanitizedPrimaryImageUrl) {
          throw new ValidationError('Product image URL must be a safe http(s) or relative path.', undefined, req.requestId);
        }
        await tx.insert(productImages).values({
          productId: prod.id,
          url: sanitizedPrimaryImageUrl,
          altEn: parsed.data.nameEn,
          altBn: parsed.data.nameBn,
          isPrimary: true,
          sortOrder: 0,
        });
      }

      const [variant] = await tx
        .insert(productVariants)
        .values({
          productId: prod.id,
          sku: parsed.data.initialVariant.sku.toUpperCase(),
          size: parsed.data.initialVariant.size,
          colorName: parsed.data.initialVariant.colorName,
          colorHex: parsed.data.initialVariant.colorHex,
          priceBdt: parsed.data.initialVariant.priceBdt.toFixed(2),
          costPriceBdt: parsed.data.initialVariant.costPriceBdt?.toFixed(2) ?? null,
        })
        .returning();

      const [wh] = await tx
        .select()
        .from(warehouses)
        .where(eq(warehouses.isDefault, true))
        .limit(1);

      await tx.insert(inventory).values({
        variantId: variant.id,
        warehouseId: wh?.id ?? null,
        onHandQty: parsed.data.initialVariant.initialStock,
        reservedQty: 0,
        lowStockThreshold: 5,
      });

      if (parsed.data.initialVariant.initialStock > 0) {
        await tx.insert(stockMovements).values({
          variantId: variant.id,
          warehouseId: wh?.id ?? null,
          type: 'STOCK_IN',
          quantityDelta: parsed.data.initialVariant.initialStock,
          balanceAfter: parsed.data.initialVariant.initialStock,
          unitCostBdt: parsed.data.initialVariant.costPriceBdt?.toFixed(2) ?? null,
          referenceType: 'PRODUCT_CREATE',
          referenceId: prod.id,
          reason: 'Initial stock on product creation',
          actorUserId: req.principal!.userId,
        });
      }

      await recordAuditLog(tx, {
        actorUserId: req.principal!.userId,
        actorEmail: req.principal!.email,
        actorRole: req.principal!.roles[0],
        action: 'PRODUCT_CREATED',
        entityType: 'products',
        entityId: prod.id,
        afterState: { slug: prod.slug, sku: variant.sku, priceBdt: variant.priceBdt },
        ipAddress: req.ip,
        requestId: req.requestId || 'unknown',
      });

      return { product: prod, variant };
    });

    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

const updateProductSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  isFeatured: z.boolean().optional(),
  isNewArrival: z.boolean().optional(),
  basePriceBdt: z.number().nonnegative().optional(),
  nameEn: z.string().trim().min(2).optional(),
  nameBn: z.string().trim().min(2).optional(),
  descriptionEn: z.string().trim().min(5).optional(),
  descriptionBn: z.string().trim().min(5).optional(),
  seoTitleEn: z.string().trim().optional(),
  seoDescriptionEn: z.string().trim().optional(),
});

adminRouter.patch('/products/:id', requirePermission('edit'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid product update fields.', undefined, req.requestId);
    }

    const [existing] = await db
      .select()
      .from(products)
      .where(eq(products.id, req.params.id))
      .limit(1);
    if (!existing) {
      throw new NotFoundError('Product', req.requestId);
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(products)
        .set({
          ...(parsed.data.status ? { status: parsed.data.status } : {}),
          ...(parsed.data.isFeatured !== undefined ? { isFeatured: parsed.data.isFeatured } : {}),
          ...(parsed.data.isNewArrival !== undefined ? { isNewArrival: parsed.data.isNewArrival } : {}),
          ...(parsed.data.basePriceBdt !== undefined
            ? { basePriceBdt: parsed.data.basePriceBdt.toFixed(2) }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(products.id, existing.id))
        .returning();

      if (parsed.data.nameEn || parsed.data.descriptionEn || parsed.data.seoTitleEn) {
        await tx
          .update(productTranslations)
          .set({
            ...(parsed.data.nameEn ? { name: parsed.data.nameEn } : {}),
            ...(parsed.data.descriptionEn ? { description: parsed.data.descriptionEn } : {}),
            ...(parsed.data.seoTitleEn ? { seoTitle: parsed.data.seoTitleEn } : {}),
            ...(parsed.data.seoDescriptionEn ? { seoDescription: parsed.data.seoDescriptionEn } : {}),
          })
          .where(
            and(
              eq(productTranslations.productId, existing.id),
              eq(productTranslations.locale, 'en'),
            ),
          );
      }

      if (parsed.data.nameBn || parsed.data.descriptionBn) {
        await tx
          .update(productTranslations)
          .set({
            ...(parsed.data.nameBn ? { name: parsed.data.nameBn } : {}),
            ...(parsed.data.descriptionBn ? { description: parsed.data.descriptionBn } : {}),
          })
          .where(
            and(
              eq(productTranslations.productId, existing.id),
              eq(productTranslations.locale, 'bn'),
            ),
          );
      }

      if (
        parsed.data.basePriceBdt !== undefined &&
        Number(existing.basePriceBdt) !== parsed.data.basePriceBdt
      ) {
        await recordAuditLog(tx, {
          actorUserId: req.principal!.userId,
          actorEmail: req.principal!.email,
          actorRole: req.principal!.roles[0],
          action: 'PRODUCT_PRICE_CHANGED',
          entityType: 'products',
          entityId: existing.id,
          beforeState: { basePriceBdt: existing.basePriceBdt },
          afterState: { basePriceBdt: row.basePriceBdt },
          ipAddress: req.ip,
          requestId: req.requestId || 'unknown',
        });
      }

      return row;
    });

    return res.json({ success: true, data: { product: updated } });
  } catch (err) {
    next(err);
  }
});

const variantPriceSchema = z.object({
  priceBdt: z.number().nonnegative(),
  compareAtPriceBdt: z.number().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
});

adminRouter.patch('/variants/:variantId', requirePermission('edit'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = variantPriceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Valid variant price is required.', undefined, req.requestId);
    }

    const [existing] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, req.params.variantId))
      .limit(1);
    if (!existing) {
      throw new NotFoundError('Variant', req.requestId);
    }

    const [updated] = await db
      .update(productVariants)
      .set({
        priceBdt: parsed.data.priceBdt.toFixed(2),
        ...(parsed.data.compareAtPriceBdt !== undefined
          ? {
              compareAtPriceBdt:
                parsed.data.compareAtPriceBdt !== null
                  ? parsed.data.compareAtPriceBdt.toFixed(2)
                  : null,
            }
          : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(eq(productVariants.id, existing.id))
      .returning();

    await recordAuditLog(db, {
      actorUserId: req.principal!.userId,
      actorEmail: req.principal!.email,
      actorRole: req.principal!.roles[0],
      action: 'VARIANT_PRICE_CHANGED',
      entityType: 'product_variants',
      entityId: existing.id,
      beforeState: { sku: existing.sku, priceBdt: existing.priceBdt },
      afterState: { sku: updated.sku, priceBdt: updated.priceBdt },
      ipAddress: req.ip,
      requestId: req.requestId || 'unknown',
    });

    return res.json({ success: true, data: { variant: updated } });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/products/export', requirePermission('export'), async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        slug: products.slug,
        status: products.status,
        sku: productVariants.sku,
        size: productVariants.size,
        color: productVariants.colorName,
        priceBdt: productVariants.priceBdt,
        onHandQty: inventory.onHandQty,
        reservedQty: inventory.reservedQty,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(inventory, eq(productVariants.id, inventory.variantId));

    const header = 'slug,status,sku,size,color,price_bdt,on_hand_qty,reserved_qty';
    const lines = rows.map(
      (r) =>
        [
          sanitizeCsvCell(r.slug),
          sanitizeCsvCell(r.status),
          sanitizeCsvCell(r.sku),
          sanitizeCsvCell(r.size),
          sanitizeCsvCell(r.color),
          sanitizeCsvCell(r.priceBdt),
          sanitizeCsvCell(r.onHandQty ?? 0),
          sanitizeCsvCell(r.reservedQty ?? 0),
        ].join(','),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="she-valley-products.csv"');
    return res.send([header, ...lines].join('\n'));
  } catch (err) {
    next(err);
  }
});

const addVariantSchema = z.object({
  sku: z.string().trim().min(2).max(40),
  size: z.string().trim().min(1).max(20),
  colorName: z.string().trim().min(1).max(40),
  colorHex: z.string().trim().default('#DEC8BF'),
  priceBdt: z.number().nonnegative(),
  costPriceBdt: z.number().nonnegative().optional(),
  initialStock: z.number().int().min(0).default(0),
});

adminRouter.post('/products/:id/variants', requirePermission('edit'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = addVariantSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid variant details.', undefined, req.requestId);
    }
    const [prod] = await db.select().from(products).where(eq(products.id, req.params.id)).limit(1);
    if (!prod) {
      throw new NotFoundError('Product', req.requestId);
    }

    const created = await db.transaction(async (tx) => {
      const [variant] = await tx
        .insert(productVariants)
        .values({
          productId: prod.id,
          sku: parsed.data.sku.toUpperCase(),
          size: parsed.data.size,
          colorName: parsed.data.colorName,
          colorHex: parsed.data.colorHex,
          priceBdt: parsed.data.priceBdt.toFixed(2),
          costPriceBdt: parsed.data.costPriceBdt?.toFixed(2) ?? null,
        })
        .returning();

      const [wh] = await tx.select().from(warehouses).where(eq(warehouses.isDefault, true)).limit(1);
      await tx.insert(inventory).values({
        variantId: variant.id,
        warehouseId: wh?.id ?? null,
        onHandQty: parsed.data.initialStock,
        reservedQty: 0,
        lowStockThreshold: 5,
      });

      if (parsed.data.initialStock > 0) {
        await tx.insert(stockMovements).values({
          variantId: variant.id,
          warehouseId: wh?.id ?? null,
          type: 'STOCK_IN',
          quantityDelta: parsed.data.initialStock,
          balanceAfter: parsed.data.initialStock,
          unitCostBdt: parsed.data.costPriceBdt?.toFixed(2) ?? null,
          referenceType: 'VARIANT_CREATE',
          referenceId: variant.id,
          reason: 'Initial stock for new variant',
          actorUserId: req.principal!.userId,
        });
      }

      await recordAuditLog(tx, {
        actorUserId: req.principal!.userId,
        actorEmail: req.principal!.email,
        actorRole: req.principal!.roles[0],
        action: 'VARIANT_CREATED',
        entityType: 'product_variants',
        entityId: variant.id,
        afterState: { productId: prod.id, sku: variant.sku, priceBdt: variant.priceBdt },
        ipAddress: req.ip,
        requestId: req.requestId || 'unknown',
      });

      return variant;
    });

    return res.status(201).json({ success: true, data: { variant: created } });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/products/:id/images', requirePermission('edit'), async (req: AuthRequest, res, next) => {
  try {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const url = rawUrl ? sanitizeUrlHref(rawUrl) : null;
    if (!url) {
      throw new ValidationError('A valid safe http(s) or relative image URL is required.', undefined, req.requestId);
    }
    const [prod] = await db.select().from(products).where(eq(products.id, req.params.id)).limit(1);
    if (!prod) {
      throw new NotFoundError('Product', req.requestId);
    }

    const [created] = await db
      .insert(productImages)
      .values({
        productId: prod.id,
        url,
        altEn: typeof req.body?.altEn === 'string' ? req.body.altEn : prod.slug,
        altBn: typeof req.body?.altBn === 'string' ? req.body.altBn : prod.slug,
        isPrimary: Boolean(req.body?.isPrimary),
        sortOrder: Number(req.body?.sortOrder) || 1,
      })
      .returning();

    return res.status(201).json({ success: true, data: { image: created } });
  } catch (err) {
    next(err);
  }
});

const bulkImportSchema = z.object({
  rows: z.array(createProductSchema).min(1).max(50),
});

adminRouter.post('/products/import', requirePermission('create'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = bulkImportSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Provide valid product rows to import.', undefined, req.requestId);
    }

    const importedSlugs: string[] = [];
    await db.transaction(async (tx) => {
      const [wh] = await tx.select().from(warehouses).where(eq(warehouses.isDefault, true)).limit(1);
      for (const row of parsed.data.rows) {
        const [prod] = await tx
          .insert(products)
          .values({
            categoryId: row.categoryId,
            slug: row.slug.toLowerCase(),
            skuPrefix: row.skuPrefix.toUpperCase(),
            status: row.status,
            isFeatured: row.isFeatured,
            isNewArrival: row.isNewArrival,
            basePriceBdt: row.basePriceBdt.toFixed(2),
          })
          .returning();

        await tx.insert(productTranslations).values([
          { productId: prod.id, locale: 'en', name: row.nameEn, description: row.descriptionEn },
          { productId: prod.id, locale: 'bn', name: row.nameBn, description: row.descriptionBn },
        ]);

        const [variant] = await tx
          .insert(productVariants)
          .values({
            productId: prod.id,
            sku: row.initialVariant.sku.toUpperCase(),
            size: row.initialVariant.size,
            colorName: row.initialVariant.colorName,
            colorHex: row.initialVariant.colorHex,
            priceBdt: row.initialVariant.priceBdt.toFixed(2),
          })
          .returning();

        await tx.insert(inventory).values({
          variantId: variant.id,
          warehouseId: wh?.id ?? null,
          onHandQty: row.initialVariant.initialStock,
          reservedQty: 0,
          lowStockThreshold: 5,
        });
        importedSlugs.push(prod.slug);
      }
    });

    return res.status(201).json({ success: true, data: { importedCount: importedSlugs.length, slugs: importedSlugs } });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 4. INVENTORY MANAGEMENT, STOCK MOVEMENTS & VALUATION (TASKS 02.100-02.111)
// ============================================================================

adminRouter.get('/inventory', requirePermission('view'), async (_req, res, next) => {
  try {
    const [rows, movements, sups, whs, purchases] = await Promise.all([
      db
        .select({
          inventoryId: inventory.id,
          variantId: productVariants.id,
          sku: productVariants.sku,
          size: productVariants.size,
          colorName: productVariants.colorName,
          priceBdt: productVariants.priceBdt,
          costPriceBdt: productVariants.costPriceBdt,
          onHandQty: inventory.onHandQty,
          reservedQty: inventory.reservedQty,
          lowStockThreshold: inventory.lowStockThreshold,
          productSlug: products.slug,
        })
        .from(inventory)
        .innerJoin(productVariants, eq(inventory.variantId, productVariants.id))
        .innerJoin(products, eq(productVariants.productId, products.id))
        .orderBy(asc(productVariants.sku)),
      db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt)).limit(40),
      db.select().from(suppliers).orderBy(asc(suppliers.name)),
      db.select().from(warehouses).orderBy(asc(warehouses.code)),
      db.select().from(purchaseRecords).orderBy(desc(purchaseRecords.createdAt)).limit(20),
    ]);

    const items = rows.map((r) => {
      const availableQty = Math.max(0, r.onHandQty - r.reservedQty);
      const unitCost = Number(r.costPriceBdt ?? r.priceBdt ?? 0);
      return {
        ...r,
        priceBdt: Number(r.priceBdt),
        costPriceBdt: unitCost,
        availableQty,
        valuationBdt: r.onHandQty * unitCost,
        stockStatus:
          availableQty === 0
            ? 'OUT_OF_STOCK'
            : availableQty <= r.lowStockThreshold
              ? 'LOW_STOCK'
              : 'IN_STOCK',
      };
    });

    const totalValuationBdt = items.reduce((sum, i) => sum + i.valuationBdt, 0);

    return res.json({
      success: true,
      data: {
        items,
        totalValuationBdt,
        movements,
        suppliers: sups,
        warehouses: whs,
        purchases,
      },
    });
  } catch (err) {
    next(err);
  }
});

const stockAdjustSchema = z.object({
  variantId: z.string().uuid(),
  type: z.enum(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RECONCILIATION']),
  quantityDelta: z.number().int().refine((n) => n !== 0, 'Quantity change cannot be zero.'),
  reason: z.string().trim().min(3).max(250),
});

adminRouter.post('/inventory/adjust', requirePermission('edit'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = stockAdjustSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid inventory adjustment.', undefined, req.requestId);
    }

    const updated = await db.transaction(async (tx) => {
      const locked = await tx.execute(
        sql`SELECT id, on_hand_qty, reserved_qty, low_stock_threshold, warehouse_id FROM inventory WHERE variant_id = ${parsed.data.variantId} FOR UPDATE`,
      );
      const row = locked.rows[0] as
        | {
            id: string;
            on_hand_qty: number;
            reserved_qty: number;
            low_stock_threshold: number;
            warehouse_id: string | null;
          }
        | undefined;
      if (!row) {
        throw new NotFoundError('Inventory record', req.requestId);
      }

      const nextOnHand = Number(row.on_hand_qty) + parsed.data.quantityDelta;
      if (nextOnHand < 0) {
        throw new BusinessRuleError('On-hand stock cannot drop below zero.', undefined, req.requestId);
      }
      if (nextOnHand < Number(row.reserved_qty)) {
        throw new BusinessRuleError(
          `On-hand stock (${nextOnHand}) cannot be lower than reserved stock (${row.reserved_qty}).`,
          undefined,
          req.requestId,
        );
      }

      const [invUpdated] = await tx
        .update(inventory)
        .set({ onHandQty: nextOnHand, updatedAt: new Date() })
        .where(eq(inventory.id, row.id))
        .returning();

      const availableAfter = nextOnHand - Number(row.reserved_qty);

      const [movement] = await tx
        .insert(stockMovements)
        .values({
          variantId: parsed.data.variantId,
          warehouseId: row.warehouse_id,
          type: parsed.data.type,
          quantityDelta: parsed.data.quantityDelta,
          balanceAfter: availableAfter,
          referenceType: 'MANUAL_ADJUSTMENT',
          reason: parsed.data.reason,
          actorUserId: req.principal!.userId,
        })
        .returning();

      if (availableAfter <= Number(row.low_stock_threshold)) {
        await tx.insert(notifications).values({
          title: availableAfter === 0 ? 'Out of Stock Alert' : 'Low Stock Alert',
          message: `Variant ${parsed.data.variantId.slice(0, 8)} now has ${availableAfter} available unit(s).`,
          type: 'LOW_STOCK',
          linkHref: '/admin/inventory',
        });
      }

      await recordAuditLog(tx, {
        actorUserId: req.principal!.userId,
        actorEmail: req.principal!.email,
        actorRole: req.principal!.roles[0],
        action: 'INVENTORY_ADJUSTED',
        entityType: 'inventory',
        entityId: row.id,
        beforeState: { onHandQty: row.on_hand_qty },
        afterState: { onHandQty: nextOnHand, reason: parsed.data.reason },
        ipAddress: req.ip,
        requestId: req.requestId || 'unknown',
      });

      return { inventory: invUpdated, movement };
    });

    return res.status(201).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

const purchaseCreateSchema = z.object({
  supplierId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  referenceNo: z.string().trim().min(2).max(60),
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(5000),
  unitCostBdt: z.number().nonnegative(),
  notes: z.string().trim().max(300).optional(),
});

adminRouter.post('/purchases', requirePermission('create'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = purchaseCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Valid purchase reference, variant, quantity, and cost are required.', undefined, req.requestId);
    }

    const totalCost = parsed.data.quantity * parsed.data.unitCostBdt;
    const result = await db.transaction(async (tx) => {
      const lockedInv = await tx.execute(
        sql`SELECT id, on_hand_qty, reserved_qty, warehouse_id FROM inventory WHERE variant_id = ${parsed.data.variantId} FOR UPDATE`,
      );
      const invRow = lockedInv.rows[0] as
        | { id: string; on_hand_qty: number; reserved_qty: number; warehouse_id: string | null }
        | undefined;
      if (!invRow) {
        throw new NotFoundError('Variant inventory', req.requestId);
      }

      const nextOnHand = Number(invRow.on_hand_qty) + parsed.data.quantity;
      await tx
        .update(inventory)
        .set({ onHandQty: nextOnHand, updatedAt: new Date() })
        .where(eq(inventory.id, invRow.id));

      let resolvedSupplierId = parsed.data.supplierId;
      if (!resolvedSupplierId) {
        const [sup] = await tx.select({ id: suppliers.id }).from(suppliers).limit(1);
        if (sup) {
          resolvedSupplierId = sup.id;
        } else {
          const [createdSup] = await tx
            .insert(suppliers)
            .values({ name: 'Default Mill Supplier', isActive: true })
            .returning();
          resolvedSupplierId = createdSup.id;
        }
      }

      let resolvedWarehouseId = parsed.data.warehouseId ?? invRow.warehouse_id;
      if (!resolvedWarehouseId) {
        const [wh] = await tx.select({ id: warehouses.id }).from(warehouses).limit(1);
        if (!wh) {
          throw new NotFoundError('Warehouse', req.requestId);
        }
        resolvedWarehouseId = wh.id;
      }

      const [purchase] = await tx
        .insert(purchaseRecords)
        .values({
          supplierId: resolvedSupplierId,
          warehouseId: resolvedWarehouseId,
          referenceNo: parsed.data.referenceNo.toUpperCase(),
          totalCostBdt: totalCost.toFixed(2),
          status: 'RECEIVED',
          notes: parsed.data.notes ?? null,
          receivedAt: new Date(),
          createdByUserId: req.principal!.userId,
        })
        .returning();

      await tx.insert(stockMovements).values({
        variantId: parsed.data.variantId,
        warehouseId: resolvedWarehouseId,
        type: 'STOCK_IN',
        quantityDelta: parsed.data.quantity,
        balanceAfter: nextOnHand - Number(invRow.reserved_qty),
        unitCostBdt: parsed.data.unitCostBdt.toFixed(2),
        referenceType: 'PURCHASE',
        referenceId: purchase.id,
        reason: `Purchase receipt ${purchase.referenceNo}`,
        actorUserId: req.principal!.userId,
      });

      return purchase;
    });

    return res.status(201).json({ success: true, data: { purchase: result } });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 5. ORDER MANAGEMENT & IDEMPOTENT STOCK RESTORATION (TASKS 02.112-02.129)
// ============================================================================

const ORDER_STATUSES = [
  'PENDING_VERIFICATION',
  'CONFIRMED',
  'PROCESSING',
  'PACKAGING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'FAILED_DELIVERY',
  'RETURNED',
] as const;

adminRouter.get('/orders', requirePermission('view'), async (req, res, next) => {
  try {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
    const rows = statusFilter
      ? await db
          .select()
          .from(orders)
          .where(eq(orders.status, statusFilter))
          .orderBy(desc(orders.createdAt))
      : await db.select().from(orders).orderBy(desc(orders.createdAt));

    return res.json({ success: true, data: { orders: rows } });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/orders/export', requirePermission('export'), async (_req, res, next) => {
  try {
    const rows = await db.select().from(orders).orderBy(desc(orders.createdAt));
    const header = 'order_number,customer_name,phone,zone,status,payment_method,total_bdt,created_at';
    const lines = rows.map((o) =>
      [
        sanitizeCsvCell(o.orderNumber),
        sanitizeCsvCell(o.guestName),
        sanitizeCsvCell(o.guestPhone),
        sanitizeCsvCell(o.deliveryZone),
        sanitizeCsvCell(o.status),
        sanitizeCsvCell(o.paymentMethod),
        sanitizeCsvCell(o.totalBdt),
        sanitizeCsvCell(o.createdAt.toISOString()),
      ].join(','),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="she-valley-orders.csv"');
    return res.send([header, ...lines].join('\n'));
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/orders/:id', requirePermission('view'), async (req: AuthRequest, res, next) => {
  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, req.params.id)).limit(1);
    if (!order) {
      throw new NotFoundError('Order', req.requestId);
    }
    const [items, history, paymentRows] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
      db
        .select()
        .from(orderStatusHistory)
        .where(eq(orderStatusHistory.orderId, order.id))
        .orderBy(desc(orderStatusHistory.createdAt)),
      db.select().from(payments).where(eq(payments.orderId, order.id)),
    ]);

    return res.json({ success: true, data: { order, items, history, payments: paymentRows } });
  } catch (err) {
    next(err);
  }
});

const orderStatusPatchSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(300).optional(),
  isInternalNote: z.boolean().default(false),
});

adminRouter.patch('/orders/:id/status', requirePermission('approve'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = orderStatusPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid order status update.', undefined, req.requestId);
    }

    const updated = await db.transaction(async (tx) => {
      const lockedOrder = await tx.execute(
        sql`SELECT id, order_number, status, stock_restored, payment_method, payment_status FROM orders WHERE id = ${req.params.id} FOR UPDATE`,
      );
      const current = lockedOrder.rows[0] as
        | {
            id: string;
            order_number: string;
            status: string;
            stock_restored: boolean;
            payment_method: string;
            payment_status: string;
          }
        | undefined;

      if (!current) {
        throw new NotFoundError('Order', req.requestId);
      }

      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, current.id));

      const nextStatus = parsed.data.status;
      const isRestorableStatus =
        nextStatus === 'CANCELLED' || nextStatus === 'FAILED_DELIVERY' || nextStatus === 'RETURNED';
      const wasDelivered = current.status === 'DELIVERED';

      let nextStockRestored = current.stock_restored;

      // Idempotent stock restoration: executes ONLY ONCE per order
      if (isRestorableStatus && !current.stock_restored) {
        for (const item of items) {
          const lockedInv = await tx.execute(
            sql`SELECT id, on_hand_qty, reserved_qty, warehouse_id FROM inventory WHERE variant_id = ${item.variantId} FOR UPDATE`,
          );
          const invRow = lockedInv.rows[0] as
            | { id: string; on_hand_qty: number; reserved_qty: number; warehouse_id: string | null }
            | undefined;
          if (!invRow) {
            continue;
          }

          if (wasDelivered) {
            const nextOnHand = Number(invRow.on_hand_qty) + item.quantity;
            await tx
              .update(inventory)
              .set({ onHandQty: nextOnHand, updatedAt: new Date() })
              .where(eq(inventory.id, invRow.id));
            await tx.insert(stockMovements).values({
              variantId: item.variantId,
              warehouseId: invRow.warehouse_id,
              type: 'RETURN',
              quantityDelta: item.quantity,
              balanceAfter: nextOnHand - Number(invRow.reserved_qty),
              referenceType: 'ORDER',
              referenceId: current.id,
              reason: `Returned stock restored for ${current.order_number}`,
              actorUserId: req.principal!.userId,
            });
          } else {
            const nextReserved = Math.max(0, Number(invRow.reserved_qty) - item.quantity);
            await tx
              .update(inventory)
              .set({ reservedQty: nextReserved, updatedAt: new Date() })
              .where(eq(inventory.id, invRow.id));
            await tx.insert(stockMovements).values({
              variantId: item.variantId,
              warehouseId: invRow.warehouse_id,
              type: 'RELEASE',
              quantityDelta: item.quantity,
              balanceAfter: Number(invRow.on_hand_qty) - nextReserved,
              referenceType: 'ORDER',
              referenceId: current.id,
              reason: `Released reserved stock for ${current.order_number} (${nextStatus})`,
              actorUserId: req.principal!.userId,
            });
          }
        }
        nextStockRestored = true;
      }

      // Deduct reserved + on-hand once delivered
      if (nextStatus === 'DELIVERED' && current.status !== 'DELIVERED') {
        for (const item of items) {
          const lockedInv = await tx.execute(
            sql`SELECT id, on_hand_qty, reserved_qty, warehouse_id FROM inventory WHERE variant_id = ${item.variantId} FOR UPDATE`,
          );
          const invRow = lockedInv.rows[0] as
            | { id: string; on_hand_qty: number; reserved_qty: number; warehouse_id: string | null }
            | undefined;
          if (!invRow) {
            continue;
          }
          const nextReserved = Math.max(0, Number(invRow.reserved_qty) - item.quantity);
          const nextOnHand = Math.max(nextReserved, Number(invRow.on_hand_qty) - item.quantity);
          await tx
            .update(inventory)
            .set({ onHandQty: nextOnHand, reservedQty: nextReserved, updatedAt: new Date() })
            .where(eq(inventory.id, invRow.id));
          await tx.insert(stockMovements).values({
            variantId: item.variantId,
            warehouseId: invRow.warehouse_id,
            type: 'SALE',
            quantityDelta: -item.quantity,
            balanceAfter: nextOnHand - nextReserved,
            referenceType: 'ORDER',
            referenceId: current.id,
            reason: `Order ${current.order_number} delivered`,
            actorUserId: req.principal!.userId,
          });
        }
      }

      const nextPaymentStatus =
        nextStatus === 'DELIVERED' && current.payment_method === 'COD'
          ? 'PAID'
          : current.payment_status;

      const [orderUpdated] = await tx
        .update(orders)
        .set({
          status: nextStatus,
          stockRestored: nextStockRestored,
          paymentStatus: nextPaymentStatus,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, current.id))
        .returning();

      if (nextPaymentStatus === 'PAID') {
        await tx
          .update(payments)
          .set({ status: 'PAID', paidAt: new Date(), updatedAt: new Date() })
          .where(eq(payments.orderId, current.id));
      }

      await tx.insert(orderStatusHistory).values({
        orderId: current.id,
        fromStatus: current.status,
        toStatus: nextStatus,
        note: parsed.data.note ?? `Status updated to ${nextStatus}`,
        isInternalNote: parsed.data.isInternalNote,
        actorUserId: req.principal!.userId,
      });

      await recordAuditLog(tx, {
        actorUserId: req.principal!.userId,
        actorEmail: req.principal!.email,
        actorRole: req.principal!.roles[0],
        action: 'ORDER_STATUS_CHANGED',
        entityType: 'orders',
        entityId: current.id,
        beforeState: { status: current.status, stockRestored: current.stock_restored },
        afterState: { status: nextStatus, stockRestored: nextStockRestored },
        ipAddress: req.ip,
        requestId: req.requestId || 'unknown',
      });

      return orderUpdated;
    });

    if (parsed.data.status === 'CONFIRMED') {
      await dispatchAutomationEvent({
        eventType: 'CONFIRMED_ORDER_CUSTOMER_NOTIFY',
        dedupeKey: `confirmed_order_${updated.id}`,
        payload: {
          orderId: updated.id,
          orderNumber: updated.orderNumber,
          customerName: updated.guestName,
          phone: updated.guestPhone,
          totalBdt: updated.totalBdt,
        },
      }).catch(() => undefined);
    } else if (parsed.data.status === 'DELIVERED') {
      await dispatchAutomationEvent({
        eventType: 'DELIVERED_ORDER_FEEDBACK_REQUEST',
        dedupeKey: `delivered_feedback_${updated.id}`,
        payload: {
          orderId: updated.id,
          orderNumber: updated.orderNumber,
          customerName: updated.guestName,
          phone: updated.guestPhone,
        },
      }).catch(() => undefined);
    }

    return res.json({ success: true, data: { order: updated } });
  } catch (err) {
    next(err);
  }
});

// Manual order creation from Admin (Task 02.114)
const manualOrderSchema = z.object({
  customerName: z.string().trim().min(2),
  phone: z.string().trim().regex(BD_PHONE_REGEX),
  division: z.string().trim().min(2),
  district: z.string().trim().min(2),
  upazilaOrArea: z.string().trim().min(2),
  streetAddress: z.string().trim().min(5),
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
});

adminRouter.post('/orders/manual', requirePermission('create'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = manualOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid manual order payload.', undefined, req.requestId);
    }

    const normalizedPhone = normalizeBdPhone(parsed.data.phone);
    const zone = inferDeliveryZone(parsed.data.district, parsed.data.upazilaOrArea);
    const [deliverySettingRow] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, 'delivery_zones'))
      .limit(1);
    const deliveryConfig = (deliverySettingRow?.valueJson as DeliveryChargeConfig) ?? DEFAULT_DELIVERY_CHARGES;

    const order = await db.transaction(async (tx) => {
      const lockedInv = await tx.execute(
        sql`SELECT id, on_hand_qty, reserved_qty, warehouse_id FROM inventory WHERE variant_id = ${parsed.data.variantId} FOR UPDATE`,
      );
      const invRow = lockedInv.rows[0] as
        | { id: string; on_hand_qty: number; reserved_qty: number; warehouse_id: string | null }
        | undefined;
      if (!invRow) {
        throw new NotFoundError('Variant inventory', req.requestId);
      }

      const available = Number(invRow.on_hand_qty) - Number(invRow.reserved_qty);
      if (available < parsed.data.quantity) {
        throw new BusinessRuleError(`Only ${available} unit(s) available.`, undefined, req.requestId);
      }

      const [variant] = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, parsed.data.variantId))
        .limit(1);
      const trans = await tx
        .select()
        .from(productTranslations)
        .where(eq(productTranslations.productId, variant.productId));
      const en = trans.find((t) => t.locale === 'en');
      const bn = trans.find((t) => t.locale === 'bn');

      const unitPrice = Number(variant.priceBdt);
      const subtotal = unitPrice * parsed.data.quantity;
      const deliveryFee = calculateDeliveryFeeBdt(zone, subtotal, deliveryConfig);
      const total = subtotal + deliveryFee;

      await tx
        .update(inventory)
        .set({ reservedQty: Number(invRow.reserved_qty) + parsed.data.quantity, updatedAt: new Date() })
        .where(eq(inventory.id, invRow.id));

      const orderNumber = `SV-M-${Date.now().toString(36).toUpperCase()}`;
      const [createdOrder] = await tx
        .insert(orders)
        .values({
          orderNumber,
          guestName: parsed.data.customerName,
          guestPhone: normalizedPhone,
          shippingAddressSnapshot: {
            recipientName: parsed.data.customerName,
            phone: normalizedPhone,
            division: parsed.data.division,
            district: parsed.data.district,
            upazilaOrArea: parsed.data.upazilaOrArea,
            streetAddress: parsed.data.streetAddress,
          },
          deliveryZone: zone,
          status: 'CONFIRMED',
          paymentMethod: 'COD',
          paymentStatus: 'PENDING',
          subtotalBdt: subtotal.toFixed(2),
          deliveryFeeBdt: deliveryFee.toFixed(2),
          totalBdt: total.toFixed(2),
          assignedStaffUserId: req.principal!.userId,
        })
        .returning();

      await tx.insert(orderItems).values({
        orderId: createdOrder.id,
        variantId: variant.id,
        productNameSnapshotEn: en?.name ?? variant.sku,
        productNameSnapshotBn: bn?.name ?? en?.name ?? variant.sku,
        variantLabelSnapshot: `${variant.size} · ${variant.colorName}`,
        skuSnapshot: variant.sku,
        quantity: parsed.data.quantity,
        unitPriceBdt: unitPrice.toFixed(2),
        lineTotalBdt: subtotal.toFixed(2),
      });

      await tx.insert(orderStatusHistory).values({
        orderId: createdOrder.id,
        fromStatus: null,
        toStatus: 'CONFIRMED',
        note: 'Manual assisted order created by staff',
        actorUserId: req.principal!.userId,
      });

      return createdOrder;
    });

    return res.status(201).json({ success: true, data: { order } });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/orders/:id/notes', requirePermission('edit'), async (req: AuthRequest, res, next) => {
  try {
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (note.length < 2) {
      throw new ValidationError('Note text is required.', undefined, req.requestId);
    }
    const [order] = await db.select().from(orders).where(eq(orders.id, req.params.id)).limit(1);
    if (!order) {
      throw new NotFoundError('Order', req.requestId);
    }

    const [entry] = await db
      .insert(orderStatusHistory)
      .values({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: order.status,
        note,
        isInternalNote: req.body?.isInternalNote !== false,
        actorUserId: req.principal!.userId,
      })
      .returning();

    return res.status(201).json({ success: true, data: { note: entry } });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 6. STAFF & RBAC MANAGEMENT (TASKS 02.130-02.138)
// ============================================================================

adminRouter.get('/staff', requirePermission('manage_users'), async (_req, res, next) => {
  try {
    const [allUsers, allUserRoles, allRoles] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          phone: users.phone,
          fullName: users.fullName,
          status: users.status,
          mfaEnabled: users.mfaEnabled,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt)),
      db.select().from(userRoles),
      db.select().from(roles),
    ]);

    const roleById = new Map(allRoles.map((r) => [r.id, r]));
    const staffList = allUsers
      .map((u) => {
        const assignedRoles = allUserRoles
          .filter((ur) => ur.userId === u.id)
          .map((ur) => roleById.get(ur.roleId))
          .filter((r): r is NonNullable<typeof r> => Boolean(r));
        return { ...u, roles: assignedRoles };
      })
      .filter((u) => u.roles.some((r) => r.code !== 'CUSTOMER'));

    return res.json({ success: true, data: { staff: staffList, roles: allRoles } });
  } catch (err) {
    next(err);
  }
});

const createStaffSchema = z.object({
  fullName: z.string().trim().min(2),
  email: z.string().trim().email().toLowerCase(),
  phone: z.string().trim().regex(BD_PHONE_REGEX).optional(),
  password: z.string().min(8),
  roleCode: z.enum([
    'SUPER_ADMIN',
    'STORE_MANAGER',
    'ORDER_MANAGER',
    'CUSTOMER_SUPPORT',
    'MODERATOR',
    'INVENTORY_STAFF',
    'ACCOUNTANT',
    'MARKETING_MANAGER',
    'CONTENT_MANAGER',
  ]),
  mfaPasscode: z.string().trim().min(4).optional(),
});

adminRouter.post('/staff', requirePermission('manage_users'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = createStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid staff account payload.', undefined, req.requestId);
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);
    if (existing) {
      throw new ConflictError('An account with this email already exists.', req.requestId);
    }

    const [roleRow] = await db
      .select()
      .from(roles)
      .where(eq(roles.code, parsed.data.roleCode))
      .limit(1);
    if (!roleRow) {
      throw new NotFoundError('Role', req.requestId);
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const mfaHash = parsed.data.mfaPasscode ? await hashPassword(parsed.data.mfaPasscode) : null;

    const created = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          email: parsed.data.email,
          phone: parsed.data.phone ? normalizeBdPhone(parsed.data.phone) : null,
          passwordHash,
          fullName: parsed.data.fullName,
          status: 'ACTIVE',
          emailVerified: true,
          mfaEnabled: Boolean(mfaHash),
          mfaPasscodeHash: mfaHash,
        })
        .returning({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          status: users.status,
          mfaEnabled: users.mfaEnabled,
        });

      await tx.insert(userRoles).values({
        userId: u.id,
        roleId: roleRow.id,
        assignedByUserId: req.principal!.userId,
      });

      await recordAuditLog(tx, {
        actorUserId: req.principal!.userId,
        actorEmail: req.principal!.email,
        actorRole: req.principal!.roles[0],
        action: 'STAFF_CREATED',
        entityType: 'users',
        entityId: u.id,
        afterState: { email: u.email, role: roleRow.code },
        ipAddress: req.ip,
        requestId: req.requestId || 'unknown',
      });

      return u;
    });

    return res.status(201).json({ success: true, data: { staff: created } });
  } catch (err) {
    next(err);
  }
});

const patchStaffSchema = z.object({
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  roleCode: z
    .enum([
      'SUPER_ADMIN',
      'STORE_MANAGER',
      'ORDER_MANAGER',
      'CUSTOMER_SUPPORT',
      'MODERATOR',
      'INVENTORY_STAFF',
      'ACCOUNTANT',
      'MARKETING_MANAGER',
      'CONTENT_MANAGER',
    ])
    .optional(),
});

adminRouter.patch('/staff/:id', requirePermission('manage_users'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = patchStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid staff update.', undefined, req.requestId);
    }

    const [target] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
    if (!target) {
      throw new NotFoundError('Staff member', req.requestId);
    }

    if (target.id === req.principal!.userId && parsed.data.status === 'DISABLED') {
      throw new ForbiddenError('You cannot disable your own active Super Admin account.', req.requestId);
    }

    await db.transaction(async (tx) => {
      if (parsed.data.status) {
        await tx
          .update(users)
          .set({ status: parsed.data.status, updatedAt: new Date() })
          .where(eq(users.id, target.id));

        if (parsed.data.status === 'DISABLED') {
          await tx.delete(sessions).where(eq(sessions.userId, target.id));
        }
      }

      if (parsed.data.roleCode) {
        const [newRole] = await tx
          .select()
          .from(roles)
          .where(eq(roles.code, parsed.data.roleCode as RoleCode))
          .limit(1);
        if (!newRole) {
          throw new NotFoundError('Role', req.requestId);
        }
        await tx.delete(userRoles).where(eq(userRoles.userId, target.id));
        await tx.insert(userRoles).values({
          userId: target.id,
          roleId: newRole.id,
          assignedByUserId: req.principal!.userId,
        });
      }

      await recordAuditLog(tx, {
        actorUserId: req.principal!.userId,
        actorEmail: req.principal!.email,
        actorRole: req.principal!.roles[0],
        action: 'STAFF_UPDATED',
        entityType: 'users',
        entityId: target.id,
        beforeState: { status: target.status },
        afterState: parsed.data,
        ipAddress: req.ip,
        requestId: req.requestId || 'unknown',
      });
    });

    return res.json({ success: true, data: { updated: true } });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/audit-logs', requirePermission('view'), async (_req, res, next) => {
  try {
    const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
    return res.json({ success: true, data: { auditLogs: logs } });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 7. CONTENT, REVIEWS, BANNERS, FAQS, BLOG & SETTINGS (TASKS 02.139-02.145)
// ============================================================================

adminRouter.get('/content', requirePermission('view'), async (_req, res, next) => {
  try {
    const [allBanners, allFaqs, allPosts, allPages, allReviews, allSettings] = await Promise.all([
      db.select().from(banners).orderBy(asc(banners.sortOrder)),
      db.select().from(faqs).orderBy(asc(faqs.sortOrder)),
      db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt)),
      db.select().from(contentPages).orderBy(asc(contentPages.slug)),
      db.select().from(reviews).orderBy(desc(reviews.createdAt)),
      db.select().from(settings),
    ]);
    return res.json({
      success: true,
      data: {
        banners: allBanners,
        faqs: allFaqs,
        blogPosts: allPosts,
        pages: allPages,
        reviews: allReviews,
        settings: allSettings,
      },
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/reviews/:id', requirePermission('approve'), async (req: AuthRequest, res, next) => {
  try {
    const status = req.body?.moderationStatus;
    if (status !== 'APPROVED' && status !== 'REJECTED' && status !== 'PENDING') {
      throw new ValidationError('Invalid moderationStatus.', undefined, req.requestId);
    }
    const [updated] = await db
      .update(reviews)
      .set({ moderationStatus: status })
      .where(eq(reviews.id, req.params.id))
      .returning();
    return res.json({ success: true, data: { review: updated } });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/pages/:slug', requirePermission('edit'), async (req: AuthRequest, res, next) => {
  try {
    const [existing] = await db
      .select()
      .from(contentPages)
      .where(eq(contentPages.slug, req.params.slug))
      .limit(1);
    if (!existing) {
      throw new NotFoundError('Content page', req.requestId);
    }

    const nextOwnerApproved =
      typeof req.body?.ownerApproved === 'boolean' ? req.body.ownerApproved : existing.ownerApproved;
    const nextIsPublished =
      typeof req.body?.isPublished === 'boolean' ? req.body.isPublished : existing.isPublished;

    // Task 02.145: Policy pages MUST remain unpublished until owner explicitly approves
    if (existing.pageType === 'POLICY' && nextIsPublished && !nextOwnerApproved) {
      throw new BusinessRuleError(
        'Policy pages cannot be published until ownerApproved is confirmed.',
        undefined,
        req.requestId,
      );
    }

    const [updated] = await db
      .update(contentPages)
      .set({
        ...(typeof req.body?.titleEn === 'string' ? { titleEn: req.body.titleEn } : {}),
        ...(typeof req.body?.titleBn === 'string' ? { titleBn: req.body.titleBn } : {}),
        ...(typeof req.body?.bodyEn === 'string' ? { bodyEn: req.body.bodyEn } : {}),
        ...(typeof req.body?.bodyBn === 'string' ? { bodyBn: req.body.bodyBn } : {}),
        ownerApproved: nextOwnerApproved,
        isPublished: nextIsPublished,
        updatedByUserId: req.principal!.userId,
        updatedAt: new Date(),
      })
      .where(eq(contentPages.id, existing.id))
      .returning();

    return res.json({ success: true, data: { page: updated } });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/settings/:key', requirePermission('manage_settings'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.body?.valueJson || typeof req.body.valueJson !== 'object') {
      throw new ValidationError('valueJson object is required.', undefined, req.requestId);
    }

    if (req.params.key === 'automation_config') {
      const val = req.body.valueJson as Record<string, unknown>;
      for (const urlField of ['n8nWebhookUrl', 'outboundWebhookUrl'] as const) {
        const raw = val[urlField];
        if (typeof raw === 'string' && raw.trim().length > 0 && !validateSafePublicUrl(raw)) {
          throw new ValidationError(
            `${urlField} must be a valid public http(s) URL (private/loopback/metadata hosts are blocked).`,
            undefined,
            req.requestId,
          );
        }
      }
    }

    const [existing] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, req.params.key))
      .limit(1);

    const [updated] = await db
      .insert(settings)
      .values({
        key: req.params.key,
        valueJson: req.body.valueJson,
        updatedByUserId: req.principal!.userId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          valueJson: req.body.valueJson,
          updatedByUserId: req.principal!.userId,
          updatedAt: new Date(),
        },
      })
      .returning();

    await recordAuditLog(db, {
      actorUserId: req.principal!.userId,
      actorEmail: req.principal!.email,
      actorRole: req.principal!.roles[0],
      action: 'SETTINGS_UPDATED',
      entityType: 'settings',
      entityId: updated.id,
      beforeState: existing?.valueJson ?? null,
      afterState: updated.valueJson,
      ipAddress: req.ip,
      requestId: req.requestId || 'unknown',
    });

    return res.json({ success: true, data: { setting: updated } });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/banners', requirePermission('create'), async (req: AuthRequest, res, next) => {
  try {
    const titleEn = typeof req.body?.titleEn === 'string' ? req.body.titleEn.trim() : '';
    const titleBn = typeof req.body?.titleBn === 'string' ? req.body.titleBn.trim() : '';
    if (!titleEn || !titleBn) {
      throw new ValidationError('titleEn and titleBn are required.', undefined, req.requestId);
    }

    const rawCtaHref = typeof req.body?.ctaHref === 'string' && req.body.ctaHref.trim() ? req.body.ctaHref : '/shop';
    const ctaHref = sanitizeUrlHref(rawCtaHref);
    if (!ctaHref) {
      throw new ValidationError('Banner ctaHref must be a safe URL or relative path.', undefined, req.requestId);
    }

    let imageUrl: string | null = null;
    if (typeof req.body?.imageUrl === 'string' && req.body.imageUrl.trim()) {
      imageUrl = sanitizeUrlHref(req.body.imageUrl);
      if (!imageUrl) {
        throw new ValidationError('Banner imageUrl must be a safe http(s) or relative URL.', undefined, req.requestId);
      }
    }

    const startsAt = req.body?.startsAt ? new Date(String(req.body.startsAt)) : null;
    const endsAt = req.body?.endsAt ? new Date(String(req.body.endsAt)) : null;
    const [created] = await db
      .insert(banners)
      .values({
        placement: req.body?.placement === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT' : 'HERO',
        titleEn,
        titleBn,
        subtitleEn: req.body?.subtitleEn ?? null,
        subtitleBn: req.body?.subtitleBn ?? null,
        ctaLabelEn: req.body?.ctaLabelEn ?? null,
        ctaLabelBn: req.body?.ctaLabelBn ?? null,
        ctaHref,
        imageUrl,
        isActive: req.body?.isActive ?? true,
        startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null,
        endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
      })
      .returning();
    return res.status(201).json({ success: true, data: { banner: created } });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/faqs', requirePermission('create'), async (req: AuthRequest, res, next) => {
  try {
    const { questionEn, questionBn, answerEn, answerBn, category } = req.body ?? {};
    if (!questionEn || !questionBn || !answerEn || !answerBn) {
      throw new ValidationError('Bilingual FAQ question and answer are required.', undefined, req.requestId);
    }
    const [created] = await db
      .insert(faqs)
      .values({
        category: category || 'General',
        questionEn,
        questionBn,
        answerEn,
        answerBn,
        isPublished: true,
      })
      .returning();
    return res.status(201).json({ success: true, data: { faq: created } });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/blog', requirePermission('create'), async (req: AuthRequest, res, next) => {
  try {
    const { slug, titleEn, titleBn, excerptEn, excerptBn, contentEn, contentBn, status } = req.body ?? {};
    if (!slug || !titleEn || !titleBn || !contentEn || !contentBn) {
      throw new ValidationError('Slug and bilingual blog fields are required.', undefined, req.requestId);
    }
    const [created] = await db
      .insert(blogPosts)
      .values({
        slug: String(slug).toLowerCase(),
        titleEn,
        titleBn,
        excerptEn: excerptEn || titleEn,
        excerptBn: excerptBn || titleBn,
        contentEn,
        contentBn,
        status: status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
        authorUserId: req.principal!.userId,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
      })
      .returning();
    return res.status(201).json({ success: true, data: { post: created } });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/banners/:id', requirePermission('edit'), async (req: AuthRequest, res, next) => {
  try {
    const [existing] = await db.select().from(banners).where(eq(banners.id, req.params.id)).limit(1);
    if (!existing) {
      throw new NotFoundError('Banner', req.requestId);
    }
    const [updated] = await db
      .update(banners)
      .set({
        ...(typeof req.body?.isActive === 'boolean' ? { isActive: req.body.isActive } : {}),
        ...(typeof req.body?.titleEn === 'string' ? { titleEn: req.body.titleEn } : {}),
        ...(typeof req.body?.titleBn === 'string' ? { titleBn: req.body.titleBn } : {}),
        ...(req.body?.startsAt !== undefined
          ? { startsAt: req.body.startsAt ? new Date(String(req.body.startsAt)) : null }
          : {}),
        ...(req.body?.endsAt !== undefined
          ? { endsAt: req.body.endsAt ? new Date(String(req.body.endsAt)) : null }
          : {}),
      })
      .where(eq(banners.id, existing.id))
      .returning();
    return res.json({ success: true, data: { banner: updated } });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/staff/me/profile', requirePermission('view'), async (req: AuthRequest, res, next) => {
  try {
    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
    if (fullName.length < 2) {
      throw new ValidationError('Full name is required.', undefined, req.requestId);
    }
    const [updated] = await db
      .update(users)
      .set({ fullName, updatedAt: new Date() })
      .where(eq(users.id, req.principal!.userId))
      .returning({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        preferredLocale: users.preferredLocale,
      });
    return res.json({ success: true, data: { profile: updated } });
  } catch (err) {
    next(err);
  }
});
