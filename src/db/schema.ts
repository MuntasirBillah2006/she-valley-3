import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// ============================================================================
// 1. IDENTITY, SESSIONS & RBAC (TASKS 02.04, 02.08, 02.09)
// ============================================================================

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uid: text('uid').unique(), // Firebase Auth UID when linked via Google Sign-In
    email: text('email').notNull().unique(),
    phone: text('phone').unique(),
    passwordHash: text('password_hash'),
    fullName: text('full_name').notNull(),
    preferredLocale: text('preferred_locale').notNull().default('en'),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | DISABLED | PENDING_VERIFICATION
    emailVerified: boolean('email_verified').notNull().default(false),
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    mfaPasscodeHash: text('mfa_passcode_hash'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_users_status').on(t.status)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    mfaVerified: boolean('mfa_verified').notNull().default(false),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_sessions_user_id').on(t.userId), index('idx_sessions_expires_at').on(t.expiresAt)],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_pwd_reset_user').on(t.userId)],
);

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: serial('id').primaryKey(),
    roleId: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: integer('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('uq_role_permission').on(t.roleId, t.permissionId)],
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_user_role').on(t.userId, t.roleId)],
);

// ============================================================================
// 2. CUSTOMERS & ADDRESSES (TASKS 02.04, 02.50, 02.51, 02.60, 02.61)
// ============================================================================

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .unique()
      .references(() => users.id, { onDelete: 'set null' }),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull().unique(),
    email: text('email'),
    segment: text('segment').notNull().default('STANDARD'),
    codRiskFlag: boolean('cod_risk_flag').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_customers_email').on(t.email)],
);

export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    label: text('label').notNull().default('Home'),
    recipientName: text('recipient_name').notNull(),
    phone: text('phone').notNull(),
    division: text('division').notNull(),
    district: text('district').notNull(),
    upazilaOrArea: text('upazila_or_area').notNull(),
    streetAddress: text('street_address').notNull(),
    postalCode: text('postal_code'),
    deliveryZone: text('delivery_zone').notNull(), // DHAKA_METRO | SUB_DHAKA | OUTSIDE_DHAKA
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_addresses_customer').on(t.customerId)],
);

// ============================================================================
// 3. CATEGORIES, PRODUCTS, TRANSLATIONS, VARIANTS & IMAGES (TASKS 02.04, 02.80-02.99)
// ============================================================================

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, { onDelete: 'set null' }),
    slug: text('slug').notNull().unique(),
    imageUrl: text('image_url'),
    isActive: boolean('is_active').notNull().default(true),
    isReturnableByHygiene: boolean('is_returnable_by_hygiene').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    launchPhase: text('launch_phase').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_categories_parent').on(t.parentId), index('idx_categories_active').on(t.isActive)],
);

export const categoryTranslations = pgTable(
  'category_translations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(), // 'en' | 'bn'
    name: text('name').notNull(),
    description: text('description'),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
  },
  (t) => [uniqueIndex('uq_category_locale').on(t.categoryId, t.locale)],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull().unique(),
    skuPrefix: text('sku_prefix').notNull(),
    brandName: text('brand_name').notNull().default('SHE-VALLEY'),
    status: text('status').notNull().default('DRAFT'), // DRAFT | ACTIVE | ARCHIVED
    isFeatured: boolean('is_featured').notNull().default(false),
    isNewArrival: boolean('is_new_arrival').notNull().default(false),
    fabricSpecEn: text('fabric_spec_en'),
    fabricSpecBn: text('fabric_spec_bn'),
    careInstructionsEn: text('care_instructions_en'),
    careInstructionsBn: text('care_instructions_bn'),
    sizeGuideJson: jsonb('size_guide_json'),
    basePriceBdt: numeric('base_price_bdt', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_products_cat_status').on(t.categoryId, t.status),
    index('idx_products_featured').on(t.isFeatured, t.status),
    check('chk_products_base_price', sql`${t.basePriceBdt} >= 0`),
  ],
);

export const productTranslations = pgTable(
  'product_translations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(), // 'en' | 'bn'
    name: text('name').notNull(),
    shortDescription: text('short_description'),
    description: text('description').notNull(),
    fitNotes: text('fit_notes'),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
  },
  (t) => [uniqueIndex('uq_product_locale').on(t.productId, t.locale)],
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull().unique(),
    size: text('size').notNull(),
    colorName: text('color_name').notNull(),
    colorHex: text('color_hex').notNull().default('#DEC8BF'),
    packSize: integer('pack_size').notNull().default(1),
    priceBdt: numeric('price_bdt', { precision: 12, scale: 2 }).notNull(),
    compareAtPriceBdt: numeric('compare_at_price_bdt', { precision: 12, scale: 2 }),
    costPriceBdt: numeric('cost_price_bdt', { precision: 12, scale: 2 }),
    weightGrams: integer('weight_grams').notNull().default(120),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_variants_product').on(t.productId),
    check('chk_variants_price', sql`${t.priceBdt} >= 0`),
    check('chk_variants_pack', sql`${t.packSize} >= 1`),
  ],
);

export const productImages = pgTable(
  'product_images',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
    url: text('url').notNull(),
    altEn: text('alt_en'),
    altBn: text('alt_bn'),
    sortOrder: integer('sort_order').notNull().default(0),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_product_images_product').on(t.productId)],
);

// ============================================================================
// 4. WAREHOUSES, SUPPLIERS, INVENTORY & STOCK MOVEMENTS (TASKS 02.100-02.111)
// ============================================================================

export const warehouses = pgTable('warehouses', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  address: text('address'),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const suppliers = pgTable('suppliers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  contactPerson: text('contact_person'),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseRecords = pgTable(
  'purchase_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    referenceNo: text('reference_no').notNull().unique(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('RECEIVED'), // DRAFT | RECEIVED | CANCELLED
    totalCostBdt: numeric('total_cost_bdt', { precision: 12, scale: 2 }).notNull().default('0'),
    notes: text('notes'),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_purchase_supplier').on(t.supplierId)],
);

export const inventory = pgTable(
  'inventory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    variantId: uuid('variant_id')
      .notNull()
      .unique()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    warehouseId: uuid('warehouse_id').references(() => warehouses.id, { onDelete: 'set null' }),
    onHandQty: integer('on_hand_qty').notNull().default(0),
    reservedQty: integer('reserved_qty').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('chk_inventory_on_hand', sql`${t.onHandQty} >= 0`),
    check('chk_inventory_reserved', sql`${t.reservedQty} >= 0`),
    check('chk_inventory_reserved_lte_on_hand', sql`${t.reservedQty} <= ${t.onHandQty}`),
  ],
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    warehouseId: uuid('warehouse_id').references(() => warehouses.id, { onDelete: 'set null' }),
    type: text('type').notNull(), // STOCK_IN | STOCK_OUT | RESERVE | RELEASE | SALE | RETURN | ADJUSTMENT | RECONCILIATION
    quantityDelta: integer('quantity_delta').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    unitCostBdt: numeric('unit_cost_bdt', { precision: 12, scale: 2 }),
    referenceType: text('reference_type'),
    referenceId: text('reference_id'),
    reason: text('reason').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_stock_movements_variant_time').on(t.variantId, t.createdAt)],
);

// ============================================================================
// 5. CARTS, WISHLISTS, ORDERS, STATUS HISTORY & PAYMENTS (TASKS 02.41-02.66, 02.112-02.129)
// ============================================================================

export const carts = pgTable(
  'carts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
    sessionToken: text('session_token').unique(),
    locale: text('locale').notNull().default('en'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_carts_customer').on(t.customerId)],
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    unitPriceSnapshotBdt: numeric('unit_price_snapshot_bdt', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_cart_variant').on(t.cartId, t.variantId),
    check('chk_cart_item_qty', sql`${t.quantity} > 0`),
  ],
);

export const wishlists = pgTable(
  'wishlists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_wishlist_user_product').on(t.userId, t.productId)],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderNumber: text('order_number').notNull().unique(),
    idempotencyKey: text('idempotency_key').unique(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    guestName: text('guest_name').notNull(),
    guestPhone: text('guest_phone').notNull(),
    guestEmail: text('guest_email'),
    shippingAddressSnapshot: jsonb('shipping_address_snapshot').notNull(),
    deliveryZone: text('delivery_zone').notNull(),
    status: text('status').notNull().default('PENDING_VERIFICATION'),
    paymentMethod: text('payment_method').notNull().default('COD'),
    paymentStatus: text('payment_status').notNull().default('PENDING'),
    subtotalBdt: numeric('subtotal_bdt', { precision: 12, scale: 2 }).notNull(),
    deliveryFeeBdt: numeric('delivery_fee_bdt', { precision: 12, scale: 2 }).notNull(),
    discountBdt: numeric('discount_bdt', { precision: 12, scale: 2 }).notNull().default('0'),
    totalBdt: numeric('total_bdt', { precision: 12, scale: 2 }).notNull(),
    isDiscreetPackaging: boolean('is_discreet_packaging').notNull().default(true),
    stockRestored: boolean('stock_restored').notNull().default(false),
    customerNote: text('customer_note'),
    assignedStaffUserId: uuid('assigned_staff_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_orders_status_created').on(t.status, t.createdAt),
    index('idx_orders_customer_created').on(t.customerId, t.createdAt),
    index('idx_orders_guest_phone').on(t.guestPhone, t.orderNumber),
    check('chk_orders_total_non_negative', sql`${t.totalBdt} >= 0`),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    productNameSnapshotEn: text('product_name_snapshot_en').notNull(),
    productNameSnapshotBn: text('product_name_snapshot_bn').notNull(),
    variantLabelSnapshot: text('variant_label_snapshot').notNull(),
    skuSnapshot: text('sku_snapshot').notNull(),
    quantity: integer('quantity').notNull(),
    unitPriceBdt: numeric('unit_price_bdt', { precision: 12, scale: 2 }).notNull(),
    lineTotalBdt: numeric('line_total_bdt', { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [index('idx_order_items_order').on(t.orderId), check('chk_order_item_qty', sql`${t.quantity} > 0`)],
);

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    note: text('note'),
    isInternalNote: boolean('is_internal_note').notNull().default(false),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_order_history_order').on(t.orderId, t.createdAt)],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('COD'), // COD | BKASH | NAGAD | SSLCOMMERZ | CARD_GATEWAY
    transactionRef: text('transaction_ref'),
    amountBdt: numeric('amount_bdt', { precision: 12, scale: 2 }).notNull(),
    gatewayFeeBdt: numeric('gateway_fee_bdt', { precision: 12, scale: 2 }).notNull().default('0'),
    netAmountBdt: numeric('net_amount_bdt', { precision: 12, scale: 2 }),
    status: text('status').notNull().default('PENDING'), // PENDING | INITIATED | AUTHORIZED | PAID | FAILED | REFUNDED | PARTIALLY_REFUNDED
    idempotencyKey: text('idempotency_key').notNull().unique(),
    verifiedServerSide: boolean('verified_server_side').notNull().default(false),
    webhookVerified: boolean('webhook_verified').notNull().default(false),
    failureReason: text('failure_reason'),
    gatewayPayload: jsonb('gateway_payload'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_payments_order').on(t.orderId), index('idx_payments_provider_status').on(t.provider, t.status)],
);

// ============================================================================
// 6. REVIEWS, CMS, NOTIFICATIONS, AUDIT LOGS & SETTINGS (TASKS 02.10, 02.139-02.145)
// ============================================================================

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    authorName: text('author_name').notNull(),
    rating: integer('rating').notNull(),
    title: text('title'),
    comment: text('comment').notNull(),
    fitFeedback: text('fit_feedback').notNull().default('TRUE_TO_SIZE'),
    moderationStatus: text('moderation_status').notNull().default('APPROVED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_reviews_product_status').on(t.productId, t.moderationStatus),
    check('chk_review_rating', sql`${t.rating} >= 1 AND ${t.rating} <= 5`),
  ],
);

export const banners = pgTable('banners', {
  id: uuid('id').defaultRandom().primaryKey(),
  placement: text('placement').notNull().default('HERO'), // HERO | ANNOUNCEMENT | PROMO
  titleEn: text('title_en').notNull(),
  titleBn: text('title_bn').notNull(),
  subtitleEn: text('subtitle_en'),
  subtitleBn: text('subtitle_bn'),
  ctaLabelEn: text('cta_label_en'),
  ctaLabelBn: text('cta_label_bn'),
  ctaHref: text('cta_href'),
  imageUrl: text('image_url'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const blogPosts = pgTable('blog_posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  titleEn: text('title_en').notNull(),
  titleBn: text('title_bn').notNull(),
  excerptEn: text('excerpt_en').notNull(),
  excerptBn: text('excerpt_bn').notNull(),
  contentEn: text('content_en').notNull(),
  contentBn: text('content_bn').notNull(),
  coverImageUrl: text('cover_image_url'),
  status: text('status').notNull().default('DRAFT'), // DRAFT | PUBLISHED
  authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const faqs = pgTable('faqs', {
  id: uuid('id').defaultRandom().primaryKey(),
  category: text('category').notNull().default('General'),
  questionEn: text('question_en').notNull(),
  questionBn: text('question_bn').notNull(),
  answerEn: text('answer_en').notNull(),
  answerBn: text('answer_bn').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isPublished: boolean('is_published').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contentPages = pgTable('content_pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(), // about | contact | privacy-policy | return-policy | shipping-policy | terms
  pageType: text('page_type').notNull().default('STATIC'), // STATIC | POLICY
  titleEn: text('title_en').notNull(),
  titleBn: text('title_bn').notNull(),
  bodyEn: text('body_en').notNull(),
  bodyBn: text('body_bn').notNull(),
  isPublished: boolean('is_published').notNull().default(false),
  ownerApproved: boolean('owner_approved').notNull().default(false),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    message: text('message').notNull(),
    type: text('type').notNull().default('INFO'), // INFO | LOW_STOCK | ORDER | SYSTEM
    isRead: boolean('is_read').notNull().default(false),
    linkHref: text('link_href'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_notifications_user_read').on(t.userId, t.isRead)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorEmail: text('actor_email'),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    beforeState: jsonb('before_state'),
    afterState: jsonb('after_state'),
    ipAddress: text('ip_address'),
    requestId: text('request_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_audit_entity_time').on(t.entityType, t.entityId, t.createdAt)],
);

export const settings = pgTable('settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  group: text('group').notNull().default('GENERAL'),
  valueJson: jsonb('value_json').notNull(),
  isPublic: boolean('is_public').notNull().default(false),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// 7. COMMAND 03 — PAYMENTS, REFUNDS, COURIERS, INBOX, CRM, AUTOMATION & FINANCE
// ============================================================================

export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    eventType: text('event_type').notNull(),
    externalEventId: text('external_event_id').notNull().unique(),
    signatureValid: boolean('signature_valid').notNull().default(false),
    rawPayload: jsonb('raw_payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_payment_events_payment').on(t.paymentId)],
);

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    amountBdt: numeric('amount_bdt', { precision: 12, scale: 2 }).notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('PENDING'), // PENDING | APPROVED | PROCESSED | REJECTED
    refundRef: text('refund_ref'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_refunds_order').on(t.orderId), check('chk_refund_amount', sql`${t.amountBdt} > 0`)],
);

export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // PATHAO | STEADFAST | REDX | PAPERFLY | ECOURIER | MANUAL
    consignmentId: text('consignment_id').unique(),
    trackingCode: text('tracking_code'),
    status: text('status').notNull().default('PENDING_BOOKING'),
    codAmountToCollectBdt: numeric('cod_amount_to_collect_bdt', { precision: 12, scale: 2 }).notNull().default('0'),
    codCollectedBdt: numeric('cod_collected_bdt', { precision: 12, scale: 2 }).notNull().default('0'),
    deliveryChargeBdt: numeric('delivery_charge_bdt', { precision: 12, scale: 2 }).notNull().default('0'),
    codSettled: boolean('cod_settled').notNull().default(false),
    discreetLabel: boolean('discreet_label').notNull().default(true),
    connectionMode: text('connection_mode').notNull().default('SANDBOX'), // LIVE | SANDBOX | MANUAL
    rawTrackingEvents: jsonb('raw_tracking_events'),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_shipments_order').on(t.orderId), index('idx_shipments_provider_status').on(t.provider, t.status)],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channel: text('channel').notNull().default('WEB_CONTACT'), // WEB_CONTACT | WHATSAPP | MESSENGER | INSTAGRAM | EMAIL
    externalThreadId: text('external_thread_id'),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    guestName: text('guest_name').notNull(),
    guestPhone: text('guest_phone'),
    guestEmail: text('guest_email'),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    subject: text('subject').notNull(),
    status: text('status').notNull().default('OPEN'), // OPEN | IN_PROGRESS | WAITING_CUSTOMER | RESOLVED | CLOSED
    priority: text('priority').notNull().default('MEDIUM'), // LOW | MEDIUM | HIGH | URGENT
    category: text('category').notNull().default('GENERAL'), // GENERAL | SIZING | ORDER_INQUIRY | COMPLAINT | RETURN_EXCHANGE
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_conversations_status_priority').on(t.status, t.priority),
    index('idx_conversations_customer').on(t.customerId),
  ],
);

export const conversationMessages = pgTable(
  'conversation_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderType: text('sender_type').notNull().default('CUSTOMER'), // CUSTOMER | STAFF | SYSTEM
    senderUserId: uuid('sender_user_id').references(() => users.id, { onDelete: 'set null' }),
    senderName: text('sender_name').notNull(),
    body: text('body').notNull(),
    isInternalNote: boolean('is_internal_note').notNull().default(false),
    deliveryStatus: text('delivery_status').notNull().default('LOCAL'), // LOCAL | QUEUED | SENT | DELIVERED | READ | FAILED
    externalMessageId: text('external_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_conv_messages_conv').on(t.conversationId, t.createdAt)],
);

export const customerTags = pgTable(
  'customer_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_customer_tag').on(t.customerId, t.tag)],
);

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticketNumber: text('ticket_number').notNull().unique(),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    contactPhone: text('contact_phone'),
    category: text('category').notNull().default('GENERAL'), // GENERAL | COMPLAINT | RETURN_EXCHANGE | SIZING | DELIVERY
    priority: text('priority').notNull().default('MEDIUM'),
    status: text('status').notNull().default('OPEN'),
    resolutionSummary: text('resolution_summary'),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_tickets_status_priority').on(t.status, t.priority)],
);

export const notificationLogs = pgTable(
  'notification_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channel: text('channel').notNull(), // EMAIL | SMS | WHATSAPP | IN_APP
    templateKey: text('template_key').notNull(),
    recipient: text('recipient').notNull(),
    subject: text('subject'),
    body: text('body').notNull(),
    status: text('status').notNull().default('QUEUED'), // QUEUED | WAITING_APPROVAL | MOCK_SENT | SENT | FAILED | DEAD_LETTER
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    errorMessage: text('error_message'),
    referenceType: text('reference_type'),
    referenceId: text('reference_id'),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_notification_logs_status').on(t.status, t.createdAt)],
);

export const automationJobs = pgTable(
  'automation_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventType: text('event_type').notNull(),
    workflowKey: text('workflow_key').notNull(),
    dedupeKey: text('dedupe_key').notNull().unique(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('PENDING'), // PENDING | WAITING_APPROVAL | RUNNING | COMPLETED | FAILED | DEAD_LETTER
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastError: text('last_error'),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_automation_jobs_status').on(t.status, t.scheduledFor)],
);

export const marketingEvents = pgTable(
  'marketing_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: text('event_id').notNull().unique(), // Used for Meta Pixel / CAPI / GA4 deduplication
    eventName: text('event_name').notNull(), // ViewContent | Search | AddToCart | InitiateCheckout | Purchase | Contact | Lead
    source: text('source').notNull().default('CLIENT'), // CLIENT | SERVER_CAPI | BOTH
    valueBdt: numeric('value_bdt', { precision: 12, scale: 2 }),
    currency: text('currency').notNull().default('BDT'),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata'),
    consentGranted: boolean('consent_granted').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_marketing_events_name_time').on(t.eventName, t.createdAt)],
);

export const businessExpenses = pgTable(
  'business_expenses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    category: text('category').notNull().default('OPERATIONS'), // PACKAGING | MARKETING | COURIER_ADJUSTMENT | OPERATIONS | STAFF | OTHER
    title: text('title').notNull(),
    amountBdt: numeric('amount_bdt', { precision: 12, scale: 2 }).notNull(),
    expenseDate: timestamp('expense_date', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_business_expenses_date').on(t.expenseDate), check('chk_expense_amount', sql`${t.amountBdt} >= 0`)],
);
