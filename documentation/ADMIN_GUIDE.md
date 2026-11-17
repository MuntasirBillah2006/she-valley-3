# SHE-VALLEY — Admin Operations Guide (Command 02)

> Covers `/admin` access, Multi-Factor Authentication (MFA), RBAC permissions, catalog/inventory/order operations, review moderation, and policy publication rules.

---

## 1. Accessing the Admin Console & MFA

1. Navigate to `/en/admin` (or `/bn/admin`).
2. Sign in with an authorized staff email/phone and password (`POST /api/v1/auth/login`).
3. If `mfaEnabled` is true on the staff account (enabled for `SUPER_ADMIN`), the portal prompts for the **6-digit MFA passcode** (`POST /api/v1/auth/mfa/verify`) before any `/api/v1/admin/*` API call is permitted.
4. Customer accounts (`CUSTOMER` role) cannot access `/api/v1/admin/*` and receive `403 FORBIDDEN`.

### Development-Only Seed Accounts (Non-Production Only)
> **Warning:** These credentials are seeded ONLY when `NODE_ENV !== 'production'` for local/staging verification and must never be used in production.

| Role | Email | Password | MFA Passcode |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@shevalley.local` | `SheValleyAdmin!2026` | `246810` |
| **Moderator** | `moderator@shevalley.local` | `SheValleyMod!2026` | *(not required)* |
| **Customer** | `customer@shevalley.local` | `SheValleyCustomer!2026` | *(not required)* |

---

## 2. RBAC Role & Permission Matrix

Permissions are enforced on the Express backend (`requirePermission(...)`) for every admin action:

- **`SUPER_ADMIN`**: `view`, `create`, `edit`, `delete`, `approve`, `export`, `refund`, `manage_users`, `manage_settings`
- **`STORE_MANAGER`**: `view`, `create`, `edit`, `approve`, `export`
- **`ORDER_MANAGER`**: `view`, `edit`, `approve`, `export`
- **`CUSTOMER_SUPPORT`**: `view`, `edit`
- **`MODERATOR`**: `view`, `approve` *(Strictly blocked from managing users, changing store settings, creating/editing products or prices)*
- **`INVENTORY_STAFF`**: `view`, `create`, `edit`
- **`ACCOUNTANT`**: `view`, `export`, `refund`
- **`MARKETING_MANAGER`**: `view`, `create`, `edit`
- **`CONTENT_MANAGER`**: `view`, `create`, `edit`, `approve`

---

## 3. Daily Operations Workflows

### 3.1 Catalog, Variants & Price Audit
- **Products & Categories:** Create categories with bilingual (`en`/`bn`) names and hygiene returnability flags (`isReturnableByHygiene`), then create products with SKU prefixes, bilingual descriptions, and initial default variants.
- **Variant Price Updates:** Updating variant pricing via `PATCH /api/v1/admin/variants/:variantId` writes an immutable `PRODUCT_PRICE_CHANGED` entry to `audit_logs` capturing `beforeState` and `afterState`.
- **Exports & Bulk Import:** Export active catalog CSV via `GET /api/v1/admin/products/export` or bulk import JSON via `POST /api/v1/admin/products/import`.

### 3.2 Warehouse Inventory & Purchase Receipts
- **Adjustments:** Use Inventory -> Adjust Stock (`STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT`, `RECONCILIATION`) with a mandatory reason. Every adjustment locks the `inventory` row (`FOR UPDATE`), prevents negative balances or `reserved_qty > on_hand_qty`, and records an immutable row in `stock_movements` + `audit_logs`.
- **Low-Stock Alerts:** Items where `(on_hand_qty - reserved_qty) <= low_stock_threshold` surface automatically in Overview & Inventory alerts and generate `LOW_STOCK` notifications.
- **Purchase Receipts:** Recording a supplier purchase (`POST /api/v1/admin/purchases`) atomically increments `on_hand_qty`, creates a `purchase_records` entry, and logs `STOCK_IN` cost basis.

### 3.3 Cash-on-Delivery (COD) Order Lifecycle
- **Stages:** `PENDING_VERIFICATION` -> `CONFIRMED` -> `PROCESSING` -> `PACKAGING` -> `READY_TO_SHIP` -> `SHIPPED` -> `DELIVERED` (or `CANCELLED` / `FAILED_DELIVERY` / `RETURNED`).
- **Stock Deduction & Idempotent Restore:**
  - Transitioning to `SHIPPED` or `DELIVERED` finalizes reserved stock (`on_hand_qty -= qty`, `reserved_qty -= qty`) and records a `SALE` movement.
  - Transitioning to `CANCELLED`, `FAILED_DELIVERY`, or `RETURNED` releases reserved stock or restores returned stock **exactly once** using `orders.stock_restored` under row lock.
- **Printable Invoices & Manual Orders:** Generate clean print views from Order Detail and log phone/WhatsApp orders via **Create Manual Order** (`POST /api/v1/admin/orders/manual`).

### 3.4 Review Moderation & Policy Publication Guard
- **Reviews:** Moderators/Managers approve or reject pending product reviews (`PATCH /api/v1/admin/reviews/:id`). Only `APPROVED` reviews appear on storefront product pages.
- **Policy Pages (`privacy-policy`, `return-policy`, `shipping-policy`, `terms`):** Legal policies remain unpublished drafts (`isPublished = false`) by default. Attempting to publish without confirming `ownerApproved = true` is rejected server-side with `422 BUSINESS_RULE_VIOLATION`.

### 3.5 Bangladesh Delivery Zone Settings & Audit Logs
- Super Admins (`manage_settings`) can adjust `DHAKA_METRO`, `SUB_DHAKA`, `OUTSIDE_DHAKA` delivery fees and optional free-delivery threshold via **Settings**, immediately updating Checkout and Storefront bootstrap fees.
- Review security, staff, pricing, stock, and order changes anytime in **Audit Logs** (`/api/v1/admin/audit-logs`).
