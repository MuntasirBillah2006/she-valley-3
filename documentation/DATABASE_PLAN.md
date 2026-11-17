# SHE-VALLEY — Database Architecture & Schema Documentation

> **Engine:** Cloud SQL PostgreSQL (`asia-southeast1`)  
> **ORM:** Drizzle ORM (`drizzle-orm/pg-core` + `drizzle-kit`)  
> **Status:** Implemented & Live (`src/db/schema.ts`, 35 tables)  

---

## 1. ORM & Migration Alignment Note

While Command 01 initially drafted a Prisma schema blueprint, Command 02 standardized database persistence on **Drizzle ORM + Cloud SQL PostgreSQL** (`pg` pool in `src/db/index.ts`, Drizzle Kit in `src/db/drizzle.config.ts`) to integrate cleanly with Cloud SQL provisioning and zero-overhead raw `SELECT ... FOR UPDATE` row locking inside TypeScript transactions.

---

## 2. Implemented Schema (`src/db/schema.ts` — 35 Tables)

### 2.1 Identity, Sessions & RBAC (7 Tables)
- **`users`**: `id` (UUID PK), `uid` (Firebase UID, unique), `email` (unique), `phone` (unique), `passwordHash`, `fullName`, `preferredLocale`, `status`, `emailVerified`, `mfaEnabled`, `mfaPasscodeHash`, `lastLoginAt`, timestamps.
- **`sessions`**: `id`, `userId` (FK -> `users`, cascade), `tokenHash` (unique), `mfaVerified`, `ipAddress`, `userAgent`, `expiresAt`, `createdAt`.
- **`password_reset_tokens`**: `id`, `userId` (FK -> `users`, cascade), `tokenHash` (unique), `expiresAt`, `usedAt`, `createdAt`.
- **`roles`**: `id` (serial PK), `code` (unique: `SUPER_ADMIN`, `STORE_MANAGER`, `ORDER_MANAGER`, `CUSTOMER_SUPPORT`, `MODERATOR`, `INVENTORY_STAFF`, `ACCOUNTANT`, `MARKETING_MANAGER`, `CONTENT_MANAGER`, `CUSTOMER`), `name`, `description`, `isSystem`.
- **`permissions`**: `id` (serial PK), `code` (unique: `view`, `create`, `edit`, `delete`, `approve`, `export`, `refund`, `manage_users`, `manage_settings`), `name`, `description`.
- **`role_permissions`**: Unique `(roleId, permissionId)`.
- **`user_roles`**: Unique `(userId, roleId)` with `assignedByUserId`.

### 2.2 Customers & Bangladesh Addressing (2 Tables)
- **`customers`**: `id`, `userId` (unique FK -> `users`, set null), `fullName`, `phone` (unique), `email`, `segment`, `codRiskFlag`, `notes`, timestamps.
- **`addresses`**: `id`, `customerId` (FK -> `customers`, cascade), `label`, `recipientName`, `phone`, `division`, `district`, `upazilaOrArea`, `streetAddress`, `postalCode`, `deliveryZone`, `isDefault`, timestamps.

### 2.3 Catalog, Localization, Variants & Media (6 Tables)
- **`categories`**: `id`, `parentId` (self-FK, set null), `slug` (unique), `imageUrl`, `isActive`, `isReturnableByHygiene`, `sortOrder`, `launchPhase`, timestamps.
- **`category_translations`**: Unique `(categoryId, locale)` for `'en'` / `'bn'` names, descriptions, and SEO fields.
- **`products`**: `id`, `categoryId` (FK -> `categories`, restrict), `slug` (unique), `skuPrefix`, `brandName`, `status`, `isFeatured`, `isNewArrival`, `fabricSpecEn/Bn`, `careInstructionsEn/Bn`, `sizeGuideJson`, `basePriceBdt` (`numeric(12,2)` >= 0), timestamps.
- **`product_translations`**: Unique `(productId, locale)` for `'en'` / `'bn'` title, descriptions, fit notes, and SEO fields.
- **`product_variants`**: `id`, `productId` (cascade), `sku` (unique), `size`, `colorName`, `colorHex`, `packSize` (`>= 1`), `priceBdt` (`>= 0`), `compareAtPriceBdt`, `costPriceBdt`, `weightGrams`, `isActive`, timestamps.
- **`product_images`**: `id`, `productId` (cascade), `variantId` (set null), `url`, `altEn`, `altBn`, `sortOrder`, `isPrimary`.

### 2.4 Warehouses, Suppliers & Immutable Inventory Ledger (5 Tables)
- **`warehouses`**: `id`, `code` (unique), `name`, `address`, `isDefault`, `isActive`.
- **`suppliers`**: `id`, `name`, `contactPerson`, `phone`, `email`, `address`, `notes`, `isActive`.
- **`purchase_records`**: `id`, `referenceNo` (unique), `supplierId` (restrict), `warehouseId` (restrict), `status`, `totalCostBdt`, `notes`, `receivedAt`, `createdByUserId`.
- **`inventory`**: `id`, `variantId` (unique FK -> `product_variants`, cascade), `warehouseId`, `onHandQty`, `reservedQty`, `lowStockThreshold`, `updatedAt`.
  - **Check Constraints:** `on_hand_qty >= 0`, `reserved_qty >= 0`, `reserved_qty <= on_hand_qty`.
- **`stock_movements`**: Append-only ledger recording `STOCK_IN`, `STOCK_OUT`, `RESERVE`, `RELEASE`, `SALE`, `RETURN`, `ADJUSTMENT`, `RECONCILIATION`, `quantityDelta`, `balanceAfter`, `unitCostBdt`, `referenceType`, `referenceId`, `reason`, `actorUserId`, `createdAt`.

### 2.5 Carts, Wishlists, Orders & Payments Foundation (6 Tables)
- **`carts`**: `id`, `customerId` (cascade), `sessionToken` (unique), `locale`, `expiresAt`, timestamps.
- **`cart_items`**: `id`, `cartId` (cascade), `variantId` (cascade), `quantity` (`> 0`), `unitPriceSnapshotBdt`, unique `(cartId, variantId)`.
- **`wishlists`**: `id`, `userId` (cascade), `productId` (cascade), unique `(userId, productId)`.
- **`orders`**: `id`, `orderNumber` (unique `SV-YYYYMMDD-XXXX`), `idempotencyKey` (unique), `customerId`, `userId`, `guestName`, `guestPhone`, `guestEmail`, `shippingAddressSnapshot` (`jsonb`), `deliveryZone`, `status`, `paymentMethod`, `paymentStatus`, `subtotalBdt`, `deliveryFeeBdt`, `discountBdt`, `totalBdt` (`>= 0`), `isDiscreetPackaging` (default `true`), `stockRestored` (default `false`), `customerNote`, `assignedStaffUserId`, timestamps.
- **`order_items`**: Immutable historical line-item price/name snapshots (`productNameSnapshotEn`, `productNameSnapshotBn`, `variantLabelSnapshot`, `skuSnapshot`, `quantity > 0`, `unitPriceBdt`, `lineTotalBdt`).
- **`order_status_history`**: Audit timeline per order (`fromStatus`, `toStatus`, `note`, `isInternalNote`, `actorUserId`, `createdAt`).
- **`payments`**: COD payment foundation + Command 03 gateway columns (`provider`, `transactionRef`, `amountBdt`, `status`, `idempotencyKey` unique, `gatewayPayload`, `paidAt`).

### 2.6 Reviews, CMS, Notifications, Audit Logs & Settings (8 Tables)
- **`reviews`**: `rating` (`1..5` check), `fitFeedback`, `moderationStatus` (`PENDING` | `APPROVED` | `REJECTED`).
- **`banners`**: `HERO` | `ANNOUNCEMENT` | `PROMO` bilingual slots.
- **`blog_posts`**: Bilingual editorial journal articles (`slug` unique, `DRAFT` | `PUBLISHED`).
- **`faqs`**: Bilingual categorized help center entries.
- **`content_pages`**: Static & policy pages (`about`, `contact`, `privacy-policy`, `return-policy`, `shipping-policy`, `terms`) with `isPublished` + `ownerApproved` legal publication guard.
- **`notifications`**: Persistent operational alerts (e.g., `LOW_STOCK`).
- **`audit_logs`**: Immutable append-only audit trail (`actorUserId`, `actorEmail`, `actorRole`, `action`, `entityType`, `entityId`, `beforeState`, `afterState`, `ipAddress`, `requestId`, `createdAt`).
- **`settings`**: Key-value JSONB configuration (`delivery_zones`, `store_profile`).

---

## 3. Concurrency & Integrity Guarantees

1. **Row-Locked Checkout (`SELECT ... FOR UPDATE`):** Checkout locks matching `inventory` rows inside `db.transaction(...)`, verifies `(on_hand_qty - reserved_qty) >= qty`, increments `reserved_qty`, writes `stock_movements` (`RESERVE`), creates `orders` + `order_items` + `payments`, and clears cart items atomically.
2. **Idempotency Deduplication:** `orders.idempotencyKey` unique constraint + pre-transaction lookup ensures retried checkout calls return the existing order (`200`) without deducting stock twice.
3. **Idempotent Cancellation Stock Restore:** Order transitions to `CANCELLED`, `FAILED_DELIVERY`, or `RETURNED` check `orders.stockRestored` under row lock so repeated transitions never double-credit `reserved_qty` or `on_hand_qty`.
