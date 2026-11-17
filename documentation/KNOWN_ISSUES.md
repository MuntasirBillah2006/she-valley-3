# SHE-VALLEY — Known Issues, Limitations & External Blockers

> Maintained honestly per Command 01–03 verification rules.

---

## 1. Business Information Placeholders (Pending Owner Input)
- **Resolved in Command 03:** Official WhatsApp (`01828-298143`), Messenger (`https://m.me/SheValley`), and Instagram (`@she-valley`) are live in `settings.contact_social` and storefront UI.
- **Remaining Placeholders:** Legal entity name, Trade License/BIN, official Dhaka warehouse street address, and final policy legal copy remain `[PLACEHOLDER]` until owner sign-off.
- **Policy Pages Unpublished:** `privacy-policy`, `return-policy`, `shipping-policy`, and `terms` remain `isPublished: false` (`ownerApproved: false`) until explicitly approved in Admin → Content & Settings.

## 2. External Integration Readiness & Pending Credentials
- **Payment Gateways (bKash, Nagad, SSLCommerz):** Adapters, idempotency, HMAC webhooks, and server-side verification are implemented, but live merchant credentials (`BKASH_*`, `NAGAD_*`, `SSLCOMMERZ_*`) are absent — reporting `PENDING_CREDENTIALS`. Live switching additionally requires `liveActivationApprovedByOwner: true`. COD remains `ACTIVE`.
- **Courier APIs (Pathao, Steadfast, REDX, Paperfly, eCourier):** Adapters, parcel booking, discreet labels, webhook sync, and COD settlement are implemented, but courier merchant keys (`PATHAO_*`, `STEADFAST_*`, `REDX_*`) are absent — reporting `PENDING_CREDENTIALS` (non-prod sandbox booking enabled; `MANUAL` rider dispatch is `ACTIVE`).
- **WhatsApp Cloud API / Messenger API / SMTP / SMS:** Direct click-to-chat links work immediately; automated inbound Meta webhooks (`NOT_CONNECTED`) and live outbound dispatchers (`MOCK_SANDBOX`) require `WHATSAPP_ACCESS_TOKEN`, `META_APP_SECRET`, `SMTP_*`, `SMS_API_KEY`, and `ownerApprovedExternalDispatch = true`.
- **GA4 / GTM / Meta Pixel / GSC / n8n:** Ready for dynamic injection and signed HMAC relay as soon as owner enters IDs/URLs in Admin → Content & Settings.

## 3. Financial Estimates vs. Actuals
- Variant rows without an explicit `cost_price_bdt` use a documented `55%` cost-ratio fallback in `financialService.ts`. Profit figures are explicitly labeled **Estimated** until all SKU unit costs and operating expenses are entered.

## 4. Development-Only Sample Data & Environment Notes
- Non-production startup seeds dev test accounts (`admin@shevalley.local`, `moderator@shevalley.local`, `customer@shevalley.local`) and sample catalog items; `NODE_ENV=production` skips sample catalog/customers/accounts.
- `index.html` links Google Fonts with system font fallbacks for offline environments; replace sample imagery URLs with studio CDN URLs before launch.

