# SHE-VALLEY — Courier, Discreet Parcel & Delivery Operations Guide

> **Service:** `src/server/services/courierService.ts`  
> **Routes:** `/api/v1/admin/couriers`, `/api/v1/admin/shipments*`, `/api/v1/webhooks/couriers/:provider`  
> **Table:** `shipments`

---

## 1. Supported Bangladesh Courier Adapters

| Provider | Code | Mode | Notes |
| :--- | :--- | :--- | :--- |
| **Steadfast** | `STEADFAST` | `PENDING_CREDENTIALS` / `SANDBOX` | Default nationwide adapter (`STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY`). |
| **Pathao** | `PATHAO` | `PENDING_CREDENTIALS` / `SANDBOX` | Requires `PATHAO_CLIENT_ID` & `PATHAO_CLIENT_SECRET`. |
| **REDX** | `REDX` | `PENDING_CREDENTIALS` / `SANDBOX` | Requires `REDX_API_TOKEN`. |
| **Paperfly** | `PAPERFLY` | `PENDING_CREDENTIALS` / `SANDBOX` | Adapter interface ready for merchant keys. |
| **eCourier** | `ECOURIER` | `PENDING_CREDENTIALS` / `SANDBOX` | Adapter interface ready for merchant keys. |
| **Manual Rider** | `MANUAL` | `ACTIVE` | Local Dhaka handoff rider tracking. |

---

## 2. Discreet Innerwear Privacy Standard

- Because SHE-VALLEY specializes in women's innerwear, `courier_config.discreetParcelLabelDefault` and `hideInnerwearDescriptionOnLabel` default to `true`.
- Parcel bookings (`createShipmentParcel`) store `discreet_label = true` and **omit product/innerwear item names** from outer consignment metadata and tracking labels, logging a neutral parcel description instead.

---

## 3. Lifecycle, Webhooks & COD Settlement

1. **Booking:** `POST /api/v1/admin/shipments` assigns a unique `consignment_id` and `tracking_code`, calculates COD cash-on-handover (`codAmountToCollectBdt`), and logs tracking in `order_status_history`.
2. **Webhook Status Sync:** `POST /api/v1/webhooks/couriers/:provider` verifies `x-shevalley-signature` (HMAC-SHA256 against `COURIER_WEBHOOK_SECRET`), updates shipment status (`PICKED_UP` -> `IN_TRANSIT` -> `OUT_FOR_DELIVERY` -> `DELIVERED` / `FAILED_DELIVERY` / `RETURNED`), and syncs the parent order status automatically.
3. **COD Settlement & Performance:** `POST /api/v1/admin/shipments/:id/settle` marks courier COD funds settled; `GET /api/v1/admin/couriers` aggregates delivery rate, failures, returns, delivery expense, and settled COD per provider.
4. **Customer Visibility:** `POST /api/v1/orders/track` surfaces live shipment `provider`, `trackingCode`, `status`, and `connectionMode` alongside the order timeline.
