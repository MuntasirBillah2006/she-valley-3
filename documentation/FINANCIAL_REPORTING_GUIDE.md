# SHE-VALLEY — Financial Reporting & Expense Accounting Guide

> **Service:** `src/server/services/financialService.ts`  
> **Routes:** `GET /api/v1/admin/reports/financial`, `GET /api/v1/admin/reports/financial/export`, `POST /api/v1/admin/expenses`  
> **Table:** `business_expenses`

---

## 1. Honest Separation of Confirmed Cash vs. Estimates

SHE-VALLEY strictly separates **recorded ledger facts** from **estimated profit margins**:
- **Gross Sales Revenue:** Total BDT across non-cancelled, non-failed, non-returned orders.
- **Delivered Revenue:** Confirmed revenue from orders marked `DELIVERED`.
- **Payment Settled & COD Pending Collection:** Derived from `payments` (`PAID` vs. `COD` awaiting collection/settlement).
- **Direct Deductions:**
  - `deliveryExpensesBdt`: Recorded parcel delivery fees from `shipments` (or order delivery fees).
  - `gatewayFeesBdt`: Recorded gateway fees (`payments.gateway_fee_bdt`).
  - `operatingExpensesBdt`: Staff-entered expenses in `business_expenses` (`PACKAGING`, `MARKETING`, `COURIER_ADJUSTMENT`, `OPERATIONS`, `STAFF`, `OTHER`).
  - `refundsProcessedBdt`: Approved/processed refunds in `refunds`.
- **Estimated COGS, Estimated Gross Profit & Estimated Net Profit:** Always labeled explicitly in both the API (`estimateDisclaimer`) and Admin UI (`Estimated Gross Profit`, `Estimated Net Profit`) because SKUs missing explicit `cost_price_bdt` fall back to a documented `55%` cost-ratio estimate until full unit costing is entered.

---

## 2. Inventory Valuation & Exports

- **Cost Valuation (`costValuationBdt`):** `sum(onHandQty * costPriceBdt)` (or `55%` fallback where cost is unset).
- **Retail Valuation (`retailValuationBdt`):** `sum(onHandQty * priceBdt)`.
- **Monthly Breakdown & CSV Export:** Monthly aggregations (revenue, orders, expenses) and one-click CSV download (`/api/v1/admin/reports/financial/export`, guarded by `export` RBAC permission).
