# SHE-VALLEY — Business Requirement Document (BRD)

> **Document Status:** Phase 01 (Foundation & Discovery)  
> **Brand:** SHE-VALLEY  
> **Slogan:** BE COMFORTABLE. BE CONFIDENT.  
> **Primary Market:** Bangladesh (BDT)  
> **Languages:** Bengali (`bn`) and English (`en`)  
> **Positioning:** Accessible Premium  

---

## 1. Executive Summary & Business Model

SHE-VALLEY is a Bangladesh-based Direct-to-Consumer (D2C) women's e-commerce and lifestyle brand launching with **Women's Innerwear** as its core initial category, designed to scale into a full women's comfort and lifestyle platform.

### 1.1 Business Model
- **Primary Channel:** Branded D2C web storefront optimized for mobile commerce in Bangladesh.
- **Assisted Commerce Channel:** WhatsApp / Messenger / Phone inquiry support for sizing consultation, discreet ordering, and order verification (future Command 02/03).
- **Revenue Model:** Direct product sales in BDT (`৳`), supporting Cash on Delivery (COD) and local digital/card payments (future Command 03).
- **Business Details Pending Confirmation (Placeholders):**
  - Legal Entity Name: `[PLACEHOLDER: Legal Business Name]`
  - Trade License / BIN: `[PLACEHOLDER: Trade License / VAT Registration]`
  - Registered Warehouse / Office Address: `[PLACEHOLDER: Dhaka Operations Address]`
  - Official Support Phone / WhatsApp: `[PLACEHOLDER: +880-1XXX-XXXXXX]`
  - Official Support Email: `[PLACEHOLDER: support@she-valley.com]`

### 1.2 Brand Values
1. **Comfort** — Breathable, skin-friendly, thoughtfully sized products and calm shopping experience.
2. **Confidence** — Empowering, respectful presentation without objectification or aggressive sales tactics.
3. **Privacy** — Discreet packaging, confidential customer data handling, and respectful communication.
4. **Care** — Guided sizing assistance, hygienic return/exchange clarity, and responsive support.
5. **Quality** — Consistent fabric, stitching, and fit standards suited to Bangladesh's climate.
6. **Respect** — Dignified visual language, accessible UI, and non-intrusive notifications.

---

## 2. Customer Types & Personas

| Customer Segment | Characteristics | Key Needs |
| :--- | :--- | :--- |
| **First-Time Online Buyer** | Cautious about sizing, fabric authenticity, and online trust; prefers COD. | Clear size guides (cm/inch/BD standards), Bengali language support, COD, transparent return/hygiene policy. |
| **Returning Loyal Customer** | Familiar with SHE-VALLEY sizing; seeks fast reorder and new arrivals. | Saved addresses, order history, wishlist, size preferences, quick checkout. |
| **Privacy-Focused / Guest Buyer** | Prefers not to create a permanent account or receive promotional SMS; orders discreetly. | Guest checkout with phone verification, discreet plain packaging guarantee, minimal required fields. |
| **Assisted-Care / Inquiry Buyer** | Unsure about fit/size or prefers human reassurance before buying. | One-tap WhatsApp sizing help, clear FAQ, supportive tone without judgment. |
| **Gift / Family Household Buyer** | Ordering on behalf of a partner or family member. | Clear recipient delivery instructions, discreet billing/packaging, flexible delivery slots. |

---

## 3. Product Categories (Current & Expansion Roadmap)

### 3.1 Launch Category (Command 02 Scope)
- **Women's Innerwear:** Everyday bras, wireless/comfort bras, sports/active innerwear, briefs/panties, shapewear, maternity/nursing essentials, multipacks.

### 3.2 Planned Expansion Categories (Architecture-Ready in Command 01)
- **Nightwear**
- **Sleepwear**
- **Loungewear**
- **Women's Fashion**
- **Beauty**
- **Personal Care**
- **Accessories**
- **Women's Lifestyle**

> *Architectural Requirement:* Category hierarchy must support multi-level parent/child trees, localized Bengali/English names, category-specific size charts, and hygiene/returnability flags (e.g., non-returnable intimate bottoms once unsealed vs. exchangeable loungewear).

---

## 4. Core Business & Platform Requirements

### 4.1 Current Foundation Requirements (Command 01 — Active)
- Establish modular monolith architecture with clear domain boundaries.
- Implement accessible, culturally respectful, accessible-premium design system (`#6E1F35` Burgundy, `#F7F1EB` Warm Ivory, `#252225` Charcoal).
- Build and test reusable UI foundation components with mobile-first responsiveness.
- Establish bilingual (`bn` and `en`) localization architecture, BDT currency formatting, and Bangladesh-friendly date formatting.
- Document business, sitemap, user journey, database, and API blueprints.

### 4.2 Future Storefront & Operations Requirements (Commands 02–04)
- **Command 02 (Customer Storefront):** Catalog browsing, multi-variant selection (size, cup/band, color, pack), size guide modal, search, cart drawer, guest & authenticated checkout, customer account, wishlist, order tracking, static/editorial pages.
- **Command 03 (Operations, Payments & Logistics):** Admin dashboard with RBAC (Super Admin, Store Manager, Moderator, Support Agent), order management & verification workflow, inventory & stock movements, COD & online payment gateways, courier integration, CRM & support ticketing.
- **Command 04 (Growth & Automation):** Automated order confirmations/notifications, abandoned-cart recovery rules, analytics & financial reporting, SEO optimization, blog/editorial CMS, audit trail hardening.

---

## 5. Bangladesh-Specific E-Commerce Requirements

1. **Currency & Pricing:** All prices displayed in **BDT (`৳`)** using clear formatting (`৳1,250` or `৳১,২৫০` / tabular numerals), inclusive of transparent delivery charges.
2. **Geographic Addressing:** Support Bangladesh administrative hierarchy:
   - **Division** (8 Divisions)
   - **District (Zila)** (64 Districts)
   - **Upazila / Thana / Area** (crucial for Dhaka Metro vs. Sub-Dhaka vs. Outside Dhaka delivery zones and courier routing).
3. **Phone Number Standard:** Primary customer identifier and checkout contact uses Bangladeshi mobile numbers (`+880 1XXX-XXXXXX` / `01XXXXXXXXX`, 11 digits starting with `01[3-9]`).
4. **Cash on Delivery (COD):**
   - Must be supported as a first-class payment option across Bangladesh.
   - Support COD verification safeguards (e.g., phone confirmation flags for high-value or first-time COD orders, configurable delivery charge rules).
5. **Payment Integrations (Command 03):**
   - Architecture must accommodate SSLCommerz / bKash / Nagad / Rocket / Card payments alongside COD, with webhook idempotency and payment reconciliation.
6. **Courier Integrations (Command 03):**
   - Architecture must accommodate Bangladeshi courier partners (e.g., Pathao Courier, Steadfast, RedX, Paperfly — `[PLACEHOLDER: Confirmed Courier Partners]`), consignment tracking IDs, Inside Dhaka / Outside Dhaka weight & zone rates, and return/RTO tracking.

---

## 6. Privacy, Dignity & Trust Requirements

1. **Discreet Packaging Promise:** Explicit commitment across product, cart, and checkout views that parcels arrive in plain, unbranded outer packaging without revealing innerwear contents on the shipping label.
2. **Data Minimization & Security:**
   - Never expose customer PII, phone numbers, or addresses in public APIs or client logs.
   - Mask sensitive contact info in order-tracking responses unless verified.
3. **Respectful Visual & Verbal Tone:**
   - Avoid intrusive popups, countdown pressure timers, or sensationalized imagery.
   - Provide calm, private, body-positive sizing guidance.

---

## 7. Mobile-First, Bilingual & Automation Requirements

### 7.1 Mobile-First Requirements
- Majority of Bangladesh e-commerce traffic arrives on Android smartphones over 3G/4G networks.
- Minimum `44px x 44px` touch targets for interactive controls.
- Lightweight payloads, clean typography, single-hand thumb-reachable primary actions on mobile.

### 7.2 Bilingual Requirements (`bn` & `en`)
- Full first-class support for **Bengali (`bn`)** and **English (`en`)**.
- Clean typography pairing that preserves legibility and line-height for Bengali Unicode script (`Noto Sans Bengali` / `Hind Siliguri` paired with geometric sans and modern editorial serif).
- User-selectable language switcher persisted across sessions; localized URL/route strategy and localized product metadata (`ProductTranslations`).

### 7.3 Automation Requirements (Command 04)
- Event-driven job architecture (`AutomationJobs`) for:
  - Order confirmation & shipment milestone notifications (SMS/Email/WhatsApp templates).
  - Low-stock inventory alerts to Store Managers.
  - Automated COD order verification reminders.
  - Scheduled daily/monthly sales and courier reconciliation reports.
