import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { DEFAULT_DELIVERY_CHARGES } from '../../config/bangladesh.ts';
import { db } from '../../db/index.ts';
import {
  banners,
  blogPosts,
  categories,
  categoryTranslations,
  contentPages,
  faqs,
  inventory,
  productImages,
  products,
  productTranslations,
  productVariants,
  reviews,
  settings,
} from '../../db/schema.ts';
import { NotFoundError, ValidationError } from '../../lib/errors.ts';
import type { AuthRequest } from '../rbac.ts';

export const storefrontRouter = Router();

async function hydrateProducts(productRows: (typeof products.$inferSelect)[]) {
  if (productRows.length === 0) {
    return [];
  }

  const productIds = productRows.map((p) => p.id);
  const categoryIds = Array.from(new Set(productRows.map((p) => p.categoryId)));

  const [translations, images, variants, catTrans] = await Promise.all([
    db.select().from(productTranslations).where(inArray(productTranslations.productId, productIds)),
    db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(asc(productImages.sortOrder)),
    db.select().from(productVariants).where(inArray(productVariants.productId, productIds)),
    db.select().from(categoryTranslations).where(inArray(categoryTranslations.categoryId, categoryIds)),
  ]);

  const variantIds = variants.map((v) => v.id);
  const invRows =
    variantIds.length > 0
      ? await db.select().from(inventory).where(inArray(inventory.variantId, variantIds))
      : [];
  const invByVariant = new Map(invRows.map((i) => [i.variantId, i]));

  return productRows.map((p) => {
    const pTrans = translations.filter((t) => t.productId === p.id);
    const en = pTrans.find((t) => t.locale === 'en') ?? pTrans[0];
    const bn = pTrans.find((t) => t.locale === 'bn') ?? en;
    const pImages = images.filter((img) => img.productId === p.id);
    const pVariants = variants
      .filter((v) => v.productId === p.id && v.isActive)
      .map((v) => {
        const inv = invByVariant.get(v.id);
        const availableQty = inv ? Math.max(0, inv.onHandQty - inv.reservedQty) : 0;
        return {
          ...v,
          priceBdt: Number(v.priceBdt),
          compareAtPriceBdt: v.compareAtPriceBdt ? Number(v.compareAtPriceBdt) : null,
          availableQty,
          lowStockThreshold: inv?.lowStockThreshold ?? 5,
        };
      });

    const catEn = catTrans.find((c) => c.categoryId === p.categoryId && c.locale === 'en');
    const catBn = catTrans.find((c) => c.categoryId === p.categoryId && c.locale === 'bn');

    return {
      id: p.id,
      slug: p.slug,
      categoryId: p.categoryId,
      categoryName: { en: catEn?.name ?? '', bn: catBn?.name ?? catEn?.name ?? '' },
      skuPrefix: p.skuPrefix,
      brandName: p.brandName,
      status: p.status,
      isFeatured: p.isFeatured,
      isNewArrival: p.isNewArrival,
      basePriceBdt: Number(p.basePriceBdt),
      fabricSpec: { en: p.fabricSpecEn ?? '', bn: p.fabricSpecBn ?? p.fabricSpecEn ?? '' },
      careInstructions: {
        en: p.careInstructionsEn ?? '',
        bn: p.careInstructionsBn ?? p.careInstructionsEn ?? '',
      },
      sizeGuide: p.sizeGuideJson ?? [],
      translations: {
        en: en ?? { name: p.slug, shortDescription: '', description: '', fitNotes: '' },
        bn: bn ?? en ?? { name: p.slug, shortDescription: '', description: '', fitNotes: '' },
      },
      images: pImages,
      variants: pVariants,
      totalAvailableStock: pVariants.reduce((sum, v) => sum + v.availableQty, 0),
    };
  });
}

storefrontRouter.get('/bootstrap', async (_req, res, next) => {
  try {
    const [
      activeBanners,
      activeCats,
      catTrans,
      activeProducts,
      approvedReviews,
      publishedPosts,
      publishedFaqs,
      publishedPages,
      publicSettings,
    ] = await Promise.all([
      db.select().from(banners).where(eq(banners.isActive, true)).orderBy(asc(banners.sortOrder)),
      db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder)),
      db.select().from(categoryTranslations),
      db.select().from(products).where(eq(products.status, 'ACTIVE')).orderBy(desc(products.createdAt)),
      db
        .select()
        .from(reviews)
        .where(eq(reviews.moderationStatus, 'APPROVED'))
        .orderBy(desc(reviews.createdAt))
        .limit(6),
      db
        .select()
        .from(blogPosts)
        .where(eq(blogPosts.status, 'PUBLISHED'))
        .orderBy(desc(blogPosts.publishedAt))
        .limit(4),
      db.select().from(faqs).where(eq(faqs.isPublished, true)).orderBy(asc(faqs.sortOrder)),
      db.select().from(contentPages).where(eq(contentPages.isPublished, true)),
      db.select().from(settings).where(eq(settings.isPublic, true)),
    ]);

    const hydratedProducts = await hydrateProducts(activeProducts);
    const hydratedCategories = activeCats.map((cat) => {
      const en = catTrans.find((t) => t.categoryId === cat.id && t.locale === 'en');
      const bn = catTrans.find((t) => t.categoryId === cat.id && t.locale === 'bn');
      return {
        ...cat,
        translations: {
          en: en ?? { name: cat.slug, description: '' },
          bn: bn ?? en ?? { name: cat.slug, description: '' },
        },
      };
    });

    const now = new Date();
    const scheduledBanners = activeBanners.filter((b) => {
      if (b.startsAt && new Date(b.startsAt) > now) return false;
      if (b.endsAt && new Date(b.endsAt) < now) return false;
      return true;
    });

    const deliverySetting = publicSettings.find((s) => s.key === 'delivery_zones')?.valueJson;
    const storeProfile = publicSettings.find((s) => s.key === 'store_profile')?.valueJson;
    const contactSocial = publicSettings.find((s) => s.key === 'contact_social')?.valueJson;
    const marketingConfig = publicSettings.find((s) => s.key === 'marketing_config')?.valueJson;

    return res.json({
      success: true,
      data: {
        banners: scheduledBanners,
        categories: hydratedCategories,
        featuredProducts: hydratedProducts.filter((p) => p.isFeatured),
        newArrivals: hydratedProducts.filter((p) => p.isNewArrival),
        reviews: approvedReviews,
        blogPosts: publishedPosts,
        faqs: publishedFaqs,
        staticPages: publishedPages,
        deliveryConfig: deliverySetting ?? DEFAULT_DELIVERY_CHARGES,
        storeProfile: storeProfile ?? null,
        contactSocial: contactSocial ?? null,
        marketingConfig: marketingConfig ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

storefrontRouter.get('/products', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const categorySlug = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const sizeFilter = typeof req.query.size === 'string' ? req.query.size.trim().toLowerCase() : '';
    const colorFilter = typeof req.query.color === 'string' ? req.query.color.trim().toLowerCase() : '';
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : 0;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : Number.MAX_SAFE_INTEGER;
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'featured';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 12));

    let categoryIdsFilter: string[] | null = null;
    if (categorySlug) {
      const [cat] = await db
        .select()
        .from(categories)
        .where(and(eq(categories.slug, categorySlug), eq(categories.isActive, true)))
        .limit(1);
      if (cat) {
        const children = await db
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.parentId, cat.id), eq(categories.isActive, true)));
        categoryIdsFilter = [cat.id, ...children.map((c) => c.id)];
      } else {
        categoryIdsFilter = [];
      }
    }

    if (categoryIdsFilter && categoryIdsFilter.length === 0) {
      return res.json({
        success: true,
        data: { products: [] },
        meta: { pagination: { page, limit, total: 0, totalPages: 0 } },
      });
    }

    const baseProducts = categoryIdsFilter
      ? await db
          .select()
          .from(products)
          .where(and(eq(products.status, 'ACTIVE'), inArray(products.categoryId, categoryIdsFilter)))
      : await db.select().from(products).where(eq(products.status, 'ACTIVE'));

    let items = await hydrateProducts(baseProducts);

    if (q) {
      items = items.filter((item) => {
        const haystack = [
          item.translations.en.name,
          item.translations.bn.name,
          item.translations.en.shortDescription,
          item.translations.bn.shortDescription,
          item.skuPrefix,
          item.categoryName.en,
          item.categoryName.bn,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    if (sizeFilter) {
      items = items.filter((item) =>
        item.variants.some((v) => v.size.toLowerCase() === sizeFilter),
      );
    }

    if (colorFilter) {
      items = items.filter((item) =>
        item.variants.some((v) => v.colorName.toLowerCase().includes(colorFilter)),
      );
    }

    items = items.filter(
      (item) => item.basePriceBdt >= minPrice && item.basePriceBdt <= maxPrice,
    );

    if (sort === 'price_asc') {
      items.sort((a, b) => a.basePriceBdt - b.basePriceBdt);
    } else if (sort === 'price_desc') {
      items.sort((a, b) => b.basePriceBdt - a.basePriceBdt);
    } else if (sort === 'newest') {
      items.sort((a, b) => Number(b.isNewArrival) - Number(a.isNewArrival));
    } else {
      items.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
    }

    const total = items.length;
    const totalPages = Math.ceil(total / limit);
    const paged = items.slice((page - 1) * limit, page * limit);

    return res.json({
      success: true,
      data: { products: paged },
      meta: { pagination: { page, limit, total, totalPages } },
    });
  } catch (err) {
    next(err);
  }
});

storefrontRouter.get('/products/:slug', async (req: AuthRequest, res, next) => {
  try {
    const [prod] = await db
      .select()
      .from(products)
      .where(and(eq(products.slug, req.params.slug), eq(products.status, 'ACTIVE')))
      .limit(1);

    if (!prod) {
      throw new NotFoundError('Product', req.requestId);
    }

    const [hydrated] = await hydrateProducts([prod]);
    const prodReviews = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.productId, prod.id), eq(reviews.moderationStatus, 'APPROVED')))
      .orderBy(desc(reviews.createdAt));

    const relatedRaw = await db
      .select()
      .from(products)
      .where(eq(products.status, 'ACTIVE'))
      .limit(5);
    const related = await hydrateProducts(relatedRaw.filter((r) => r.id !== prod.id).slice(0, 3));

    return res.json({
      success: true,
      data: {
        product: hydrated,
        reviews: prodReviews,
        relatedProducts: related,
      },
    });
  } catch (err) {
    next(err);
  }
});

const reviewCreateSchema = z.object({
  authorName: z.string().trim().min(2).max(80),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  comment: z.string().trim().min(5).max(1000),
  fitFeedback: z.enum(['RUNS_SMALL', 'TRUE_TO_SIZE', 'RUNS_LARGE']).default('TRUE_TO_SIZE'),
});

storefrontRouter.post('/products/:slug/reviews', async (req: AuthRequest, res, next) => {
  try {
    const parsed = reviewCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Please complete review rating and comment.', undefined, req.requestId);
    }

    const [prod] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, req.params.slug))
      .limit(1);
    if (!prod) {
      throw new NotFoundError('Product', req.requestId);
    }

    const [created] = await db
      .insert(reviews)
      .values({
        productId: prod.id,
        authorName: parsed.data.authorName,
        rating: parsed.data.rating,
        title: parsed.data.title ?? null,
        comment: parsed.data.comment,
        fitFeedback: parsed.data.fitFeedback,
        moderationStatus: 'PENDING', // Requires Moderator/Admin approval
      })
      .returning();

    return res.status(201).json({
      success: true,
      data: { review: created },
    });
  } catch (err) {
    next(err);
  }
});

storefrontRouter.get('/content/:slug', async (req: AuthRequest, res, next) => {
  try {
    const [page] = await db
      .select()
      .from(contentPages)
      .where(eq(contentPages.slug, req.params.slug))
      .limit(1);

    if (!page || !page.isPublished) {
      throw new NotFoundError('Page', req.requestId);
    }

    return res.json({ success: true, data: { page } });
  } catch (err) {
    next(err);
  }
});

storefrontRouter.get('/blog/:slug', async (req: AuthRequest, res, next) => {
  try {
    const [post] = await db
      .select()
      .from(blogPosts)
      .where(and(eq(blogPosts.slug, req.params.slug), eq(blogPosts.status, 'PUBLISHED')))
      .limit(1);

    if (!post) {
      throw new NotFoundError('Article', req.requestId);
    }

    return res.json({ success: true, data: { post } });
  } catch (err) {
    next(err);
  }
});
