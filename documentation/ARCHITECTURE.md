# SHE-VALLEY — Technical Architecture Plan

> **Architecture Style:** Modular Monolith  
> **Active Runtime (Commands 01–03):** Vite 8 + React 19 + TypeScript + Tailwind CSS v4 + Express 4 (`server.ts`, port `3000`)  
> **Persistence & Auth:** Cloud SQL PostgreSQL (`asia-southeast1`, 46 tables) + Drizzle ORM + Firebase Auth + HttpOnly DB Sessions  

---

## 1. Architectural Philosophy: Modular Monolith

SHE-VALLEY uses a **Modular Monolith** so catalog, cart, order placement, inventory reservation, payment verification, courier tracking, and audit/stock ledgers execute inside single-database ACID transactions without distributed saga complexity.

---

## 2. Implemented Stack (Commands 01–03)

- **Frontend SPA:** React 19 + TypeScript + Tailwind CSS v4 (`src/features/storefront/*`, `src/features/account/*`, `src/features/admin/*`). History-API bilingual router (`useRouter.tsx`) serves `/en/*` and `/bn/*` URLs with synced `<title>`, canonical/hreflang `<head>` links, JSON-LD structured data (`SeoHeadManager`), and privacy-first analytics consent.
- **Design System:** Custom editorial tokens in `src/index.css` (`Warm Ivory #F7F1EB`, `Deep Burgundy #6E1F35`, `Charcoal #252225`, `Muted Rose`, `Cormorant Garamond`, `Plus Jakarta Sans`, `Noto Sans Bengali`, `JetBrains Mono`) and accessible reusable primitives in `src/components/`.
- **Backend Server (`server.ts` & `src/server/app.ts`):** Express 4 API mounted at `/api/v1/*` and root SEO endpoints (`/sitemap.xml`, `/robots.txt`) alongside Vite dev middleware in development and `dist/` static serving in production on port `3000`.
- **Database & ORM (`src/db/`):** Cloud SQL PostgreSQL via `pg` + `drizzle-orm` + `drizzle-kit` (46 tables in `src/db/schema.ts`).
- **Authentication & RBAC (`src/server/auth.ts`, `src/server/rbac.ts`):** Cookie-based HttpOnly sessions (`sv_session`), `bcryptjs` hashing, optional Firebase Google Sign-In, mandatory MFA gate (`mfa_verified`) on privileged staff sessions, and 10 roles x 9 permissions.

---

## 3. Domain Module Boundaries

| Domain | Client Modules | Server Modules | Responsibility |
| :--- | :--- | :--- | :--- |
| **Storefront, SEO & Social** | `src/features/storefront/*`, `SeoHeadManager`, `marketing.ts` | `storefrontRoutes.ts`, `seoRoutes.ts`, `operationsRoutes.ts` | Bilingual catalog, JSON-LD, `/sitemap.xml`, `/robots.txt`, WhatsApp/Messenger CTAs, Support Form, consent-gated analytics. |
| **Payments & Accounting** | `CheckoutPage`, `AdminFinanceCourierSection` | `paymentService.ts`, `financialService.ts` | COD + bKash/Nagad/SSLCommerz adapters, HMAC webhooks, COD reconciliation, RBAC refunds, expenses, and estimated profit reporting. |
| **Couriers & Parcels** | `TrackOrderPage`, `AdminFinanceCourierSection` | `courierService.ts`, `operationsRoutes.ts` | Pathao/Steadfast/REDX/Paperfly/eCourier/Manual adapters, discreet parcel labels, tracking sync webhooks, COD settlement. |
| **Inbox, Tickets & CRM** | `AccountDashboardPage`, `AdminCrmInboxAutomationSection` | `messagingAdapterService.ts`, `adminOpsRoutes.ts` | Meta webhooks, split-view unified inbox + internal notes, ticket tracking, CRM segmentation & tags. |
| **Automation & Notifications** | `AdminCrmInboxAutomationSection`, `AdminOrdersStaffContentSection` | `automationService.ts`, `notificationService.ts` | 10-workflow deduplicated event bus, approval gate, retry + dead-letter queue, signed n8n relay, multi-channel templates. |
| **Cart, Checkout & Account** | `CartPage`, `CheckoutPage`, `AuthPages`, `AccountDashboardPage` | `cartOrderRoutes.ts`, `authRoutes.ts`, `accountRoutes.ts` | Persistent DB carts, `FOR UPDATE` checkout, `Idempotency-Key`, customer-isolated orders & tickets. |

---

## 4. Security, Privacy & Discreet Operations Principles

1. **Zero Secret & Card Exposure:** Server credentials stay in server env vars; zero card numbers or CVVs are ever stored; logger redacts secrets and masks phones.
2. **Server-Side Payment Authority:** Browser redirects never mark payments `PAID`; only HMAC-verified webhooks or server-side verification endpoints do.
3. **Discreet Innerwear Labels:** Parcel bookings default to `discreetLabel = true` and omit innerwear item descriptions from outer courier labels.
4. **External Dispatch Guardrails:** Unapproved or unconfigured external SMS/WhatsApp/Email sends stay in `WAITING_APPROVAL` or `MOCK_SENT` mode, preventing accidental real customer messages during dev/testing.

