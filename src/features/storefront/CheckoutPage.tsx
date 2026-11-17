import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, MessageCircle, ShieldCheck } from 'lucide-react';
import { Alert } from '@/src/components/feedback/Alert';
import { EmptyState } from '@/src/components/feedback/EmptyState';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { Checkbox } from '@/src/components/ui/Checkbox';
import { FormField } from '@/src/components/ui/FormField';
import { Input } from '@/src/components/ui/Input';
import { Select } from '@/src/components/ui/Select';
import { Textarea } from '@/src/components/ui/Textarea';
import {
  BANGLADESH_DIVISIONS,
  BD_PHONE_REGEX,
  DEFAULT_DELIVERY_CHARGES,
  calculateDeliveryFeeBdt,
  inferDeliveryZone,
  type DeliveryChargeConfig,
} from '@/src/config/bangladesh';
import { useAuth } from '@/src/hooks/useAuth';
import { useCart } from '@/src/hooks/useCart';
import { useLocale } from '@/src/hooks/useLocale';
import { useRouter } from '@/src/hooks/useRouter';
import { buildWhatsAppHref, trackMarketingEvent } from '@/src/lib/analytics';
import {
  apiClient,
  type PaymentMethodSummary,
  type StorefrontBootstrapData,
} from '@/src/lib/apiClient';

interface SavedAddress {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  division: string;
  district: string;
  upazilaOrArea: string;
  streetAddress: string;
  postalCode?: string | null;
}

interface ConfirmedOrder {
  id: string;
  orderNumber: string;
  totalBdt: string | number;
  deliveryZone: string;
  paymentMethod: 'COD' | 'BKASH' | 'NAGAD' | 'SSLCOMMERZ';
  paymentStatus: string;
  isDiscreetPackaging: boolean;
  guestPhone: string;
}

interface InitiatedPaymentState {
  paymentId: string;
  provider: string;
  mode: string;
  status: string;
  instructions: string;
  gatewayTransactionId?: string | null;
}

export function CheckoutPage({
  deliveryConfig = DEFAULT_DELIVERY_CHARGES,
  contactSocial,
}: {
  deliveryConfig?: DeliveryChargeConfig;
  contactSocial?: StorefrontBootstrapData['contactSocial'];
}) {
  const { locale, messages, formatCurrency } = useLocale();
  const { navigate } = useRouter();
  const { user } = useAuth();
  const { cart, refreshCart } = useCart();

  const [customerName, setCustomerName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [division, setDivision] = useState<string>('Dhaka');
  const [district, setDistrict] = useState<string>('Dhaka');
  const [upazilaOrArea, setUpazilaOrArea] = useState<string>('Dhanmondi');
  const [streetAddress, setStreetAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [isDiscreetPackaging, setIsDiscreetPackaging] = useState(true);
  const [customerNote, setCustomerNote] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSummary[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'BKASH' | 'NAGAD' | 'SSLCOMMERZ'>('COD');
  const [initiatedPayment, setInitiatedPayment] = useState<InitiatedPaymentState | null>(null);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrder | null>(null);
  const [idempotencyKey] = useState(() => `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    apiClient
      .get<{ methods: PaymentMethodSummary[] }>('/api/v1/payments/methods')
      .then((d) => setPaymentMethods(d.methods ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (cart.items.length > 0 && !confirmedOrder) {
      trackMarketingEvent({
        eventName: 'InitiateCheckout',
        valueBdt: cart.subtotalBdt,
        metadata: { itemCount: cart.itemCount },
      });
    }
  }, [cart.items.length, cart.subtotalBdt, cart.itemCount, confirmedOrder]);

  useEffect(() => {
    if (user) {
      if (!customerName) setCustomerName(user.fullName);
      if (!phone && user.phone) setPhone(user.phone);
      if (!email) setEmail(user.email);
      apiClient
        .get<{ addresses: SavedAddress[] }>('/api/v1/account/addresses')
        .then((d) => setSavedAddresses(d.addresses ?? []))
        .catch(() => undefined);
    }
  }, [user, customerName, phone, email]);

  const divisionObj = useMemo(
    () => BANGLADESH_DIVISIONS.find((d) => d.nameEn === division) ?? BANGLADESH_DIVISIONS[0],
    [division],
  );
  const districtObj = useMemo(
    () => divisionObj.districts.find((dist) => dist.nameEn === district) ?? divisionObj.districts[0],
    [divisionObj, district],
  );

  const deliveryZone = useMemo(
    () => inferDeliveryZone(districtObj.nameEn, upazilaOrArea),
    [districtObj.nameEn, upazilaOrArea],
  );
  const deliveryFeeBdt = useMemo(
    () => calculateDeliveryFeeBdt(deliveryZone, cart.subtotalBdt, deliveryConfig),
    [deliveryZone, cart.subtotalBdt, deliveryConfig],
  );
  const totalBdt = cart.subtotalBdt + deliveryFeeBdt;
  const whatsappNumber = contactSocial?.whatsappNumber || '01828-298143';

  const applySavedAddress = (addrId: string) => {
    const found = savedAddresses.find((a) => a.id === addrId);
    if (!found) return;
    setCustomerName(found.recipientName);
    setPhone(found.phone);
    setDivision(found.division);
    setDistrict(found.district);
    setUpazilaOrArea(found.upazilaOrArea);
    setStreetAddress(found.streetAddress);
    setPostalCode(found.postalCode || '');
  };

  const handleServerSideVerify = async (outcome: 'PAID' | 'FAILED') => {
    if (!initiatedPayment || !confirmedOrder) return;
    setVerifyingPayment(true);
    setErrorMsg(null);
    try {
      const res = await apiClient.post<{ payment: { status: string } }>('/api/v1/payments/verify', {
        paymentId: initiatedPayment.paymentId,
        outcome,
        failureReason: outcome === 'FAILED' ? 'Sandbox customer cancelled payment verification' : undefined,
      });
      setInitiatedPayment((prev) => (prev ? { ...prev, status: res.payment.status } : null));
      setConfirmedOrder((prev) => (prev ? { ...prev, paymentStatus: res.payment.status } : null));
      if (res.payment.status === 'PAID') {
        trackMarketingEvent({
          eventName: 'Purchase',
          orderId: confirmedOrder.id,
          orderNumber: confirmedOrder.orderNumber,
          valueBdt: Number(confirmedOrder.totalBdt),
          metadata: { paymentMethod: confirmedOrder.paymentMethod },
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : messages.common.errorGeneric);
    } finally {
      setVerifyingPayment(false);
    }
  };

  if (confirmedOrder) {
    const isPendingOnline =
      confirmedOrder.paymentMethod !== 'COD' && confirmedOrder.paymentStatus !== 'PAID';

    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-14 space-y-5">
        <Card className="text-center space-y-5 p-8">
          <div className="mx-auto h-12 w-12 rounded-full bg-status-success-bg text-status-success-fg flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-semibold text-brand-charcoal">
              {messages.checkout.confirmedTitle}
            </h1>
            <p className="text-sm text-brand-charcoal-muted">{messages.checkout.confirmedSubtitle}</p>
          </div>

          <div className="rounded-xl bg-brand-ivory p-5 border border-brand-border space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-brand-charcoal-muted">{messages.checkout.orderNumberLabel}</span>
              <span className="font-mono font-semibold text-brand-burgundy">{confirmedOrder.orderNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-brand-charcoal-muted">{messages.checkout.total}</span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(Number(confirmedOrder.totalBdt))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-brand-charcoal-muted">{messages.checkout.paymentSection}</span>
              <span>
                {confirmedOrder.paymentMethod} · {confirmedOrder.paymentStatus}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-brand-charcoal-muted">{messages.checkout.deliveryZone}</span>
              <span>{confirmedOrder.deliveryZone.replace('_', ' ')}</span>
            </div>
          </div>

          {initiatedPayment && isPendingOnline && (
            <div className="text-left rounded-xl border border-brand-border bg-brand-ivory-muted/50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-brand-burgundy">
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                <span>
                  {initiatedPayment.provider} · {initiatedPayment.mode}
                </span>
              </div>
              <p className="text-xs text-brand-charcoal-muted leading-relaxed">
                {initiatedPayment.instructions}
              </p>
              {errorMsg && <Alert variant="error">{errorMsg}</Alert>}
              {initiatedPayment.status === 'FAILED' ? (
                <Alert variant="warning">
                  {locale === 'bn'
                    ? 'পেমেন্ট যাচাই ব্যর্থ হয়েছে। আপনি পুনরায় চেষ্টা করতে পারেন অথবা COD-এর জন্য আমাদের সাথে যোগাযোগ করুন।'
                    : 'Payment verification failed. You may retry verification or coordinate COD with our care team.'}
                </Alert>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  isLoading={verifyingPayment}
                  onClick={() => void handleServerSideVerify('PAID')}
                >
                  {locale === 'bn' ? 'সার্ভার-সাইড পেমেন্ট যাচাই (Paid)' : 'Verify Server-Side Payment (Paid)'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  isLoading={verifyingPayment}
                  onClick={() => void handleServerSideVerify('FAILED')}
                >
                  {locale === 'bn' ? 'ব্যর্থ পেমেন্ট পরীক্ষা' : 'Simulate Failure'}
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button
              onClick={() =>
                navigate(
                  `/track-order?order=${encodeURIComponent(confirmedOrder.orderNumber)}&phone=${encodeURIComponent(confirmedOrder.guestPhone)}`,
                )
              }
            >
              {messages.checkout.trackThisOrder}
            </Button>
            <a
              href={buildWhatsAppHref(
                whatsappNumber,
                `Hi SHE-VALLEY, I placed Order #${confirmedOrder.orderNumber} (${formatCurrency(Number(confirmedOrder.totalBdt))}).`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-brand-border bg-brand-ivory-elevated px-4 py-2 text-xs font-medium text-brand-charcoal hover:bg-brand-ivory-muted"
            >
              <MessageCircle className="h-4 w-4 text-brand-burgundy" aria-hidden="true" />
              <span>{messages.social.orderInquiryWhatsapp}</span>
            </a>
            <Button variant="secondary" onClick={() => navigate('/shop')}>
              {messages.cart.continueShopping}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16">
        <EmptyState
          title={messages.cart.emptyTitle}
          description={messages.cart.emptyDesc}
          action={<Button onClick={() => navigate('/shop')}>{messages.cart.continueShopping}</Button>}
        />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (customerName.trim().length < 2 || !BD_PHONE_REGEX.test(phone.trim())) {
      setErrorMsg(messages.common.validationError);
      return;
    }
    if (streetAddress.trim().length < 5) {
      setErrorMsg('Please enter house, road, and flat details.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiClient.post<{ order: ConfirmedOrder }>(
        '/api/v1/orders',
        {
          customerName: customerName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          division: divisionObj.nameEn,
          district: districtObj.nameEn,
          upazilaOrArea,
          streetAddress: streetAddress.trim(),
          postalCode: postalCode.trim() || undefined,
          paymentMethod,
          isDiscreetPackaging,
          customerNote: customerNote.trim() || undefined,
          items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        },
        { 'Idempotency-Key': idempotencyKey },
      );

      if (paymentMethod !== 'COD') {
        const initRes = await apiClient.post<{
          payment: { id: string; status: string; gatewayTransactionId?: string | null };
          instructions: string;
          mode: string;
        }>(
          '/api/v1/payments/initiate',
          { orderId: data.order.id, provider: paymentMethod },
          { 'Idempotency-Key': `init_${idempotencyKey}` },
        );
        setInitiatedPayment({
          paymentId: initRes.payment.id,
          provider: paymentMethod,
          mode: initRes.mode,
          status: initRes.payment.status,
          instructions: initRes.instructions,
          gatewayTransactionId: initRes.payment.gatewayTransactionId,
        });
      } else {
        trackMarketingEvent({
          eventName: 'Purchase',
          orderId: data.order.id,
          orderNumber: data.order.orderNumber,
          valueBdt: Number(data.order.totalBdt),
          metadata: { paymentMethod: 'COD' },
        });
      }

      setConfirmedOrder(data.order);
      await refreshCart();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : messages.common.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 space-y-8">
      <div className="border-b border-brand-border pb-4 space-y-1">
        <h1 className="font-display text-4xl font-semibold text-brand-charcoal">
          {messages.checkout.title}
        </h1>
        <p className="text-sm text-brand-charcoal-muted">{messages.checkout.subtitle}</p>
      </div>

      {errorMsg && <Alert variant="error">{errorMsg}</Alert>}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-6">
          <Card className="space-y-4">
            <h2 className="font-display text-2xl font-semibold">{messages.checkout.contactSection}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField id="chk-name" label={messages.checkout.fullName} required>
                <Input
                  id="chk-name"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </FormField>
              <FormField id="chk-phone" label={messages.checkout.phone} required>
                <Input
                  id="chk-phone"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                />
              </FormField>
            </div>
            <FormField id="chk-email" label={messages.checkout.email}>
              <Input
                id="chk-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>
          </Card>

          <Card className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="font-display text-2xl font-semibold">
                {messages.checkout.addressSection}
              </h2>
              {savedAddresses.length > 0 && (
                <Select
                  aria-label={messages.checkout.savedAddresses}
                  defaultValue=""
                  onChange={(e) => applySavedAddress(e.target.value)}
                  options={[
                    { value: '', label: messages.checkout.savedAddresses },
                    ...savedAddresses.map((a) => ({
                      value: a.id,
                      label: `${a.label} — ${a.upazilaOrArea}, ${a.district}`,
                    })),
                  ]}
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField id="chk-div" label={messages.checkout.division} required>
                <Select
                  id="chk-div"
                  value={divisionObj.nameEn}
                  onChange={(e) => {
                    const nextDiv = BANGLADESH_DIVISIONS.find((d) => d.nameEn === e.target.value) ?? BANGLADESH_DIVISIONS[0];
                    setDivision(nextDiv.nameEn);
                    setDistrict(nextDiv.districts[0].nameEn);
                    setUpazilaOrArea(nextDiv.districts[0].areas[0]);
                  }}
                  options={BANGLADESH_DIVISIONS.map((d) => ({
                    value: d.nameEn,
                    label: locale === 'bn' ? d.nameBn : d.nameEn,
                  }))}
                />
              </FormField>

              <FormField id="chk-dist" label={messages.checkout.district} required>
                <Select
                  id="chk-dist"
                  value={districtObj.nameEn}
                  onChange={(e) => {
                    const nextDist = divisionObj.districts.find((d) => d.nameEn === e.target.value) ?? divisionObj.districts[0];
                    setDistrict(nextDist.nameEn);
                    setUpazilaOrArea(nextDist.areas[0]);
                  }}
                  options={divisionObj.districts.map((dist) => ({
                    value: dist.nameEn,
                    label: locale === 'bn' ? dist.nameBn : dist.nameEn,
                  }))}
                />
              </FormField>

              <FormField id="chk-area" label={messages.checkout.area} required>
                <Select
                  id="chk-area"
                  value={upazilaOrArea}
                  onChange={(e) => setUpazilaOrArea(e.target.value)}
                  options={districtObj.areas.map((a) => ({ value: a, label: a }))}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <FormField id="chk-street" label={messages.checkout.street} required>
                  <Input
                    id="chk-street"
                    required
                    value={streetAddress}
                    onChange={(e) => setStreetAddress(e.target.value)}
                  />
                </FormField>
              </div>
              <FormField id="chk-postal" label={messages.checkout.postalCode}>
                <Input
                  id="chk-postal"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                />
              </FormField>
            </div>
          </Card>

          <Card className="space-y-4">
            <h2 className="font-display text-2xl font-semibold">{messages.checkout.privacySection}</h2>
            <Checkbox
              id="chk-discreet"
              checked={isDiscreetPackaging}
              onChange={(e) => setIsDiscreetPackaging(e.target.checked)}
              label={messages.checkout.discreetPackaging}
            />
            <p className="text-xs text-brand-charcoal-muted flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-brand-burgundy shrink-0" />
              <span>{messages.checkout.discreetHelp}</span>
            </p>
            <FormField id="chk-note" label={messages.checkout.customerNote}>
              <Textarea
                id="chk-note"
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
              />
            </FormField>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-display text-2xl font-semibold">{messages.checkout.paymentSection}</h2>
            {paymentMethods.length === 0 ? (
              <div className="rounded-xl border-2 border-brand-burgundy bg-brand-burgundy-soft/30 p-4 space-y-1">
                <p className="text-sm font-semibold text-brand-charcoal">{messages.checkout.codTitle}</p>
                <p className="text-xs text-brand-charcoal-muted">{messages.checkout.codDesc}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {paymentMethods.map((m) => {
                  const selected = paymentMethod === m.provider;
                  const selectable = m.enabled && m.connectionStatus !== 'PENDING_CREDENTIALS';
                  return (
                    <label
                      key={m.provider}
                      className={`block rounded-xl border p-4 transition-colors ${
                        selected
                          ? 'border-2 border-brand-burgundy bg-brand-burgundy-soft/30'
                          : 'border-brand-border bg-brand-ivory'
                      } ${selectable ? 'cursor-pointer' : 'opacity-65 cursor-not-allowed'}`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={m.provider}
                          checked={selected}
                          disabled={!selectable}
                          onChange={() => setPaymentMethod(m.provider)}
                          className="mt-1 accent-brand-burgundy"
                        />
                        <div className="space-y-1 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-brand-charcoal">
                              {locale === 'bn' ? m.labelBn : m.label}
                            </span>
                            <span className="text-[11px] font-mono text-brand-charcoal-muted">
                              {m.connectionStatus.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-brand-charcoal-muted">{m.note}</p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <Card className="lg:col-span-5 space-y-5 lg:sticky lg:top-24">
          <h2 className="font-display text-2xl font-semibold">{messages.checkout.orderSummary}</h2>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {cart.items.map((item) => (
              <div key={item.variantId} className="flex justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {locale === 'bn' ? item.name.bn : item.name.en}
                  </p>
                  <p className="text-xs text-brand-charcoal-muted">
                    {item.size} · {item.colorName} × {item.quantity}
                  </p>
                </div>
                <span className="font-medium tabular-nums shrink-0">
                  {formatCurrency(item.lineTotalBdt)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-brand-border pt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-brand-charcoal-muted">{messages.cart.subtotal}</span>
              <span className="tabular-nums">{formatCurrency(cart.subtotalBdt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-brand-charcoal-muted">{messages.checkout.deliveryZone}</span>
              <span>{deliveryZone.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-brand-charcoal-muted">{messages.checkout.deliveryFee}</span>
              <span className="tabular-nums">
                {deliveryFeeBdt === 0 ? messages.checkout.free : formatCurrency(deliveryFeeBdt)}
              </span>
            </div>
            <div className="flex justify-between border-t border-brand-border pt-3 text-base font-semibold text-brand-charcoal">
              <span>{messages.checkout.total}</span>
              <span className="tabular-nums text-brand-burgundy">{formatCurrency(totalBdt)}</span>
            </div>
          </div>

          <Button type="submit" fullWidth size="lg" isLoading={submitting}>
            {paymentMethod === 'COD'
              ? messages.checkout.placeOrder
              : locale === 'bn'
                ? `${paymentMethod} অর্ডার নিশ্চিত করুন`
                : `Confirm Order (${paymentMethod})`}
          </Button>
        </Card>
      </form>
    </div>
  );
}
