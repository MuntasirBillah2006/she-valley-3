# SHE-VALLEY — Payment Architecture, COD & Refunds Guide

> **Service:** `src/server/services/paymentService.ts`  
> **Routes:** `/api/v1/payments/*`, `/api/v1/webhooks/payments/:provider`, `/api/v1/admin/payments/*`  
> **Tables:** `payments`, `payment_events`, `refunds`

---

## 1. Security & Integrity Principles

1. **Never Store Card Numbers or CVV:** All online gateway interactions use provider-hosted/redirect initiation references (`transactionRef`, `gatewayPayload`) — zero PAN/CVV fields exist anywhere in the schema or UI.
2. **Never Trust Browser Redirects:** Returning from a gateway URL never marks an order as `PAID`. Only **server-side verification** (`POST /api/v1/payments/verify`) or a **signed webhook** (`POST /api/v1/webhooks/payments/:provider`) transitions `payments.status` and `orders.payment_status` to `PAID`.
3. **Honest Adapter Statuses:**
   - `COD`: `ACTIVE` (default Bangladesh doorstep collection).
   - `BKASH`, `NAGAD`, `SSLCOMMERZ`: Report `PENDING_CREDENTIALS` until merchant secrets (`BKASH_APP_KEY`/`SECRET`, `NAGAD_MERCHANT_ID`/`PRIVATE_KEY`, `SSLCOMMERZ_STORE_ID`/`STORE_PASSWD`) are provisioned; non-production environments permit sandbox flow testing when `sandboxModeEnabled` is true.
   - Live gateway switching requires `liveActivationApprovedByOwner: true` in `settings.payment_config`.

---

## 2. Idempotency & Webhook Deduplication

- **Initiation Idempotency:** `POST /api/v1/payments/initiate` enforces a unique `idempotency_key` on `payments`. Duplicate submissions return HTTP `200` with `deduplicated: true`.
- **HMAC Webhook Verification:** `POST /api/v1/webhooks/payments/:provider` validates `x-shevalley-signature` (HMAC-SHA256 of raw request body against `PAYMENT_WEBHOOK_SECRET`), returning `401` for forged/missing signatures.
- **Duplicate Webhook Prevention:** `payment_events.external_event_id` has a database unique index. Replayed webhooks return `{ deduplicated: true }` without double-crediting or double-firing automation.

---

## 3. COD Reconciliation & RBAC-Guarded Refunds

- **COD Collection:** `POST /api/v1/admin/payments/:id/cod-collect` records cash collected by rider (`collectedAmountBdt`), sets `status = 'PAID'`, updates `orders.payment_status`, and sets `settled_at` when reconciled.
- **Refund Guards:** `POST /api/v1/admin/payments/:id/refunds` requires the `refund` RBAC permission (`SUPER_ADMIN`, `STORE_MANAGER`, `ACCOUNTANT` — denied `403` to `MODERATOR`) and enforces `sum(refunds) <= payment.amount_bdt`, updating statuses to `PARTIALLY_REFUNDED` or `REFUNDED`.
