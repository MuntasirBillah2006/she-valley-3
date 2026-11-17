import { useEffect, useState } from 'react';
import { Alert } from '@/src/components/feedback/Alert';
import { LoadingIndicator } from '@/src/components/feedback/LoadingIndicator';
import { Badge } from '@/src/components/ui/Badge';
import { Card } from '@/src/components/ui/Card';
import { useLocale } from '@/src/hooks/useLocale';
import { apiClient } from '@/src/lib/apiClient';

interface OverviewPayload {
  kpis: {
    totalOrders: number;
    grossSalesBdt: number;
    pendingVerification: number;
    activeFulfillment: number;
    deliveredOrders: number;
    cancelledOrReturned: number;
    activeProducts: number;
    lowStockCount: number;
  };
  lowStockAlerts: {
    inventoryId: string;
    variantId: string;
    sku: string;
    size: string;
    colorName: string;
    availableQty: number;
    lowStockThreshold: number;
    productSlug: string;
  }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    guestName: string;
    guestPhone: string;
    status: string;
    totalBdt: string;
    createdAt: string;
  }[];
  recentActivity: {
    id: string;
    actorEmail: string | null;
    actorRole: string;
    action: string;
    entityType: string;
    createdAt: string;
  }[];
}

export function AdminOverviewSection({ onNavigateTab }: { onNavigateTab: (tab: string) => void }) {
  const { messages, formatCurrency, formatDate } = useLocale();
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<OverviewPayload>('/api/v1/admin/overview')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : messages.common.errorGeneric));
  }, [messages.common.errorGeneric]);

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!data) return <LoadingIndicator label={messages.common.loading} />;

  const kpiItems = [
    { label: messages.admin.totalOrders, value: String(data.kpis.totalOrders) },
    { label: messages.admin.grossSales, value: formatCurrency(data.kpis.grossSalesBdt) },
    { label: messages.admin.pendingVerification, value: String(data.kpis.pendingVerification) },
    { label: messages.admin.activeProducts, value: String(data.kpis.activeProducts) },
  ];

  return (
    <div className="space-y-6">
      {/* Real DB KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiItems.map((k) => (
          <Card key={k.label} padding="sm" className="space-y-1">
            <p className="text-xs text-brand-charcoal-muted">{k.label}</p>
            <p className="font-mono text-2xl font-semibold text-brand-charcoal tabular-nums">
              {k.value}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Low Stock Alerts */}
        <Card className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">
              {messages.admin.lowStockAlerts} ({data.lowStockAlerts.length})
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTab('inventory')}
              className="text-xs font-medium text-brand-burgundy hover:underline cursor-pointer"
            >
              {messages.admin.inventory} →
            </button>
          </div>
          {data.lowStockAlerts.length === 0 ? (
            <p className="text-sm text-brand-charcoal-muted">All active SKUs are above low-stock thresholds.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-brand-border text-brand-charcoal-muted">
                  <tr>
                    <th className="py-2 pr-3">SKU</th>
                    <th className="py-2 pr-3">Variant</th>
                    <th className="py-2 text-right">Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border tabular-nums">
                  {data.lowStockAlerts.map((item) => (
                    <tr key={item.variantId} className="h-9">
                      <td className="py-2 pr-3 font-mono font-medium">{item.sku}</td>
                      <td className="py-2 pr-3">{item.size} · {item.colorName}</td>
                      <td className="py-2 text-right font-semibold text-status-warning-fg">
                        {item.availableQty}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Recent Orders */}
        <Card className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">{messages.admin.orders}</h2>
            <button
              type="button"
              onClick={() => onNavigateTab('orders')}
              className="text-xs font-medium text-brand-burgundy hover:underline cursor-pointer"
            >
              {messages.common.viewAll} →
            </button>
          </div>
          {data.recentOrders.length === 0 ? (
            <p className="text-sm text-brand-charcoal-muted">No orders placed yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-brand-border text-brand-charcoal-muted">
                  <tr>
                    <th className="py-2 pr-3">Order</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border tabular-nums">
                  {data.recentOrders.map((ord) => (
                    <tr key={ord.id} className="h-9">
                      <td className="py-2 pr-3 font-mono font-medium">{ord.orderNumber}</td>
                      <td className="py-2 pr-3">{ord.guestName}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="neutral">{ord.status.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="py-2 text-right font-medium">
                        {formatCurrency(Number(ord.totalBdt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Recent Audit Activity */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">{messages.admin.auditLogs}</h2>
          <button
            type="button"
            onClick={() => onNavigateTab('audit')}
            className="text-xs font-medium text-brand-burgundy hover:underline cursor-pointer"
          >
            {messages.common.viewAll} →
          </button>
        </div>
        <div className="divide-y divide-brand-border text-xs">
          {data.recentActivity.slice(0, 6).map((act) => (
            <div key={act.id} className="py-2 flex items-center justify-between gap-4">
              <div>
                <span className="font-mono font-medium text-brand-burgundy">{act.action}</span>
                <span className="text-brand-charcoal-muted"> · {act.actorEmail || act.actorRole} · {act.entityType}</span>
              </div>
              <span className="text-brand-charcoal-muted shrink-0">{formatDate(act.createdAt, 'short')}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
