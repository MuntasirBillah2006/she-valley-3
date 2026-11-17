# SHE-VALLEY — Architectural & Project Decisions Log

> Records major architectural, security, database, and scope decisions across Commands 01 and 02.

---

## ADR-001: Preserve Active Vite + React 19 + Tailwind v4 Runtime Alongside Modular Monolith Blueprint
- **Decision:** Keep Vite 8 + React 19 + Express 4 on port `3000` (`server.ts`) with strict domain modular boundaries across `src/features/`, `src/server/`, `src/db/`, `src/config/`, and `src/lib/`.

## ADR-002: Modular Monolith Over Microservices
- **Decision:** Keep all business workflows in one deployable service so checkout, inventory reservation, and audit/stock ledgers run inside single-database ACID transactions.

## ADR-003: Accessible-Premium Visual & Typography Pairing
- **Decision:** Use Warm Ivory (`#F7F1EB`), Deep Burgundy (`#6E1F35`), Charcoal (`#252225`), `Cormorant Garamond`, `Plus Jakarta Sans`, `Noto Sans Bengali`, and `JetBrains Mono` with `tabular-nums`, avoiding pill spam and dark neon gradients.

## ADR-004: Zero-Secret Client Exposure & Structured Safe Errors
- **Decision:** Separate client/server env schemas in `src/config/env.ts`, redact secrets/phones in `src/lib/logger.ts`, and emit correlation `requestId`s instead of stack traces.

## ADR-005: Bilingual & Bangladesh Formatting Architecture
- **Decision:** Enforce 100% key parity between `en.json` and `bn.json`, localized `/en/*` and `/bn/*` URLs, BDT `৳` formatting, `Asia/Dhaka` dates, and Bangladesh Division -> District -> Area delivery zoning.

## ADR-006: Cloud SQL PostgreSQL + Drizzle ORM + Row-Level Locking
- **Context:** Cloud SQL (`asia-southeast1`) was provisioned for Command 02 persistence alongside transactional concurrency requirements.
- **Decision:** Implement 35 relational tables using `drizzle-orm/pg-core` (`src/db/schema.ts`), `pg` connection pooling (`src/db/index.ts`), and explicit `SELECT ... FOR UPDATE` locks inside transactions for checkout, inventory adjustments, and cancellations.
- **Consequences:** Zero overselling under concurrent checkout requests and idempotent inventory restoration on repeated cancellation calls.

## ADR-007: Cookie DB Sessions + Firebase Google Sign-In + Mandatory Admin MFA
- **Context:** Admin accounts manage customer PII, stock, and order statuses while customers expect smooth password or Google Sign-In.
- **Decision:** Use `bcryptjs` password hashing + `sha256`-hashed DB session tokens in HttpOnly cookies, optional Firebase ID token verification for Google Sign-In, and a mandatory MFA verification step (`mfa_verified`) on privileged staff sessions.

## ADR-008: Strict Policy Publication Guard & Command 02 Scope Boundary
- **Context:** Brand legal documents require explicit owner legal approval, and online payment/courier integrations belong to Command 03.
- **Decision:** Enforce `ownerApproved === true` server-side (`422 BusinessRuleError`) before any `POLICY` page can become `isPublished = true`, and restrict Command 02 checkout strictly to Cash on Delivery (COD) while deferring bKash/Nagad/SSLCommerz and courier APIs to Command 03.

## ADR-009: Provider-Independent Payment Adapters & Webhook Authority
- **Decision:** Never collect card PAN/CVV or trust browser redirects. Require HMAC-SHA256 webhook verification (`payment_events.external_event_id` deduplication) or server-side verification calls before marking orders `PAID`, and surface unconfigured gateways honestly as `PENDING_CREDENTIALS`.

## ADR-010: Discreet Courier Metadata & Privacy Standard
- **Decision:** Set `discreetLabel = true` and omit innerwear product names from all booked parcel consignment payloads (`shipments`) across Pathao, Steadfast, REDX, Paperfly, eCourier, and Manual Rider.

## ADR-011: Approval-Gated External Messaging & Automation Dead-Letter Queue
- **Decision:** Prevent unapproved outbound SMS/WhatsApp/Email dispatch (`ownerApprovedExternalDispatch`) and log retries (`maxAttempts = 3`) into explicit `DEAD_LETTER` states across both `notification_logs` and `automation_jobs`.

## ADR-012: Explicit Estimate Disclaimers on Profit Analytics
- **Decision:** Separate confirmed cash/order metrics from *Estimated* COGS, Gross Profit, and Net Profit (which fall back to a documented 55% cost estimate when variant unit costs are unset).

