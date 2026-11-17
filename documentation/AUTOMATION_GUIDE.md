# SHE-VALLEY — Automation & Notification Engine Guide

> **Core Services:** `src/server/services/automationService.ts` & `src/server/services/notificationService.ts`  
> **Database Tables:** `automation_jobs`, `notification_logs`, `notifications`, `settings` (`automation_config`, `notification_config`)

---

## 1. 10-Workflow Automation Registry

Every business event dispatches through `dispatchAutomationEvent({ eventType, dedupeKey, payload })`, guaranteeing idempotent execution via the unique `dedupe_key` constraint on `automation_jobs`:

1. `NEW_ORDER_ADMIN_ALERT` — In-app operations alert when a new order is placed.
2. `CONFIRMED_ORDER_CUSTOMER_NOTIFY` — Customer confirmation queue (**Approval Gated** by default).
3. `PAYMENT_SUCCESS_UPDATE` — Synchronizes order payment state upon server-side verification.
4. `LOW_STOCK_ADMIN_ALERT` — Notifies warehouse staff when available stock drops to threshold.
5. `OUT_OF_STOCK_AVAILABILITY_UPDATE` — Flags out-of-stock SKUs for inventory operations.
6. `COURIER_STATUS_ORDER_TIMELINE` — Appends courier webhook milestones to `order_status_history`.
7. `DELIVERED_ORDER_FEEDBACK_REQUEST` — Post-delivery discreet feedback prompt (**Approval Gated**).
8. `NEW_TICKET_MODERATOR_ASSIGN` — Alerts moderators when `POST /api/v1/support/contact` logs a ticket.
9. `FAILED_NOTIFICATION_RETRY` — Tracks retry attempts for failed outbound messages.
10. `FAILED_AUTOMATION_ERROR_LOG` — Records failures and dead-letter transitions after 3 attempts (`max_attempts = 3`).

---

## 2. Retry, Dead-Letter & Approval Safety Gate

- **Waiting Approval (`WAITING_APPROVAL`):** Sensitive customer-facing workflows pause until an authorized admin clicks **Approve & Run** (`POST /api/v1/admin/automation/jobs/:id/retry`) or toggles `ownerApprovedExternalDispatch` in settings.
- **Retry & Dead-Letter:** Failed jobs transition to `FAILED` on attempts `1` and `2`, and `DEAD_LETTER` once `attempts >= maxAttempts (3)`. Operators inspect and retry from Admin → Automation & Alerts.
- **Signed n8n Relay:** When `N8N_WEBHOOK_URL` (or `automation_config.n8nWebhookUrl`) is set, payloads are signed with HMAC-SHA256 in `x-shevalley-signature` (`N8N_WEBHOOK_SECRET`). Inbound n8n callbacks to `POST /api/v1/webhooks/n8n` enforce the same HMAC check (`401` on invalid signature).

---

## 3. Multi-Channel Notification Dispatcher

Supports `IN_APP`, `EMAIL`, `SMS`, and `WHATSAPP` templates (`ORDER_CONFIRMATION`, `SHIPPED_TRACKING`, `DELIVERED_FEEDBACK`, `TICKET_CREATED`):
- Without explicit owner approval (`ownerApprovedExternalDispatch = false`) or live provider credentials, external messages safely log as `MOCK_SENT` (or `WAITING_APPROVAL` when approval is required) — **never sending accidental external SMS/WhatsApp/Emails during automated tests or development**.
- Failed deliveries transition to `FAILED` and after 3 attempts to `DEAD_LETTER`, manageable via `GET /api/v1/admin/notifications/logs` and `POST /api/v1/admin/notifications/:id/retry`.
