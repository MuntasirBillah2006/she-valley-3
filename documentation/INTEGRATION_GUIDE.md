# SHE-VALLEY — External Integrations Guide (Command 03)

> **Scope:** Payment Adapters, Courier Providers, Social/Messaging Channels, Marketing Pixels, Search Console, and Automation Webhooks.  
> **Safety Rule:** Missing credentials always resolve to `PENDING_CREDENTIALS` or `NOT_CONNECTED`. Zero credentials are fabricated.

---

## 1. Environment Variables & Secrets Configuration

Configure these optional server-side environment variables in your runtime environment (never in `VITE_*` client variables):

| Domain | Variable(s) | Status When Missing |
| :--- | :--- | :--- |
| **Payment Gateways** | `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD`, `NAGAD_MERCHANT_ID`, `NAGAD_PUBLIC_KEY`, `NAGAD_PRIVATE_KEY`, `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWD`, `PAYMENT_WEBHOOK_SECRET` | `PENDING_CREDENTIALS` (COD stays `ACTIVE`) |
| **Bangladesh Couriers** | `PATHAO_CLIENT_ID`, `PATHAO_CLIENT_SECRET`, `STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY`, `REDX_API_TOKEN`, `COURIER_WEBHOOK_SECRET` | `PENDING_CREDENTIALS` (`MANUAL` stays `ACTIVE`; sandbox booking allowed in non-prod) |
| **Meta / WhatsApp / Messenger** | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` | `NOT_CONNECTED` (Storefront direct click-to-chat uses `01828-298143` & `https://m.me/SheValley`) |
| **Marketing / CAPI / n8n** | `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` | Client consent-gated dataLayer + signed optional relay |
| **Outbound Notifications** | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMS_API_KEY` | `MOCK_SANDBOX` (Requires `ownerApprovedExternalDispatch` before live send) |

---

## 2. Official Brand Social & Care Channels

Stored in `settings.contact_social` (editable in Admin → Content & Settings):
- **WhatsApp:** `01828-298143` (`https://wa.me/8801828298143`)
- **Messenger:** `https://m.me/SheValley`
- **Instagram:** `@she-valley` (`https://instagram.com/she-valley`)
- **Facebook Page:** `https://facebook.com/SheValley`
- **Meta Webhook Verification:** `GET /api/v1/webhooks/meta` validates `hub.verify_token === process.env.META_VERIFY_TOKEN`.
- **Meta Webhook Receiver:** `POST /api/v1/webhooks/meta` verifies `x-hub-signature-256` against `META_APP_SECRET` and ingests real customer messages only—zero fake messages are ever created.

---

## 3. Marketing, Analytics & Google Search Console

Stored in `settings.marketing_config` (publicly hydrated in `GET /api/v1/storefront/bootstrap`):
- **Google Analytics 4 (`ga4MeasurementId`):** Dynamically injected by `SeoHeadManager` only after user accepts analytics consent (`sv_analytics_consent = 'granted'`).
- **Google Tag Manager (`gtmContainerId`):** Pushes ecommerce events to `window.dataLayer` when consent is granted.
- **Meta Pixel (`metaPixelId`):** Initialized cleanly on consent; deduplicates `Purchase` events via deterministic `eventId` sent to `POST /api/v1/marketing/events`.
- **Google Search Console (`searchConsoleVerification`):** Renders `<meta name="google-site-verification" content="..." />` in `<head>`.
- **Sitemaps & Crawlers:** `/sitemap.xml` emits bilingual `hreflang="en"`, `hreflang="bn"`, and `x-default` entries for static pages, active categories, active products, and published journal articles; `/robots.txt` blocks `/admin`, `/api/`, `/checkout`, and `/account`.
