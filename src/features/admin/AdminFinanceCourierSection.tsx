import { useCallback, useEffect, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { Alert } from '@/src/components/feedback/Alert';
import { LoadingIndicator } from '@/src/components/feedback/LoadingIndicator';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { Checkbox } from '@/src/components/ui/Checkbox';
import { FormField } from '@/src/components/ui/FormField';
import { Input } from '@/src/components/ui/Input';
import { Modal } from '@/src/components/ui/Modal';
import { Select } from '@/src/components/ui/Select';
import { useLocale } from '@/src/hooks/useLocale';
import { useToast } from '@/src/hooks/useToast';
import { apiClient, type PaymentMethodSummary } from '@/src/lib/apiClient';

interface PaymentRow {
  id: string;
  orderId: string;
  provider: string;
  amountBdt: string;
  gatewayFeeBdt: string;
  netAmountBdt: string | null;
  status: string;
  verifiedServerSide: boolean;
  transactionRef: string | null;
  settledAt: string | null;
  createdAt: string;
  order: { orderNumber: string; guestName: string; status: string } | null;
}

interface RefundRow {
  id: string;
  paymentId: string;
  amountBdt: string;
  reason: string;
  status: string;
  refundRef: string | null;
  createdAt: string;
  order: { orderNumber: string } | null;
}

interface FinancialReport {
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

interface ExpenseRow {
  id: string;
  category: string;
  title: string;
  amountBdt: string;
  expenseDate: string;
}

export function AdminPaymentsFinanceSection() {
  const { messages, formatCurrency, formatDate } = useLocale();
  const { showToast } = useToast();

  const [providers, setProviders] = useState<PaymentMethodSummary[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refund modal
  const [refundTarget, setRefundTarget] = useState<PaymentRow | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  // Expense modal
  const [expOpen, setExpOpen] = useState(false);
  const [expCategory, setExpCategory] = useState<'PACKAGING' | 'MARKETING' | 'COURIER_ADJUSTMENT' | 'OPERATIONS' | 'STAFF' | 'OTHER'>('PACKAGING');
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [payRes, finRes] = await Promise.all([
        apiClient.get<{ providers: PaymentMethodSummary[]; payments: PaymentRow[]; refunds: RefundRow[] }>(
          '/api/v1/admin/payments',
        ),
        apiClient
          .get<{ report: FinancialReport; expenses: ExpenseRow[] }>('/api/v1/admin/reports/financial')
          .catch(() => null),
      ]);
      setProviders(payRes.providers ?? []);
      setPayments(payRes.payments ?? []);
      setRefunds(payRes.refunds ?? []);
      if (finRes) {
        setReport(finRes.report);
        setExpenses(finRes.expenses ?? []);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [messages.common.errorGeneric]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCodCollect = async (p: PaymentRow) => {
    try {
      await apiClient.post(`/api/v1/admin/payments/${p.id}/cod-collect`, {
        collectedAmountBdt: Number(p.amountBdt),
        reconcileNow: true,
      });
      showToast({ title: 'COD collection reconciled', variant: 'success' });
      await loadData();
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  const handleManualVerify = async (p: PaymentRow, outcome: 'PAID' | 'FAILED') => {
    try {
      await apiClient.post(`/api/v1/admin/payments/${p.id}/verify-manual`, { outcome });
      showToast({ title: `Payment marked ${outcome}`, variant: 'success' });
      await loadData();
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget) return;
    try {
      await apiClient.post(`/api/v1/admin/payments/${refundTarget.id}/refunds`, {
        amountBdt: Number(refundAmount),
        reason: refundReason.trim(),
        approveAndProcess: true,
      });
      setRefundTarget(null);
      setRefundAmount('');
      setRefundReason('');
      showToast({ title: 'Refund processed', variant: 'success' });
      await loadData();
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/api/v1/admin/expenses', {
        category: expCategory,
        title: expTitle.trim(),
        amountBdt: Number(expAmount),
      });
      setExpOpen(false);
      setExpTitle('');
      setExpAmount('');
      showToast({ title: 'Expense recorded', variant: 'success' });
      await loadData();
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  if (loading) return <LoadingIndicator label={messages.common.loading} />;
  if (error) return <Alert variant="error">{error}</Alert>;

  return (
    <div className="space-y-6">
      {/* Provider Adapters Status */}
      <Card padding="none" className="overflow-x-auto">
        <div className="px-4 py-3 border-b border-brand-border flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Payment Gateway Adapters</h2>
          <span className="text-xs text-brand-charcoal-muted">
            Live activation requires owner approval & gateway credentials
          </span>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-brand-ivory-muted border-b border-brand-border text-brand-charcoal-muted">
            <tr>
              <th className="px-4 py-2.5">Provider</th>
              <th className="px-4 py-2.5">Connection Status</th>
              <th className="px-4 py-2.5">Credentials</th>
              <th className="px-4 py-2.5">Live Approved</th>
              <th className="px-4 py-2.5 text-right">Fee %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border tabular-nums">
            {providers.map((pr) => (
              <tr key={pr.provider} className="h-10">
                <td className="px-4 py-2 font-semibold">{pr.label}</td>
                <td className="px-4 py-2">
                  <Badge
                    variant={
                      pr.connectionStatus === 'ACTIVE'
                        ? 'success'
                        : pr.connectionStatus === 'SANDBOX'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {pr.connectionStatus}
                  </Badge>
                </td>
                <td className="px-4 py-2">{pr.credentialsConfigured ? 'Configured' : 'Missing'}</td>
                <td className="px-4 py-2">{pr.liveApproved ? 'Yes' : 'No'}</td>
                <td className="px-4 py-2 text-right font-mono">{pr.feeRatePercent.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Financial Summary */}
      {report && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Financial & Margin Overview</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setExpOpen(true)}>
                Record Expense
              </Button>
              <a
                href="/api/v1/admin/reports/financial/export"
                className="inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 text-xs font-medium rounded-lg border border-brand-border bg-brand-ivory-elevated hover:bg-brand-ivory-muted"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{messages.admin.exportCsv}</span>
              </a>
            </div>
          </div>

          <Alert variant="info">{report.disclaimer}</Alert>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
            {[
              { label: 'Gross Revenue', value: formatCurrency(report.grossRevenueBdt) },
              { label: 'Delivered Revenue', value: formatCurrency(report.deliveredRevenueBdt) },
              { label: 'Estimated Gross Profit', value: formatCurrency(report.estimatedGrossProfitBdt) },
              { label: 'Estimated Net Profit', value: formatCurrency(report.estimatedNetProfitBdt) },
              { label: 'COD Pending Collection', value: formatCurrency(report.codPendingCollectionBdt) },
              { label: 'Settled Payments', value: formatCurrency(report.paymentSettledBdt) },
              { label: 'Delivery + Gateway + Ops', value: formatCurrency(report.deliveryExpensesBdt + report.gatewayFeesBdt + report.operatingExpensesBdt) },
              { label: `Inventory Cost (${report.inventoryValuation.totalUnitsOnHand} units)`, value: formatCurrency(report.inventoryValuation.costValuationBdt) },
            ].map((kpi) => (
              <Card key={kpi.label} className="space-y-1">
                <p className="text-xs text-brand-charcoal-muted">{kpi.label}</p>
                <p className="text-xl font-semibold text-brand-charcoal">{kpi.value}</p>
              </Card>
            ))}
          </div>

          {report.monthlyBreakdown.length > 0 && (
            <Card padding="none" className="overflow-x-auto">
              <div className="px-4 py-3 border-b border-brand-border">
                <h3 className="text-sm font-semibold">Monthly Revenue & Expense Breakdown</h3>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-brand-ivory-muted border-b border-brand-border text-brand-charcoal-muted">
                  <tr>
                    <th className="px-4 py-2.5">Month</th>
                    <th className="px-4 py-2.5 text-right">Orders</th>
                    <th className="px-4 py-2.5 text-right">Revenue</th>
                    <th className="px-4 py-2.5 text-right">Refunds</th>
                    <th className="px-4 py-2.5 text-right">Operating Expenses</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border tabular-nums">
                  {report.monthlyBreakdown.map((m) => (
                    <tr key={m.month} className="h-10">
                      <td className="px-4 py-2 font-mono font-medium">{m.month}</td>
                      <td className="px-4 py-2 text-right">{m.ordersCount}</td>
                      <td className="px-4 py-2 text-right font-semibold">{formatCurrency(m.revenueBdt)}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(m.refundsBdt)}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(m.expensesBdt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {/* Payments Ledger */}
      <Card padding="none" className="overflow-x-auto">
        <div className="px-4 py-3 border-b border-brand-border">
          <h2 className="font-display text-lg font-semibold">Payments & COD Reconciliation Ledger</h2>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-brand-ivory-muted border-b border-brand-border text-brand-charcoal-muted">
            <tr>
              <th className="px-4 py-2.5">Order</th>
              <th className="px-4 py-2.5">Provider</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Amount</th>
              <th className="px-4 py-2.5 text-right">Net</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border tabular-nums">
            {payments.map((p) => (
              <tr key={p.id} className="h-11">
                <td className="px-4 py-2">
                  <p className="font-mono font-semibold text-brand-burgundy">{p.order?.orderNumber || p.orderId.slice(0, 8)}</p>
                  <p className="text-[11px] text-brand-charcoal-muted">{p.order?.guestName}</p>
                </td>
                <td className="px-4 py-2 font-mono">{p.provider}</td>
                <td className="px-4 py-2">
                  <Badge variant={p.status === 'PAID' ? 'success' : p.status === 'FAILED' ? 'error' : 'warning'}>
                    {p.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right font-semibold">{formatCurrency(Number(p.amountBdt))}</td>
                <td className="px-4 py-2 text-right">{p.netAmountBdt ? formatCurrency(Number(p.netAmountBdt)) : '—'}</td>
                <td className="px-4 py-2 text-right space-x-2">
                  {p.provider === 'COD' && p.status !== 'PAID' && (
                    <Button size="sm" variant="secondary" onClick={() => void handleCodCollect(p)}>
                      Collect COD
                    </Button>
                  )}
                  {p.provider !== 'COD' && p.status !== 'PAID' && (
                    <Button size="sm" variant="secondary" onClick={() => void handleManualVerify(p, 'PAID')}>
                      Verify Paid
                    </Button>
                  )}
                  {(p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRefundTarget(p);
                        setRefundAmount(p.amountBdt);
                      }}
                    >
                      Refund
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Refunds & Business Expenses */}
      {(refunds.length > 0 || expenses.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card padding="none" className="overflow-x-auto">
            <div className="px-4 py-3 border-b border-brand-border">
              <h3 className="text-sm font-semibold">Recent Refunds ({refunds.length})</h3>
            </div>
            <div className="divide-y divide-brand-border text-xs">
              {refunds.slice(0, 8).map((r) => (
                <div key={r.id} className="px-4 py-2.5 flex justify-between gap-2">
                  <div>
                    <p className="font-mono font-semibold">{r.refundRef || r.id.slice(0, 8)} · {r.order?.orderNumber}</p>
                    <p className="text-brand-charcoal-muted">{r.reason}</p>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="font-semibold">{formatCurrency(Number(r.amountBdt))}</p>
                    <p className="text-brand-charcoal-muted">{r.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card padding="none" className="overflow-x-auto">
            <div className="px-4 py-3 border-b border-brand-border">
              <h3 className="text-sm font-semibold">Business Expenses ({expenses.length})</h3>
            </div>
            <div className="divide-y divide-brand-border text-xs">
              {expenses.slice(0, 8).map((ex) => (
                <div key={ex.id} className="px-4 py-2.5 flex justify-between gap-2">
                  <div>
                    <p className="font-semibold">{ex.title}</p>
                    <p className="text-brand-charcoal-muted">{ex.category} · {formatDate(ex.expenseDate, 'short')}</p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatCurrency(Number(ex.amountBdt))}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Refund Modal */}
      <Modal
        isOpen={Boolean(refundTarget)}
        onClose={() => setRefundTarget(null)}
        title={`Process Refund · ${refundTarget?.order?.orderNumber || ''}`}
        size="sm"
      >
        <form onSubmit={handleRefundSubmit} className="space-y-3">
          <FormField id="rf-amt" label="Refund Amount (BDT)" required>
            <Input
              id="rf-amt"
              type="number"
              min="1"
              step="0.01"
              required
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
            />
          </FormField>
          <FormField id="rf-rsn" label="Reason" required>
            <Input
              id="rf-rsn"
              required
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Size exchange / return approved"
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setRefundTarget(null)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit">Approve Refund</Button>
          </div>
        </form>
      </Modal>

      {/* Expense Modal */}
      <Modal isOpen={expOpen} onClose={() => setExpOpen(false)} title="Record Business Expense" size="sm">
        <form onSubmit={handleExpenseSubmit} className="space-y-3">
          <FormField id="exp-cat" label="Category">
            <Select
              id="exp-cat"
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value as typeof expCategory)}
              options={[
                { value: 'PACKAGING', label: 'Discreet Packaging Supplies' },
                { value: 'MARKETING', label: 'Marketing / Ads' },
                { value: 'COURIER_ADJUSTMENT', label: 'Courier Adjustment' },
                { value: 'OPERATIONS', label: 'Operations' },
                { value: 'STAFF', label: 'Staff / Fulfillment' },
                { value: 'OTHER', label: 'Other' },
              ]}
            />
          </FormField>
          <FormField id="exp-title" label="Description" required>
            <Input id="exp-title" required value={expTitle} onChange={(e) => setExpTitle(e.target.value)} />
          </FormField>
          <FormField id="exp-amt" label="Amount (BDT)" required>
            <Input id="exp-amt" type="number" min="0" step="0.01" required value={expAmount} onChange={(e) => setExpAmount(e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setExpOpen(false)}>{messages.common.cancel}</Button>
            <Button type="submit">{messages.common.save}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

interface CourierProviderInfo {
  provider: string;
  enabled: boolean;
  credentialsConfigured: boolean;
  connectionStatus: string;
  note: string;
}

interface ShipmentRow {
  id: string;
  orderId: string;
  provider: string;
  consignmentId: string | null;
  trackingCode: string | null;
  status: string;
  discreetLabel: boolean;
  deliveryChargeBdt: string;
  codCollectedBdt: string;
  codSettled: boolean;
  connectionMode: string;
  order: { orderNumber: string; guestName: string; deliveryZone: string } | null;
}

export function AdminCouriersSection() {
  const { messages, formatCurrency } = useLocale();
  const { showToast } = useToast();

  const [providers, setProviders] = useState<CourierProviderInfo[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [performance, setPerformance] = useState<
    Record<string, { total: number; delivered: number; failed: number; returned: number; codSettledBdt: number; deliveryCostBdt: number }>
  >({});
  const [orders, setOrders] = useState<{ id: string; orderNumber: string; guestName: string; totalBdt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bookOpen, setBookOpen] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [provider, setProvider] = useState<'PATHAO' | 'STEADFAST' | 'REDX' | 'PAPERFLY' | 'ECOURIER' | 'MANUAL'>('STEADFAST');
  const [discreetLabel, setDiscreetLabel] = useState(true);

  const loadCouriers = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, oRes] = await Promise.all([
        apiClient.get<{
          providers: CourierProviderInfo[];
          shipments: ShipmentRow[];
          performanceByProvider: typeof performance;
        }>('/api/v1/admin/couriers'),
        apiClient.get<{ orders: typeof orders }>('/api/v1/admin/orders'),
      ]);
      setProviders(cRes.providers ?? []);
      setShipments(cRes.shipments ?? []);
      setPerformance(cRes.performanceByProvider ?? {});
      setOrders(oRes.orders ?? []);
      if (oRes.orders?.[0] && !orderId) setOrderId(oRes.orders[0].id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [messages.common.errorGeneric, orderId]);

  useEffect(() => {
    void loadCouriers();
  }, [loadCouriers]);

  const handleCreateParcel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/api/v1/admin/shipments', {
        orderId,
        provider,
        discreetLabel,
      });
      setBookOpen(false);
      showToast({ title: 'Discreet courier parcel booked', variant: 'success' });
      await loadCouriers();
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  if (loading) return <LoadingIndicator label={messages.common.loading} />;
  if (error) return <Alert variant="error">{error}</Alert>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-3">
        <h2 className="font-display text-xl font-semibold">Courier Adapters & Discreet Parcels</h2>
        <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setBookOpen(true)}>
          Create Parcel
        </Button>
      </div>

      {/* Adapter Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {providers.map((p) => (
          <Card key={p.provider} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{p.provider}</span>
              <Badge variant={p.credentialsConfigured ? 'success' : 'warning'}>{p.connectionStatus}</Badge>
            </div>
            <p className="text-xs text-brand-charcoal-muted">{p.note}</p>
          </Card>
        ))}
      </div>

      {/* Provider Performance */}
      {Object.keys(performance).length > 0 && (
        <Card padding="none" className="overflow-x-auto">
          <div className="px-4 py-3 border-b border-brand-border">
            <h3 className="text-sm font-semibold">Courier Performance Report</h3>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-brand-ivory-muted border-b border-brand-border text-brand-charcoal-muted">
              <tr>
                <th className="px-4 py-2.5">Provider</th>
                <th className="px-4 py-2.5 text-right">Parcels</th>
                <th className="px-4 py-2.5 text-right">Delivered</th>
                <th className="px-4 py-2.5 text-right">Failed</th>
                <th className="px-4 py-2.5 text-right">Returned</th>
                <th className="px-4 py-2.5 text-right">COD Settled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border tabular-nums">
              {Object.entries(performance).map(([prov, stats]) => (
                <tr key={prov} className="h-10">
                  <td className="px-4 py-2 font-mono font-semibold">{prov}</td>
                  <td className="px-4 py-2 text-right">{stats.total}</td>
                  <td className="px-4 py-2 text-right">{stats.delivered}</td>
                  <td className="px-4 py-2 text-right">{stats.failed}</td>
                  <td className="px-4 py-2 text-right">{stats.returned}</td>
                  <td className="px-4 py-2 text-right font-semibold">{formatCurrency(stats.codSettledBdt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Shipments Table */}
      <Card padding="none" className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-brand-ivory-muted border-b border-brand-border text-brand-charcoal-muted">
            <tr>
              <th className="px-4 py-2.5">Order / Tracking</th>
              <th className="px-4 py-2.5">Courier</th>
              <th className="px-4 py-2.5">Discreet Label</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Update / Settle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border tabular-nums">
            {shipments.map((s) => (
              <tr key={s.id} className="h-11">
                <td className="px-4 py-2">
                  <p className="font-mono font-semibold text-brand-burgundy">{s.order?.orderNumber || s.orderId.slice(0, 8)}</p>
                  <p className="font-mono text-[11px] text-brand-charcoal-muted">{s.trackingCode}</p>
                </td>
                <td className="px-4 py-2 font-mono">{s.provider}</td>
                <td className="px-4 py-2">{s.discreetLabel ? 'Plain Discreet' : 'Standard'}</td>
                <td className="px-4 py-2">
                  <Badge variant={s.status === 'DELIVERED' ? 'success' : s.status === 'FAILED_DELIVERY' ? 'error' : 'burgundy'}>
                    {s.status.replace(/_/g, ' ')}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  <Select
                    aria-label="Update shipment status"
                    value={s.status}
                    onChange={async (e) => {
                      await apiClient.patch(`/api/v1/admin/shipments/${s.id}/status`, {
                        status: e.target.value,
                      });
                      await loadCouriers();
                    }}
                    className="inline-block w-40 min-h-8 py-1 text-xs"
                    options={[
                      { value: 'BOOKED', label: 'Booked' },
                      { value: 'PICKED_UP', label: 'Picked Up' },
                      { value: 'IN_TRANSIT', label: 'In Transit' },
                      { value: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
                      { value: 'DELIVERED', label: 'Delivered' },
                      { value: 'FAILED_DELIVERY', label: 'Failed Delivery' },
                      { value: 'RETURN_INITIATED', label: 'Return Initiated' },
                      { value: 'RETURNED', label: 'Returned' },
                      { value: 'EXCHANGE_REQUESTED', label: 'Exchange Requested' },
                    ]}
                  />
                  {!s.codSettled && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        await apiClient.post(`/api/v1/admin/shipments/${s.id}/settle`, {
                          codCollectedBdt: Number(s.codCollectedBdt) || 1000,
                        });
                        showToast({ title: 'Courier COD settled', variant: 'success' });
                        await loadCouriers();
                      }}
                    >
                      Settle COD
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal isOpen={bookOpen} onClose={() => setBookOpen(false)} title="Book Discreet Courier Parcel" size="sm">
        <form onSubmit={handleCreateParcel} className="space-y-3">
          <FormField id="sh-ord" label="Order" required>
            <Select
              id="sh-ord"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              options={orders.map((o) => ({
                value: o.id,
                label: `${o.orderNumber} · ${o.guestName} (${formatCurrency(Number(o.totalBdt))})`,
              }))}
            />
          </FormField>
          <FormField id="sh-prov" label="Courier Provider">
            <Select
              id="sh-prov"
              value={provider}
              onChange={(e) => setProvider(e.target.value as typeof provider)}
              options={[
                { value: 'STEADFAST', label: 'Steadfast' },
                { value: 'PATHAO', label: 'Pathao' },
                { value: 'REDX', label: 'REDX' },
                { value: 'PAPERFLY', label: 'Paperfly' },
                { value: 'ECOURIER', label: 'eCourier' },
                { value: 'MANUAL', label: 'Manual Dispatch' },
              ]}
            />
          </FormField>
          <Checkbox
            id="sh-disc"
            label="Enforce Discreet Parcel Label (hide item details)"
            checked={discreetLabel}
            onChange={(e) => setDiscreetLabel(e.target.checked)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setBookOpen(false)}>{messages.common.cancel}</Button>
            <Button type="submit">Book Parcel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
