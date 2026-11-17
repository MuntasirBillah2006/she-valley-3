import { desc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  businessExpenses,
  inventory,
  orderItems,
  orders,
  payments,
  productVariants,
  refunds,
  shipments,
} from '../../db/schema.ts';

export interface FinancialReportSummary {
  disclaimer: string;
  grossRevenueBdt: number;
  deliveredRevenueBdt: number;
  estimatedCogsBdt: number;
  estimatedGrossProfitBdt: number;
  deliveryExpensesBdt: number;
  gatewayFeesBdt: number;
  operatingExpensesBdt: number;
  refundsProcessedBdt: number;
  estimatedNetProfitBdt: number;
  codPendingCollectionBdt: number;
  paymentSettledBdt: number;
  returnedOrdersCount: number;
  inventoryValuation: {
    totalUnitsOnHand: number;
    costValuationBdt: number;
    retailValuationBdt: number;
  };
  monthlyBreakdown: {
    month: string;
    ordersCount: number;
    revenueBdt: number;
    refundsBdt: number;
    expensesBdt: number;
  }[];
}

export async function generateFinancialReport(): Promise<FinancialReportSummary> {
  const [orderRows, itemRows, variantRows, invRows, paymentRows, refundRows, shipmentRows, expenseRows] =
    await Promise.all([
      db.select().from(orders),
      db.select().from(orderItems),
      db.select().from(productVariants),
      db.select().from(inventory),
      db.select().from(payments),
      db.select().from(refunds),
      db.select().from(shipments),
      db.select().from(businessExpenses).orderBy(desc(businessExpenses.expenseDate)),
    ]);

  const variantCostMap = new Map(
    variantRows.map((v) => [
      v.id,
      v.costPriceBdt !== null ? Number(v.costPriceBdt) : Number((Number(v.priceBdt) * 0.55).toFixed(2)),
    ]),
  );

  const nonCancelledOrders = orderRows.filter((o) => o.status !== 'CANCELLED');
  const deliveredOrders = orderRows.filter((o) => o.status === 'DELIVERED');
  const returnedOrders = orderRows.filter((o) => o.status === 'RETURNED');

  const grossRevenueBdt = nonCancelledOrders.reduce((s, o) => s + Number(o.totalBdt), 0);
  const deliveredRevenueBdt = deliveredOrders.reduce((s, o) => s + Number(o.totalBdt), 0);

  const nonCancelledIds = new Set(nonCancelledOrders.map((o) => o.id));
  const estimatedCogsBdt = itemRows
    .filter((i) => nonCancelledIds.has(i.orderId))
    .reduce((sum, item) => sum + (variantCostMap.get(item.variantId) ?? 0) * item.quantity, 0);

  const estimatedGrossProfitBdt = Number((grossRevenueBdt - estimatedCogsBdt).toFixed(2));

  const deliveryExpensesBdt =
    shipmentRows.length > 0
      ? shipmentRows.reduce((s, sh) => s + Number(sh.deliveryChargeBdt), 0)
      : nonCancelledOrders.reduce((s, o) => s + Number(o.deliveryFeeBdt), 0);

  const gatewayFeesBdt = paymentRows.reduce((s, p) => s + Number(p.gatewayFeeBdt), 0);
  const operatingExpensesBdt = expenseRows.reduce((s, e) => s + Number(e.amountBdt), 0);
  const refundsProcessedBdt = refundRows
    .filter((r) => r.status === 'PROCESSED' || r.status === 'APPROVED')
    .reduce((s, r) => s + Number(r.amountBdt), 0);

  const estimatedNetProfitBdt = Number(
    (
      estimatedGrossProfitBdt -
      deliveryExpensesBdt -
      gatewayFeesBdt -
      operatingExpensesBdt -
      refundsProcessedBdt
    ).toFixed(2),
  );

  const codPendingCollectionBdt = nonCancelledOrders
    .filter((o) => o.paymentMethod === 'COD' && o.paymentStatus !== 'PAID')
    .reduce((s, o) => s + Number(o.totalBdt), 0);

  const paymentSettledBdt = paymentRows
    .filter((p) => p.status === 'PAID')
    .reduce((s, p) => s + Number(p.netAmountBdt ?? p.amountBdt), 0);

  // Inventory valuation
  const variantById = new Map(variantRows.map((v) => [v.id, v]));
  let totalUnitsOnHand = 0;
  let costValuationBdt = 0;
  let retailValuationBdt = 0;
  for (const inv of invRows) {
    const v = variantById.get(inv.variantId);
    totalUnitsOnHand += inv.onHandQty;
    if (v) {
      retailValuationBdt += inv.onHandQty * Number(v.priceBdt);
      costValuationBdt += inv.onHandQty * (variantCostMap.get(v.id) ?? 0);
    }
  }

  // Monthly breakdown
  const monthlyMap = new Map<
    string,
    { ordersCount: number; revenueBdt: number; refundsBdt: number; expensesBdt: number }
  >();
  for (const o of nonCancelledOrders) {
    const month = o.createdAt.toISOString().slice(0, 7);
    const entry = monthlyMap.get(month) ?? { ordersCount: 0, revenueBdt: 0, refundsBdt: 0, expensesBdt: 0 };
    entry.ordersCount += 1;
    entry.revenueBdt += Number(o.totalBdt);
    monthlyMap.set(month, entry);
  }
  for (const r of refundRows) {
    if (r.status === 'PROCESSED' || r.status === 'APPROVED') {
      const month = r.createdAt.toISOString().slice(0, 7);
      const entry = monthlyMap.get(month) ?? { ordersCount: 0, revenueBdt: 0, refundsBdt: 0, expensesBdt: 0 };
      entry.refundsBdt += Number(r.amountBdt);
      monthlyMap.set(month, entry);
    }
  }
  for (const e of expenseRows) {
    const month = e.expenseDate.toISOString().slice(0, 7);
    const entry = monthlyMap.get(month) ?? { ordersCount: 0, revenueBdt: 0, refundsBdt: 0, expensesBdt: 0 };
    entry.expensesBdt += Number(e.amountBdt);
    monthlyMap.set(month, entry);
  }

  const monthlyBreakdown = Array.from(monthlyMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, data]) => ({
      month,
      ordersCount: data.ordersCount,
      revenueBdt: Number(data.revenueBdt.toFixed(2)),
      refundsBdt: Number(data.refundsBdt.toFixed(2)),
      expensesBdt: Number(data.expensesBdt.toFixed(2)),
    }));

  return {
    disclaimer:
      'Estimated Gross Profit and Estimated Net Profit use recorded variant cost prices (or a 55% fallback estimate where cost price is blank) and are not audited tax accounting statements.',
    grossRevenueBdt: Number(grossRevenueBdt.toFixed(2)),
    deliveredRevenueBdt: Number(deliveredRevenueBdt.toFixed(2)),
    estimatedCogsBdt: Number(estimatedCogsBdt.toFixed(2)),
    estimatedGrossProfitBdt,
    deliveryExpensesBdt: Number(deliveryExpensesBdt.toFixed(2)),
    gatewayFeesBdt: Number(gatewayFeesBdt.toFixed(2)),
    operatingExpensesBdt: Number(operatingExpensesBdt.toFixed(2)),
    refundsProcessedBdt: Number(refundsProcessedBdt.toFixed(2)),
    estimatedNetProfitBdt,
    codPendingCollectionBdt: Number(codPendingCollectionBdt.toFixed(2)),
    paymentSettledBdt: Number(paymentSettledBdt.toFixed(2)),
    returnedOrdersCount: returnedOrders.length,
    inventoryValuation: {
      totalUnitsOnHand,
      costValuationBdt: Number(costValuationBdt.toFixed(2)),
      retailValuationBdt: Number(retailValuationBdt.toFixed(2)),
    },
    monthlyBreakdown,
  };
}
