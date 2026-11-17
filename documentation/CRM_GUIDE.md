# SHE-VALLEY — Unified Inbox, Support Tickets & Customer CRM Guide

> **Routes:** `POST /api/v1/support/contact`, `GET /api/v1/account/tickets`, `GET/POST/PATCH /api/v1/admin/inbox*`, `GET/POST/PATCH /api/v1/admin/crm/*`  
> **Tables:** `conversations`, `conversation_messages`, `support_tickets`, `customers`, `customer_tags`

---

## 1. Omnichannel Support Intake

1. **Storefront Contact Form (`/en/contact`, `/bn/contact`):** Submits to `POST /api/v1/support/contact` (topic categories: `GENERAL`, `SIZING`, `ORDER_INQUIRY`, `RETURN_EXCHANGE`, `COMPLAINT`), creates both a `conversations` thread (`channel = 'WEB_CONTACT'`) and a tracked `support_tickets` record (`SV-TKT-...`), links any matching customer/order, and triggers `NEW_TICKET_MODERATOR_ASSIGN`.
2. **Meta WhatsApp & Messenger Webhook (`GET/POST /api/v1/webhooks/meta`):** Ingests verified incoming webhook events into `conversations` and `conversation_messages`. Unconfigured channels display `NOT_CONNECTED` honestly; zero simulated/scraped messages are shown.
3. **Customer Ticket Visibility:** Signed-in customers view their ticket numbers, status, priority, and resolution summaries inside Account Dashboard → Support Tickets (`GET /api/v1/account/tickets`).

---

## 2. Unified Staff Inbox & Internal Notes

- Admin → **Inbox & Support** presents live channel connection status (`WhatsApp 01828-298143`, `Messenger m.me/SheValley`, `Web Contact`), split-view conversation threads, staff status/priority controls (`OPEN`, `IN_PROGRESS`, `WAITING_CUSTOMER`, `RESOLVED`, `CLOSED`), quick sizing/discreet-packaging replies, and **Internal Staff Notes** (`isInternalNote = true`, visible only to staff).
- Support ticket status & resolution summaries update via `PATCH /api/v1/admin/tickets/:id`.

---

## 3. Customer CRM & Retention Segmentation

- `GET /api/v1/admin/crm/customers` dynamically computes per-customer metrics from verified orders:
  - `ordersCount` & `totalSpendBdt`
  - `isRepeatCustomer` (`ordersCount >= 2`)
  - `computedSegment`: `VIP` (`>= ৳5,000`), `REPEAT` (`>= 2 orders`), `FIRST_TIME`, or `PROSPECT`
  - Portfolio `retentionRatePercent`
- Staff can apply private CRM tags (`POST /api/v1/admin/crm/customers/:id/tags`) and private customer care notes (`PATCH /api/v1/admin/crm/customers/:id/notes`), all protected by staff RBAC & MFA.
