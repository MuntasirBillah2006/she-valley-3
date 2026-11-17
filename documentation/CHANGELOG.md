# Changelog — SHE-VALLEY

## [0.3.0] - 2026-11-16 (Command 03: Business Operations, Payment, Courier, CRM, Social Integration & Automation)
### Added
- **Database Schema (`src/db/schema.ts`):** Added 11 operational tables (46 total tables live on Cloud SQL `asia-southeast1`): `payment_events`, `refunds`, `shipments`, `conversations`, `conversation_messages`, `support_tickets`, `customer_tags`, `notification_logs`, `automation_jobs`, `marketing_events`, and `business_expenses`.
- **Payments & Reconciliation (`paymentService.ts`):** Provider-independent adapters (`COD` Active; `BKASH`, `NAGAD`, `SSLCOMMERZ` Sandbox/Pending Credentials), `Idempotency-Key` initiation, server-side verification, HMAC webhook validation & `externalEventId` deduplication, COD collection reconciliation, RBAC-protected refunds (`refund` perm), and over-refund guards.
- **Courier & Discreet Shipping (`courierService.ts`):** Adapters for Pathao, Steadfast, REDX, Paperfly, eCourier, and Manual Rider; `discreetLabel` omission of innerwear product names; parcel booking, HMAC tracking webhooks, failed/return sync, COD settlement, and provider performance report.
- **Social, Unified Inbox & CRM (`messagingAdapterService.ts`, `operationsRoutes.ts`, `adminOpsRoutes.ts`):** Live WhatsApp (`01828-298143`), Messenger (`https://m.me/SheValley`), Instagram (`@she-valley`), floating WhatsApp CTA, product & order prefilled inquiries, Contact Support Form, customer Support Tickets tab, Meta webhook handler, split-view staff inbox + internal notes, and CRM segmentation (`VIP`, `REPEAT`, `FIRST_TIME`) + tags + retention KPIs.
- **SEO, Marketing & Consent (`seoRoutes.ts`, `SeoHeadManager.tsx`, `marketing.ts`):** Bilingual `/sitemap.xml` (`hreflang`), `/robots.txt`, Product/BreadcrumbList/Organization JSON-LD, Search Console meta verification, consent-gated GA4/GTM/Meta Pixel dataLayer, privacy-first cookie banner, and deduplicated `marketing_events`.
- **Notifications, Automation & Finance (`notificationService.ts`, `automationService.ts`, `financialService.ts`):** 10-workflow deduplicated automation bus, 3-attempt retry + `DEAD_LETTER` queue, approval-gated customer dispatch, signed n8n webhook relay, `business_expenses` ledger, CSV financial export, and explicitly labeled *Estimated* gross/net profit accounting.
- **Admin Console (`AdminFinanceCourierSection.tsx`, `AdminCrmInboxAutomationSection.tsx`, `AdminOrdersStaffContentSection.tsx`, `AdminPortal.tsx`):** Added 5 operational tabs, banner scheduling (`startsAt`/`endsAt`), and live Command 03 settings forms.
- **Tests & Documentation:** Added `tests/command03-integration.test.ts` and `tests/command03-ui.test.tsx`; added 6 Command 03 guides (`INTEGRATION_GUIDE.md`, `AUTOMATION_GUIDE.md`, `PAYMENT_GUIDE.md`, `COURIER_GUIDE.md`, `CRM_GUIDE.md`, `FINANCIAL_REPORTING_GUIDE.md`).

## [0.2.0] - 2026-11-16 (Command 02: Core E-Commerce Website, Database, Auth & Admin System)
### Added
- **Database & Persistence (`src/db/`):** 35 PostgreSQL tables on Cloud SQL (`asia-southeast1`) via Drizzle ORM (`src/db/schema.ts`), `CHECK` constraints, composite indexes, and environment-safe bootstrap (`src/db/seed.ts`).
- **Authentication, RBAC & Audit (`src/server/auth.ts`, `src/server/rbac.ts`, `src/server/audit.ts`):** `bcryptjs` auth, HttpOnly `sv_session` cookies, DB sessions, password reset tokens, Firebase Google Sign-In, Admin MFA gate, 10 roles x 9 permissions enforcement, and immutable `audit_logs`.
- **Backend API (`src/server/routes/*`, `src/server/app.ts`, `server.ts`):** Full `/api/v1/*` routes for storefront, DB cart, row-locked (`FOR UPDATE`) COD checkout with `Idempotency-Key`, guest order tracking, customer account isolation, and complete admin operations.
- **Customer Storefront (`src/features/storefront/*`, `src/features/account/*`):** Bilingual (`/en/*` & `/bn/*`) Home, Shop (filters/sort/pagination), Product Detail (variants, size guide, reviews, wishlist, recently viewed), Slide-over Cart, Bangladesh Division->District->Area COD Checkout, Track Order, Journal, FAQ, Content/Policy pages, and Account Dashboard.
- **Admin Portal (`src/features/admin/*`):** MFA gate, KPI dashboard, low-stock alerts, catalog/variant/price-audit CRUD, bulk JSON import API, CSV exports, inventory adjustments & purchase receipts, order lifecycle & printable invoices, staff RBAC console, review moderation, policy `ownerApproved` publication guard, delivery zone fee settings, and audit log viewer.
- **Tests:** Added live API/concurrency integration suite (`tests/api-integration.test.ts`) and storefront/delivery UI tests (`tests/storefront-ui.test.tsx`); 28/28 tests passing.

## [0.1.0] - 2026-11-16 (Command 01: Project Foundation, Discovery, Architecture & Design System)
### Added
- Complete discovery & planning suite in `documentation/`: `PROJECT_PLAN.md`, `REQUIREMENTS.md`, `SITEMAP.md`, `USER_JOURNEYS.md`, `ARCHITECTURE.md`, `DATABASE_PLAN.md`, `API_PLAN.md`, `DESIGN_SYSTEM.md`, `PROJECT_DECISIONS.md`, `KNOWN_ISSUES.md`, `PROJECT_PROGRESS.md`.
- Brand metadata and bilingual typography setup in `metadata.json`, `index.html`, and `public/favicon.svg`.
- Modular Monolith folder structure (`src/app`, `src/components`, `src/features`, `src/lib`, `src/services`, `src/hooks`, `src/types`, `src/config`, `src/messages`, `tests`, `documentation`).
- Zod environment validation (`src/config/env.ts`), typed error hierarchy (`src/lib/errors.ts`), redacting structured logger (`src/lib/logger.ts`), Design System tokens, 20+ reusable UI primitives, and `en`/`bn` dictionaries.
