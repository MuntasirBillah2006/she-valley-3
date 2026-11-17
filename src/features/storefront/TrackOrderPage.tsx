import { useEffect, useState } from 'react';
import { MessageCircle, ShieldCheck, Truck } from 'lucide-react';
import { Alert } from '@/src/components/feedback/Alert';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { FormField } from '@/src/components/ui/FormField';
import { Input } from '@/src/components/ui/Input';
import { useLocale } from '@/src/hooks/useLocale';
import { useRouter } from '@/src/hooks/useRouter';
import { buildWhatsAppHref } from '@/src/lib/analytics';
import { apiClient, type StorefrontBootstrapData } from '@/src/lib/apiClient';

interface TrackedOrderResult {
  order: {
    orderNumber: string;
    status: string;
    paymentMethod: string;
    paymentStatus: string;
    subtotalBdt: number;
    deliveryFeeBdt: number;
    totalBdt: number;
    deliveryZone: string;
    isDiscreetPackaging: boolean;
    districtSummary: string;
    createdAt: string;
  };
  items: {
    id: string;
    productNameSnapshotEn: string;
    productNameSnapshotBn: string;
    variantLabelSnapshot: string;
    quantity: number;
    lineTotalBdt: string;
  }[];
  timeline: {
    id: string;
    toStatus: string;
    note: string;
    createdAt: string;
  }[];
  shipment?: {
    provider: string;
    trackingCode: string;
    consignmentId: string;
    status: string;
    connectionMode: string;
  } | null;
}

export function TrackOrderPage({
  contactSocial,
}: {
  contactSocial?: StorefrontBootstrapData['contactSocial'];
}) {
  const { locale, messages, formatCurrency, formatDate } = useLocale();
  const { search } = useRouter();
  const params = new URLSearchParams(search);
  const whatsappNumber = contactSocial?.whatsappNumber || '01828-298143';

  const [orderNumber, setOrderNumber] = useState(params.get('order') || '');
  const [phone, setPhone] = useState(params.get('phone') || '');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<TrackedOrderResult | null>(null);

  const lookup = async (ordNo: string, ph: string) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const data = await apiClient.post<TrackedOrderResult>('/api/v1/orders/track', {
        orderNumber: ordNo.trim(),
        phone: ph.trim(),
      });
      setResult(data);
    } catch (err) {
      setResult(null);
      setErrorMsg(err instanceof Error ? err.message : messages.common.noResults);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const o = params.get('order');
    const p = params.get('phone');
    if (o && p) {
      void lookup(o, p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void lookup(orderNumber, phone);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="font-display text-4xl font-semibold text-brand-charcoal">
          {messages.tracking.title}
        </h1>
        <p className="text-sm text-brand-charcoal-muted max-w-xl mx-auto">
          {messages.tracking.subtitle}
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
          <div className="sm:col-span-5">
            <FormField id="trk-order" label={messages.tracking.orderNumber} required>
              <Input
                id="trk-order"
                required
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="SV-2026..."
              />
            </FormField>
          </div>
          <div className="sm:col-span-4">
            <FormField id="trk-phone" label={messages.tracking.phone} required>
              <Input
                id="trk-phone"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
              />
            </FormField>
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" fullWidth isLoading={loading}>
              {messages.tracking.submit}
            </Button>
          </div>
        </form>
      </Card>

      {errorMsg && <Alert variant="error">{errorMsg}</Alert>}

      {result && (
        <Card className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border pb-4">
            <div>
              <p className="text-xs text-brand-charcoal-muted">{messages.checkout.orderNumberLabel}</p>
              <p className="font-mono text-lg font-semibold text-brand-burgundy">
                {result.order.orderNumber}
              </p>
            </div>
            <Badge variant="burgundy">{result.order.status.replace(/_/g, ' ')}</Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-brand-charcoal-muted">{messages.checkout.total}</p>
              <p className="font-semibold tabular-nums">{formatCurrency(result.order.totalBdt)}</p>
            </div>
            <div>
              <p className="text-xs text-brand-charcoal-muted">{messages.checkout.paymentSection}</p>
              <p className="font-medium">{result.order.paymentMethod}</p>
            </div>
            <div>
              <p className="text-xs text-brand-charcoal-muted">{messages.checkout.district}</p>
              <p className="font-medium">{result.order.districtSummary}</p>
            </div>
            <div>
              <p className="text-xs text-brand-charcoal-muted">Date</p>
              <p className="font-medium">{formatDate(result.order.createdAt, 'medium')}</p>
            </div>
          </div>

          {result.order.isDiscreetPackaging && (
            <div className="flex items-center gap-2 text-xs text-status-success-fg">
              <ShieldCheck className="h-4 w-4" />
              <span>{messages.tracking.discreetActive}</span>
            </div>
          )}

          {result.shipment && (
            <div className="rounded-xl bg-brand-ivory p-4 border border-brand-border flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Truck className="h-4 w-4 text-brand-burgundy shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-brand-charcoal">
                    {result.shipment.provider} · {result.shipment.status.replace(/_/g, ' ')}
                  </p>
                  <p className="font-mono text-brand-charcoal-muted">
                    Tracking: {result.shipment.trackingCode}
                  </p>
                </div>
              </div>
              <span className="font-mono text-[11px] text-brand-charcoal-muted">
                {result.shipment.connectionMode}
              </span>
            </div>
          )}

          <div className="border-t border-brand-border pt-4 space-y-2">
            {result.items.map((it) => (
              <div key={it.id} className="flex justify-between text-sm">
                <span>
                  {locale === 'bn' ? it.productNameSnapshotBn : it.productNameSnapshotEn} ({it.variantLabelSnapshot}) × {it.quantity}
                </span>
                <span className="tabular-nums font-medium">{formatCurrency(Number(it.lineTotalBdt))}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-brand-border pt-4 space-y-3">
            <h2 className="font-display text-xl font-semibold">{messages.tracking.timelineTitle}</h2>
            <div className="space-y-2.5">
              {result.timeline.map((step) => (
                <div key={step.id} className="flex items-start justify-between gap-4 text-sm">
                  <div>
                    <p className="font-medium text-brand-charcoal">{step.toStatus.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-brand-charcoal-muted">{step.note}</p>
                  </div>
                  <span className="text-xs text-brand-charcoal-muted shrink-0">
                    {formatDate(step.createdAt, 'short')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-brand-border pt-4 flex justify-end">
            <a
              href={buildWhatsAppHref(
                whatsappNumber,
                `Hi SHE-VALLEY, checking status for Order #${result.order.orderNumber}.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-brand-border bg-brand-ivory px-4 py-2 text-xs font-medium text-brand-charcoal hover:bg-brand-ivory-muted"
            >
              <MessageCircle className="h-4 w-4 text-brand-burgundy" aria-hidden="true" />
              <span>{messages.social.orderInquiryWhatsapp}</span>
            </a>
          </div>
        </Card>
      )}
    </div>
  );
}
