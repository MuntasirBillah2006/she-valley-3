# SHE-VALLEY — Complete Information Architecture & Sitemap

> **Legend:**  
> - `[CMD-01]` Foundation / Design System / Architecture (Current Command)  
> - `[CMD-02]` Customer Storefront & Ordering Experience (Future)  
> - `[CMD-03]` Admin Operations, Payments & Courier Integrations (Future)  
> - `[CMD-04]` Automation, Analytics, Blog CMS & Optimization (Future)  

---

## 1. Public Customer Storefront Sitemap

| Route Pattern | Page / Section | Primary Purpose | Command |
| :--- | :--- | :--- | :--- |
| `/` (and `/bn`, `/en`) | **Homepage** | Brand focal hero, featured innerwear collection, comfort/privacy value story, trust markers, footer. | `[CMD-01]` Shell/Tokens · `[CMD-02]` Full Storefront |
| `/shop` | **Shop (All Products)** | Filterable & sortable product catalog (size, style, fabric, color, price range in BDT). | `[CMD-02]` |
| `/categories` | **Categories Directory** | Overview of Women's Innerwear and upcoming lifestyle categories. | `[CMD-02]` |
| `/categories/:slug` | **Category Listing** | Category-specific collection page with localized intro & tailored attribute filters. | `[CMD-02]` |
| `/products/:slug` | **Product Details (PDP)** | Image gallery, variant selector (size/color/pack), stock availability, size guide modal, discreet packaging note, add-to-cart & wishlist. | `[CMD-02]` |
| `/cart` | **Shopping Cart** | Itemized bag, quantity steppers, delivery zone estimate, promo code slot, checkout CTA. | `[CMD-02]` |
| `/checkout` | **Checkout** | Guest or signed-in checkout, Bangladesh Division/District/Area selector, COD & online payment selection, order review. | `[CMD-02]` (COD flow) · `[CMD-03]` (Online Gateways) |
| `/order-tracking` | **Order Tracking** | Public order lookup by Order Number + Phone Number showing fulfillment & courier status. | `[CMD-02]` (Basic) · `[CMD-03]` (Live Courier Sync) |
| `/wishlist` | **Wishlist** | Saved products for authenticated or local-session shoppers. | `[CMD-02]` |

---

## 2. Customer Account Area (`/account/*`)

| Route Pattern | Page / Section | Primary Purpose | Command |
| :--- | :--- | :--- | :--- |
| `/login` & `/register` | **Authentication** | Phone/email sign-in, OTP/password login, registration. | `[CMD-02]` |
| `/account` | **Account Overview** | Profile summary, recent order status, quick links. | `[CMD-02]` |
| `/account/orders` | **Order History** | Past & active orders, invoice view, reorder action. | `[CMD-02]` |
| `/account/orders/:id` | **Order Detail** | Line items, payment state, shipment tracking timeline, support ticket link. | `[CMD-02]` · `[CMD-03]` |
| `/account/addresses` | **Saved Addresses** | Manage Bangladesh delivery addresses (Home/Office, default address). | `[CMD-02]` |
| `/account/profile` | **Profile & Preferences** | Name, phone, preferred language (`bn`/`en`), password/security. | `[CMD-02]` |

---

## 3. Brand, Care, Legal & Editorial Pages

| Route Pattern | Page / Section | Primary Purpose | Command |
| :--- | :--- | :--- | :--- |
| `/about` | **About SHE-VALLEY** | Brand story, mission ("BE COMFORTABLE. BE CONFIDENT."), quality & privacy values. | `[CMD-02]` |
| `/size-guide` | **Fit & Size Guide** | Non-judgmental measurement guide for Bangladeshi women's innerwear sizing. | `[CMD-02]` |
| `/contact` | **Contact Us** | Customer care channels, WhatsApp consultation link, inquiry form. | `[CMD-02]` |
| `/faq` | **Frequently Asked Questions** | Categorized Q&A on sizing, discreet delivery, COD, exchanges, fabric care. | `[CMD-02]` |
| `/support` | **Customer Support Center** | Submit support/exchange ticket and check ticket updates. | `[CMD-02]` · `[CMD-03]` |
| `/policies/privacy` | **Privacy Policy** | Data protection, discreet packaging & confidentiality commitments. | `[CMD-02]` |
| `/policies/returns` | **Return & Exchange Policy** | Hygiene-conscious exchange/return eligibility and timelines. | `[CMD-02]` |
| `/policies/shipping` | **Shipping & COD Policy** | Inside/Outside Dhaka delivery timeframes, fees, COD terms. | `[CMD-02]` |
| `/policies/terms` | **Terms & Conditions** | Platform terms of use and purchase conditions. | `[CMD-02]` |
| `/blog` & `/blog/:slug` | **Editorial Journal / Blog** | Wellness, comfort education, fabric care, and lifestyle articles (bilingual). | `[CMD-04]` |

---

## 4. Internal Admin & Operations Portal (`/admin/*`)

| Route Pattern | Module | Primary Purpose | Command |
| :--- | :--- | :--- | :--- |
| `/admin` | **Admin Overview** | Role-aware operational KPIs, pending orders, low-stock alerts. | `[CMD-03]` |
| `/admin/orders` | **Order Management** | Order verification queue, COD confirmation, invoice printing, status transitions. | `[CMD-03]` |
| `/admin/products` | **Catalog & Variants** | Product creation, Bengali/English translations, SKU/variant pricing & media. | `[CMD-03]` |
| `/admin/categories` | **Category Management** | Category hierarchy, future category activation, SEO metadata. | `[CMD-03]` |
| `/admin/inventory` | **Inventory & Stock** | Stock levels, stock movement ledger, low-stock thresholds, adjustments. | `[CMD-03]` |
| `/admin/payments` | **Payments & Refunds** | Transaction logs, COD settlement reconciliation, refund processing. | `[CMD-03]` |
| `/admin/shipments` | **Courier & Dispatch** | Courier booking, tracking sync, RTO/return handling. | `[CMD-03]` |
| `/admin/customers` | **CRM & Customers** | Customer profiles, order frequency, notes, segment tags. | `[CMD-03]` |
| `/admin/support` | **Support Desk** | Ticket triage, customer messaging, resolution SLA tracking. | `[CMD-03]` |
| `/admin/marketing` | **Banners & Campaigns** | Homepage hero banners, editorial promos, blog CMS. | `[CMD-04]` |
| `/admin/reports` | **Reports & Analytics** | Revenue, margin, category performance, COD vs. prepaid ratios, CSV export. | `[CMD-04]` |
| `/admin/automation` | **Automation Center** | Notification templates, job queue monitoring, trigger rules. | `[CMD-04]` |
| `/admin/settings` | **Platform Settings** | Store config, delivery zones, payment/courier credentials status, RBAC roles. | `[CMD-03]` · `[CMD-04]` |
| `/admin/audit-logs` | **Security & Audit Logs** | Immutable trail of admin actions, price changes, role updates. | `[CMD-03]` · `[CMD-04]` |

---

## 5. Command 01 Deliverable Boundary

In **Command 01**, routes are **planned and documented**; the active application renders the **SHE-VALLEY Foundation & Design System Showcase Shell** (verifying tokens, bilingual switching, responsive layout, and reusable UI components) without implementing Command 02–04 storefront or admin business workflows.
