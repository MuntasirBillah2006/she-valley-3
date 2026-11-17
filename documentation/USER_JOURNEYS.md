# SHE-VALLEY — User Journey Maps

> **Purpose:** Map end-to-end user flows across customer personas and internal operational roles to guide UI/UX, API boundaries, and RBAC design in Commands 02–04.

---

## 1. First-Time Customer Journey
- **Goal:** Discover a comfortable, well-fitting innerwear item and complete a safe first purchase.
- **Steps:**
  1. **Discovery:** Arrives on mobile via social link or search -> sees calm, trustworthy homepage in Bengali or English.
  2. **Exploration:** Navigates to Innerwear category -> filters by style/size.
  3. **Confidence Check:** Opens Product Detail Page -> reviews fabric composition, breathable specs, and opens the **Size Guide** to verify fit.
  4. **Trust Validation:** Sees explicit **Discreet Packaging** and **Cash on Delivery (COD)** notice.
  5. **Cart & Checkout:** Adds variant to bag -> enters Name, BD Phone (`01XXXXXXXXX`), Division/District/Area, and Street Address -> chooses COD.
  6. **Confirmation:** Receives Order Reference Number + SMS/WhatsApp confirmation -> tracks order via `/order-tracking`.
- **Friction Prevented:** No forced account creation, no aggressive popups, clear BDT delivery fee before final confirm.

---

## 2. Returning Customer Journey
- **Goal:** Quickly reorder a favorite style or explore new arrivals.
- **Steps:**
  1. **Sign-In:** Signs in with phone/email -> language preference (`bn` or `en`) automatically applied.
  2. **Quick Access:** Opens **Wishlist** or **Order History** to check previous purchased size.
  3. **Selection:** Selects new color/pack -> adds to cart.
  4. **1-Step Checkout:** Default saved address pre-filled -> picks payment method (COD or Digital Payment) -> confirms order.
  5. **Post-Order:** Views live fulfillment status in `/account/orders/:id`.

---

## 3. Guest Checkout Customer Journey
- **Goal:** Purchase quickly and privately without registering an account.
- **Steps:**
  1. **Browse & Bag:** Browses catalog and adds items to local cart.
  2. **Guest Mode:** Proceeds to `/checkout` -> selects "Continue as Guest".
  3. **Minimal Data Entry:** Provides only essential delivery fields (Recipient Name, Mobile Number, Delivery Zone/Address).
  4. **Verification:** Optional OTP/phone verification for COD risk policy (if configured).
  5. **Order Receipt:** Receives order ID + tracking token; can track order anytime using Order ID + Phone without creating a password.

---

## 4. WhatsApp Inquiry Customer Journey
- **Goal:** Get personal fit/fabric guidance before placing an order.
- **Steps:**
  1. **Trigger:** Customer is unsure between two sizes on PDP or FAQ page.
  2. **Action:** Taps **"Ask Fit Specialist on WhatsApp"** link (pre-populated with product name/SKU reference, never exposing sensitive PII).
  3. **Consultation:** Support/Moderator assists respectfully with size recommendation and discreet delivery details.
  4. **Conversion:** Customer either completes checkout on the website using a shared direct product link OR Moderator logs an assisted order in Admin (Command 03) with customer consent.

---

## 5. Customer Support Journey
- **Goal:** Resolve a delivery delay, wrong size inquiry (unopened/eligible), or payment question.
- **Steps:**
  1. **Entry:** Customer visits `/support` or `/account/orders/:id` -> selects issue category (Delivery, Sizing/Exchange, Payment, Product Quality).
  2. **Ticket Creation:** Submits order reference, phone, and message -> receives Ticket ID.
  3. **Triage & Resolution:** Support Agent reviews order & shipment log -> replies within SLA -> initiates replacement/refund/courier follow-up if eligible.
  4. **Closure:** Customer notified of resolution; ticket archived with audit trail.

---

## 6. Moderator Workflow (Internal)
- **Permissions Scope:** Content moderation, product review approval, basic order confirmation calls, customer support replies. No access to financial payout settings or RBAC administration.
- **Daily Workflow:**
  1. Logs into `/admin` -> sees assigned moderation & verification queues.
  2. Verifies pending COD orders via phone call log (`Confirmed` / `Unreachable` / `Cancelled`).
  3. Reviews submitted customer product reviews for authenticity and respectful language before publishing.
  4. Answers Tier-1 support tickets and WhatsApp inquiries using approved response guidelines.

---

## 7. Store Manager Workflow (Internal)
- **Permissions Scope:** Catalog, variants, pricing, inventory, order dispatch, courier booking, promotions, operational reports. No Super Admin security/role changes.
- **Daily Workflow:**
  1. Reviews daily order queue and stock alerts on `/admin`.
  2. Approves batch dispatch -> pushes confirmed orders to Courier integration -> prints discreet shipping labels.
  3. Updates product catalog, bilingual translations, size stock levels, and records incoming inventory (`StockMovements`).
  4. Handles escalated returns/exchanges and coordinates COD reconciliation reports with courier statements.

---

## 8. Super Admin Workflow (Internal)
- **Permissions Scope:** Full system control, RBAC roles & permissions, payment/courier gateway config, global settings, financial reporting, security audit logs.
- **Key Workflows:**
  1. Provisions staff accounts and assigns least-privilege roles (`Store Manager`, `Moderator`, `Support`).
  2. Configures platform-wide settings (BDT delivery zones, COD verification rules, tax/VAT settings, maintenance flags).
  3. Audits sensitive actions (`AuditLogs`) such as bulk price changes, refunds, and role modifications.
  4. Reviews executive analytics (revenue, repeat rate, category growth, RTO rate) and oversees expansion into new categories (Nightwear, Loungewear, Beauty, etc.).
