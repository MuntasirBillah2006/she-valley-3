# SHE-VALLEY — Implemented API Reference (`/api/v1/*`)

> **API Style:** Versioned REST JSON over HTTPS (`/api/v1/*`)  
> **Validation:** Zod strict schemas at every route boundary  
> **Status:** Command 02 Core Endpoints Live & Tested  

---

## 1. Standard Envelopes & Middleware

- **Health Check:** `GET /api/v1/health` -> `{ success: true, data: { status: "ok", service: "she-valley-api", timestamp } }`
- **Success:** `{ success: true, data: { ... }, meta?: { pagination?: { page, limit, total, totalPages } } }`
- **Error:** `{ success: false, error: { code, message, requestId, details? } }`
- **Middleware Stack (`src/server/app.ts`):** Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`), `requestId` correlation, lazy idempotent `ensureSystemBootstrap()`, `cookie-parser`, `attachOptionalAuth`, and `formatApiErrorResponse`.

---

## 2. Implemented Endpoints

### 2.1 Authentication (`/api/v1/auth`)
- `GET /api/v1/auth/me` — Returns current user, roles, permissions, and `mfaVerified` flag.
- `POST /api/v1/auth/register` — Registers a `CUSTOMER` account (with normalized BD phone, hashed password, and customer link).
- `POST /api/v1/auth/login` — Email or BD mobile sign-in; sets `sv_session` HttpOnly cookie; emits `AUTH_LOGIN` / `AUTH_LOGIN_FAILED` audit log; marks `mfaRequired` for privileged staff.
- `POST /api/v1/auth/mfa/verify` — Verifies staff MFA passcode and upgrades the session (`mfaVerified = true`).
- `POST /api/v1/auth/firebase` — Verifies Firebase Google Sign-In ID token and links/creates user session.
- `POST /api/v1/auth/logout` — Revokes DB session and clears cookie.
- `POST /api/v1/auth/password-reset/request` & `POST /api/v1/auth/password-reset/confirm` — Tokenized password reset flow.

### 2.2 Public Storefront & Content (`/api/v1/storefront`)
- `GET /api/v1/storefront/bootstrap` — Returns categories, active banners, FAQs, published journal posts, store profile, and Bangladesh delivery zone fees.
- `GET /api/v1/storefront/products` — Supports `search`, `category`, `size`, `color`, `featured`, `newArrival`, `inStock`, `sort`, `page`, `limit`.
- `GET /api/v1/storefront/products/:slug` — Product detail, variants + stock availability, approved reviews, and related products.
- `POST /api/v1/storefront/products/:slug/reviews` — Submits customer review (`PENDING` or `APPROVED` per moderation rules).
- `GET /api/v1/storefront/content/:slug` — Static & published content pages (returns `404` for unpublished policy drafts until `ownerApproved === true`).
- `GET /api/v1/storefront/blog/:slug` — Published journal article detail.

### 2.3 Cart, COD Checkout & Guest Tracking (`/api/v1`)
- `GET /api/v1/cart` — Hydrates persistent DB cart via `sv_cart_token` header or authenticated customer.
- `POST /api/v1/cart/items` — Adds variant quantity after verifying live `availableQty`.
- `PATCH /api/v1/cart/items/:variantId` — Updates quantity (or removes when `0`).
- `DELETE /api/v1/cart/items/:variantId` — Removes line item.
- `POST /api/v1/orders` — Places COD order (`Idempotency-Key` supported, `FOR UPDATE` row-locked stock reservation, BD phone & area delivery fee calculation, discreet packaging flag, cart clear).
- `POST /api/v1/orders/track` — Rate-limited guest tracking by `orderNumber` + `phone` (masks full street address).

### 2.4 Customer Account (`/api/v1/account` — requires `requireAuth`)
- `GET /api/v1/account/profile`, `PATCH /api/v1/account/profile`
- `GET /api/v1/account/addresses`, `POST /api/v1/account/addresses`, `DELETE /api/v1/account/addresses/:id`
- `GET /api/v1/account/orders`, `GET /api/v1/account/orders/:id` (strict ownership isolation -> `403` otherwise)
- `GET /api/v1/account/wishlist`, `POST /api/v1/account/wishlist`, `DELETE /api/v1/account/wishlist/:productId`
- `GET /api/v1/account/tickets` — Customer support tickets & conversation summaries.

### 2.5 Command 03 Payments, Support, Tracking & SEO (`/api/v1/*` & root SEO)
- **Payments:** `GET /api/v1/payments/methods`, `POST /api/v1/payments/initiate` (`Idempotency-Key` deduplicated), `POST /api/v1/payments/verify` (server-side verification; never trusts browser redirects).
- **Webhooks:** `POST /api/v1/webhooks/payments/:provider` (`x-shevalley-signature` HMAC + `externalEventId` deduplication), `POST /api/v1/webhooks/couriers/:provider`, `GET/POST /api/v1/webhooks/meta` (Meta challenge & HMAC receiver), `POST /api/v1/webhooks/n8n` (signed automation callback).
- **Support & Marketing:** `POST /api/v1/support/contact` (creates ticket + conversation + triggers moderator assignment), `POST /api/v1/marketing/events` (`eventId` deduplication for GA4/Meta Pixel events).
- **Root SEO:** `GET /sitemap.xml` (`en`/`bn`/`x-default` `hreflang`), `GET /robots.txt`.

### 2.6 Admin Operations (`/api/v1/admin` — requires `requireAuth`, `requireStaff`, MFA & RBAC permission)
- **Overview & Search:** `GET /overview`, `GET /search`, `PATCH /notifications/:id/read`, `PATCH /staff/me/profile` (`view`)
- **Catalog & Categories:** `GET /categories` (`view`), `POST /categories` (`create`), `PATCH /categories/:id` (`edit`), `GET /products` (`view`), `POST /products` (`create`), `POST /products/import` (`create`), `PATCH /products/:id` (`edit`), `PATCH /variants/:variantId` (`edit` — logs `PRODUCT_PRICE_CHANGED`), `POST /products/:id/variants` (`edit`), `POST /products/:id/images` (`edit`), `GET /products/export` (`export` CSV)
- **Inventory & Purchasing:** `GET /inventory` (`view`), `POST /inventory/adjust` (`edit`), `POST /purchases` (`create`)
- **Orders:** `GET /orders` (`view`), `GET /orders/export` (`export` CSV), `GET /orders/:id` (`view`), `PATCH /orders/:id/status` (`approve`), `POST /orders/manual` (`create`), `POST /orders/:id/notes` (`edit`)
- **Payments & Financial Accounting:** `GET /payments` (`view`), `POST /payments/:id/cod-collect` (`edit`), `POST /payments/:id/verify-manual` (`approve`), `POST /payments/:id/refunds` (`refund`), `GET /reports/financial` (`export`/`refund`/`manage_settings`), `GET /reports/financial/export` (`export` CSV), `POST /expenses` (`create`/`refund`)
- **Couriers & Parcels:** `GET /couriers` (`view`), `POST /shipments` (`create`), `PATCH /shipments/:id/status` (`edit`), `POST /shipments/:id/settle` (`approve`/`refund`)
- **Inbox, Support Tickets & CRM:** `GET /inbox` (`view`), `POST /inbox/:id/messages` (`edit`/`approve`), `PATCH /inbox/:id` (`edit`/`approve`), `PATCH /tickets/:id` (`edit`/`approve`), `GET /crm/customers` (`view`), `GET /crm/customers/:id` (`view`), `POST /crm/customers/:id/tags` (`edit`/`approve`), `PATCH /crm/customers/:id/notes` (`edit`/`approve`)
- **Automation, Notifications & Analytics:** `GET /automation/jobs` (`view`), `POST /automation/dispatch` (`manage_settings`), `POST /automation/jobs/:id/retry` (`approve`), `GET /notifications/logs` (`view`), `POST /notifications/test` (`manage_settings`), `POST /notifications/:id/retry` (`approve`), `GET /marketing/analytics` (`view`)
- **Staff, Content, Moderation & Settings:** `GET /staff`, `POST /staff`, `PATCH /staff/:id` (`manage_users`), `GET /audit-logs` (`view`), `GET /content` (`view`), `PATCH /reviews/:id` (`approve`), `PATCH /pages/:slug` (`edit`), `POST /banners`, `PATCH /banners/:id` (`startsAt`/`endsAt` scheduling), `POST /faqs`, `POST /blog`, `GET /settings/all`, `PATCH /settings/:key` (`manage_settings`)

