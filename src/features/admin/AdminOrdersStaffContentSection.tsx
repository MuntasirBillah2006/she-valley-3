import { useCallback, useEffect, useState } from 'react';
import { Download, Plus, Printer } from 'lucide-react';
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
import { Textarea } from '@/src/components/ui/Textarea';
import { useLocale } from '@/src/hooks/useLocale';
import { useToast } from '@/src/hooks/useToast';
import { apiClient } from '@/src/lib/apiClient';

const ORDER_STATUSES = [
  'PENDING_VERIFICATION',
  'CONFIRMED',
  'PROCESSING',
  'PACKAGING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'FAILED_DELIVERY',
  'RETURNED',
] as const;

interface AdminOrderRow {
  id: string;
  orderNumber: string;
  guestName: string;
  guestPhone: string;
  deliveryZone: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  totalBdt: string;
  stockRestored: boolean;
  createdAt: string;
}

export function AdminOrdersSection() {
  const { messages, formatCurrency, formatDate } = useLocale();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<{
    order: AdminOrderRow & { subtotalBdt: string; deliveryFeeBdt: string; shippingAddressSnapshot: Record<string, string> };
    items: { id: string; skuSnapshot: string; productNameSnapshotEn: string; variantLabelSnapshot: string; quantity: number; lineTotalBdt: string }[];
    history: { id: string; toStatus: string; note: string; isInternalNote: boolean; createdAt: string }[];
  } | null>(null);

  const [nextStatus, setNextStatus] = useState('CONFIRMED');
  const [statusNote, setStatusNote] = useState('');
  const [internalNote, setInternalNote] = useState('');

  // Manual order state
  const [manualOpen, setManualOpen] = useState(false);
  const [variants, setVariants] = useState<{ variantId: string; sku: string; availableQty: number }[]>([]);
  const [mName, setMName] = useState('');
  const [mPhone, setMPhone] = useState('');
  const [mDistrict, setMDistrict] = useState('Dhaka');
  const [mArea, setMArea] = useState('Dhanmondi');
  const [mStreet, setMStreet] = useState('');
  const [mVariantId, setMVariantId] = useState('');
  const [mQty, setMQty] = useState('1');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const res = await apiClient.get<{ orders: AdminOrderRow[] }>(`/api/v1/admin/orders${qs}`);
      setOrders(res.orders ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, messages.common.errorGeneric]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const openOrderDetail = async (id: string) => {
    const res = await apiClient.get<NonNullable<typeof selectedOrder>>(`/api/v1/admin/orders/${id}`);
    setSelectedOrder(res);
    setNextStatus(res.order.status);
  };

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      await apiClient.patch(`/api/v1/admin/orders/${selectedOrder.order.id}/status`, {
        status: nextStatus,
        note: statusNote.trim() || undefined,
      });
      setStatusNote('');
      showToast({ title: `Order status updated to ${nextStatus}`, variant: 'success' });
      await openOrderDetail(selectedOrder.order.id);
      await loadOrders();
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !internalNote.trim()) return;
    try {
      await apiClient.post(`/api/v1/admin/orders/${selectedOrder.order.id}/notes`, {
        note: internalNote.trim(),
        isInternalNote: true,
      });
      setInternalNote('');
      await openOrderDetail(selectedOrder.order.id);
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  const openManualModal = async () => {
    setManualOpen(true);
    try {
      const inv = await apiClient.get<{ items: { variantId: string; sku: string; availableQty: number }[] }>('/api/v1/admin/inventory');
      setVariants(inv.items ?? []);
      if (inv.items?.[0]) setMVariantId(inv.items[0].variantId);
    } catch {
      // Ignore
    }
  };

  const handleManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/api/v1/admin/orders/manual', {
        customerName: mName,
        phone: mPhone,
        division: 'Dhaka',
        district: mDistrict,
        upazilaOrArea: mArea,
        streetAddress: mStreet,
        variantId: mVariantId,
        quantity: Number(mQty) || 1,
      });
      setManualOpen(false);
      setMName('');
      setMPhone('');
      setMStreet('');
      showToast({ title: 'Manual order created', variant: 'success' });
      await loadOrders();
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-56">
          <Select
            aria-label="Filter order status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All Order Statuses' },
              ...ORDER_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })),
            ]}
          />
        </div>
        <div className="flex gap-2">
          <a
            href="/api/v1/admin/orders/export"
            className="inline-flex items-center gap-1.5 min-h-10 px-3.5 py-2 text-xs font-medium rounded-lg border border-brand-border bg-brand-ivory-elevated hover:bg-brand-ivory-muted"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{messages.admin.exportCsv}</span>
          </a>
          <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => void openManualModal()}>
            {messages.admin.manualOrder}
          </Button>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <LoadingIndicator label={messages.common.loading} />
      ) : (
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-brand-ivory-muted border-b border-brand-border text-brand-charcoal-muted">
              <tr>
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Zone</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border tabular-nums">
              {orders.map((o) => (
                <tr key={o.id} className="h-10 hover:bg-brand-ivory/60">
                  <td className="px-4 py-2 font-mono font-semibold text-brand-burgundy">{o.orderNumber}</td>
                  <td className="px-4 py-2">
                    <p className="font-medium text-brand-charcoal">{o.guestName}</p>
                    <p className="text-[11px] text-brand-charcoal-muted">{o.guestPhone}</p>
                  </td>
                  <td className="px-4 py-2">{o.deliveryZone.replace('_', ' ')}</td>
                  <td className="px-4 py-2">
                    <Badge variant={o.status === 'DELIVERED' ? 'success' : o.status === 'CANCELLED' ? 'error' : 'burgundy'}>
                      {o.status.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">{formatCurrency(Number(o.totalBdt))}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="secondary" onClick={() => void openOrderDetail(o.id)}>
                      Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Order Detail & Status Lifecycle Modal */}
      <Modal
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        title={`Order ${selectedOrder?.order.orderNumber || ''}`}
        size="lg"
      >
        {selectedOrder && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border pb-3">
              <div className="text-xs space-y-0.5">
                <p className="font-semibold text-sm">{selectedOrder.order.guestName}</p>
                <p className="text-brand-charcoal-muted">{selectedOrder.order.guestPhone}</p>
                <p className="text-brand-charcoal-muted">
                  {selectedOrder.order.shippingAddressSnapshot?.streetAddress}, {selectedOrder.order.shippingAddressSnapshot?.upazilaOrArea}, {selectedOrder.order.shippingAddressSnapshot?.district}
                </p>
              </div>
              <Button variant="secondary" size="sm" leftIcon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>
                Print Invoice
              </Button>
            </div>

            <div className="space-y-1.5 text-sm">
              {selectedOrder.items.map((it) => (
                <div key={it.id} className="flex justify-between">
                  <span>
                    <span className="font-mono text-xs">{it.skuSnapshot}</span> · {it.productNameSnapshotEn} ({it.variantLabelSnapshot}) × {it.quantity}
                  </span>
                  <span className="tabular-nums font-medium">{formatCurrency(Number(it.lineTotalBdt))}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-brand-border pt-2 font-semibold">
                <span>Total (COD)</span>
                <span className="tabular-nums">{formatCurrency(Number(selectedOrder.order.totalBdt))}</span>
              </div>
            </div>

            <form onSubmit={handleStatusUpdate} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end border-t border-brand-border pt-4">
              <div className="sm:col-span-5">
                <FormField id="ord-st" label="Transition Status">
                  <Select
                    id="ord-st"
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                    options={ORDER_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-4">
                <FormField id="ord-note" label="Status Note">
                  <Input id="ord-note" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Optional note" />
                </FormField>
              </div>
              <div className="sm:col-span-3">
                <Button type="submit" fullWidth>Update</Button>
              </div>
            </form>

            <form onSubmit={handleAddNote} className="flex gap-2">
              <Input
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="Add internal staff verification note..."
              />
              <Button type="submit" variant="secondary">Add Note</Button>
            </form>

            <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs border-t border-brand-border pt-3">
              {selectedOrder.history.map((h) => (
                <div key={h.id} className="flex justify-between gap-2">
                  <span>
                    <strong>{h.toStatus}</strong> {h.isInternalNote ? '(Internal)' : ''} — {h.note}
                  </span>
                  <span className="text-brand-charcoal-muted shrink-0">{formatDate(h.createdAt, 'short')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Manual Assisted Order Modal */}
      <Modal isOpen={manualOpen} onClose={() => setManualOpen(false)} title={messages.admin.manualOrder} size="md">
        <form onSubmit={handleManualOrder} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField id="mo-name" label="Customer Name" required>
              <Input id="mo-name" required value={mName} onChange={(e) => setMName(e.target.value)} />
            </FormField>
            <FormField id="mo-phone" label="BD Phone" required>
              <Input id="mo-phone" required value={mPhone} onChange={(e) => setMPhone(e.target.value)} placeholder="01XXXXXXXXX" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="mo-dist" label="District" required>
              <Input id="mo-dist" required value={mDistrict} onChange={(e) => setMDistrict(e.target.value)} />
            </FormField>
            <FormField id="mo-area" label="Area / Thana" required>
              <Input id="mo-area" required value={mArea} onChange={(e) => setMArea(e.target.value)} />
            </FormField>
          </div>
          <FormField id="mo-str" label="Street Address" required>
            <Input id="mo-str" required value={mStreet} onChange={(e) => setMStreet(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <FormField id="mo-var" label="Variant SKU" required>
                <Select
                  id="mo-var"
                  value={mVariantId}
                  onChange={(e) => setMVariantId(e.target.value)}
                  options={variants.map((v) => ({ value: v.variantId, label: `${v.sku} (Avail: ${v.availableQty})` }))}
                />
              </FormField>
            </div>
            <FormField id="mo-qty" label="Qty" required>
              <Input id="mo-qty" type="number" min={1} required value={mQty} onChange={(e) => setMQty(e.target.value)} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setManualOpen(false)}>{messages.common.cancel}</Button>
            <Button type="submit">{messages.common.save}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function AdminStaffSection() {
  const { messages } = useLocale();
  const { showToast } = useToast();

  const [staff, setStaff] = useState<{
    id: string;
    email: string;
    fullName: string;
    status: string;
    mfaEnabled: boolean;
    roles: { code: string; name: string }[];
  }[]>([]);
  const [roles, setRoles] = useState<{ id: string; code: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleCode, setRoleCode] = useState('MODERATOR');
  const [mfaPasscode, setMfaPasscode] = useState('');

  const loadStaff = useCallback(async () => {
    try {
      const res = await apiClient.get<{ staff: typeof staff; roles: typeof roles }>('/api/v1/admin/staff');
      setStaff(res.staff ?? []);
      setRoles(res.roles ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.common.errorGeneric);
    }
  }, [messages.common.errorGeneric]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/api/v1/admin/staff', {
        fullName,
        email,
        password,
        roleCode,
        ...(mfaPasscode.trim() ? { mfaPasscode: mfaPasscode.trim() } : {}),
      });
      setCreateOpen(false);
      setFullName('');
      setEmail('');
      setPassword('');
      setMfaPasscode('');
      showToast({ title: 'Staff account created', variant: 'success' });
      await loadStaff();
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  if (error) return <Alert variant="error">{error}</Alert>;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateOpen(true)}>
          {messages.admin.addStaff}
        </Button>
      </div>

      <Card padding="none" className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-brand-ivory-muted border-b border-brand-border text-brand-charcoal-muted">
            <tr>
              <th className="px-4 py-3">Staff Member</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">MFA</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {staff.map((s) => (
              <tr key={s.id} className="h-11">
                <td className="px-4 py-2">
                  <p className="font-semibold text-brand-charcoal">{s.fullName}</p>
                  <p className="text-brand-charcoal-muted">{s.email}</p>
                </td>
                <td className="px-4 py-2 font-mono">{s.roles.map((r) => r.code).join(', ')}</td>
                <td className="px-4 py-2">{s.mfaEnabled ? 'Enabled' : 'Off'}</td>
                <td className="px-4 py-2">
                  <Badge variant={s.status === 'ACTIVE' ? 'success' : 'error'}>{s.status}</Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await apiClient.patch(`/api/v1/admin/staff/${s.id}`, {
                          status: s.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                        });
                        await loadStaff();
                      } catch (err) {
                        showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
                      }
                    }}
                  >
                    {s.status === 'ACTIVE' ? 'Disable' : 'Activate'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={messages.admin.addStaff} size="sm">
        <form onSubmit={handleCreate} className="space-y-3">
          <FormField id="st-name" label="Full Name" required>
            <Input id="st-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </FormField>
          <FormField id="st-email" label="Email" required>
            <Input id="st-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField id="st-pw" label="Password (min 8)" required>
            <Input id="st-pw" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <FormField id="st-role" label="RBAC Role" required>
            <Select
              id="st-role"
              value={roleCode}
              onChange={(e) => setRoleCode(e.target.value)}
              options={roles.filter((r) => r.code !== 'CUSTOMER').map((r) => ({ value: r.code, label: r.name }))}
            />
          </FormField>
          <FormField id="st-mfa" label="Optional MFA Passcode">
            <Input id="st-mfa" value={mfaPasscode} onChange={(e) => setMfaPasscode(e.target.value)} placeholder="e.g. 6-digit code" />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>{messages.common.cancel}</Button>
            <Button type="submit">{messages.common.save}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

interface BannerRow {
  id: string;
  placement: string;
  titleEn: string;
  titleBn: string;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export function AdminContentSettingsSection() {
  const { messages, formatDate } = useLocale();
  const { showToast } = useToast();

  const [data, setData] = useState<{
    banners: BannerRow[];
    reviews: { id: string; authorName: string; rating: number; comment: string; moderationStatus: string }[];
    pages: { id: string; slug: string; pageType: string; titleEn: string; isPublished: boolean; ownerApproved: boolean }[];
    settings: { key: string; valueJson: Record<string, unknown> }[];
  } | null>(null);
  const [allSettings, setAllSettings] = useState<Record<string, Record<string, unknown>>>({});
  const [canManageSettings, setCanManageSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delivery Zone Charges
  const [dhakaFee, setDhakaFee] = useState('70');
  const [subDhakaFee, setSubDhakaFee] = useState('100');
  const [outsideFee, setOutsideFee] = useState('130');
  const [freeThreshold, setFreeThreshold] = useState('2500');

  // Scheduled Banner Form
  const [bannerOpen, setBannerOpen] = useState(false);
  const [bPlacement, setBPlacement] = useState<'ANNOUNCEMENT' | 'HERO'>('ANNOUNCEMENT');
  const [bTitleEn, setBTitleEn] = useState('');
  const [bTitleBn, setBTitleBn] = useState('');
  const [bCtaHref, setBCtaHref] = useState('/shop');
  const [bStartsAt, setBStartsAt] = useState('');
  const [bEndsAt, setBEndsAt] = useState('');

  // Contact & Social
  const [waNumber, setWaNumber] = useState('01828-298143');
  const [messengerUrl, setMessengerUrl] = useState('https://m.me/SheValley');
  const [igHandle, setIgHandle] = useState('@she-valley');
  const [fbUrl, setFbUrl] = useState('https://facebook.com/SheValley');
  const [supportEmail, setSupportEmail] = useState('support@she-valley.com');
  const [floatingWa, setFloatingWa] = useState(true);

  // Payment & Courier Config
  const [codEnabled, setCodEnabled] = useState(true);
  const [codMaxBdt, setCodMaxBdt] = useState('25000');
  const [sandboxPay, setSandboxPay] = useState(true);
  const [livePayApproved, setLivePayApproved] = useState(false);
  const [defaultCourier, setDefaultCourier] = useState('STEADFAST');
  const [discreetLabel, setDiscreetLabel] = useState(true);
  const [hideInnerwearDesc, setHideInnerwearDesc] = useState(true);

  // Marketing & SEO Config
  const [ga4Id, setGa4Id] = useState('');
  const [gtmId, setGtmId] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [gscToken, setGscToken] = useState('');
  const [requireConsent, setRequireConsent] = useState(true);

  // Notification & Automation Config
  const [ownerApprovedExt, setOwnerApprovedExt] = useState(false);
  const [sendRealExt, setSendRealExt] = useState(false);
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState('');

  const loadContent = useCallback(async () => {
    try {
      const res = await apiClient.get<NonNullable<typeof data>>('/api/v1/admin/content');
      setData(res);
      const deliv = res.settings.find((s) => s.key === 'delivery_zones')?.valueJson;
      if (deliv) {
        setDhakaFee(String(deliv.DHAKA_METRO ?? 70));
        setSubDhakaFee(String(deliv.SUB_DHAKA ?? 100));
        setOutsideFee(String(deliv.OUTSIDE_DHAKA ?? 130));
        setFreeThreshold(String(deliv.freeDeliveryThresholdBdt ?? 2500));
      }

      try {
        const full = await apiClient.get<{ settings: Record<string, Record<string, unknown>> }>(
          '/api/v1/admin/settings/all',
        );
        const sMap = full.settings ?? {};
        setAllSettings(sMap);
        setCanManageSettings(true);

        const cs = sMap.contact_social;
        if (cs) {
          setWaNumber(String(cs.whatsappNumber ?? '01828-298143'));
          setMessengerUrl(String(cs.messengerUrl ?? 'https://m.me/SheValley'));
          setIgHandle(String(cs.instagramHandle ?? '@she-valley'));
          setFbUrl(String(cs.facebookPageUrl ?? 'https://facebook.com/SheValley'));
          setSupportEmail(String(cs.supportEmail ?? 'support@she-valley.com'));
          setFloatingWa(cs.floatingWhatsappEnabled !== false);
        }
        const pc = sMap.payment_config;
        if (pc) {
          setCodEnabled(pc.codEnabled !== false);
          setCodMaxBdt(String(pc.codMaxAmountBdt ?? 25000));
          setSandboxPay(pc.sandboxModeEnabled !== false);
          setLivePayApproved(Boolean(pc.liveActivationApprovedByOwner));
        }
        const cc = sMap.courier_config;
        if (cc) {
          setDefaultCourier(String(cc.defaultProvider ?? 'STEADFAST'));
          setDiscreetLabel(cc.discreetParcelLabelDefault !== false);
          setHideInnerwearDesc(cc.hideInnerwearDescriptionOnLabel !== false);
        }
        const mc = sMap.marketing_config;
        if (mc) {
          setGa4Id(String(mc.ga4MeasurementId ?? ''));
          setGtmId(String(mc.gtmContainerId ?? ''));
          setPixelId(String(mc.metaPixelId ?? ''));
          setGscToken(String(mc.searchConsoleVerification ?? ''));
          setRequireConsent(mc.requireCookieConsentForMarketing !== false);
        }
        const nc = sMap.notification_config;
        if (nc) {
          setOwnerApprovedExt(Boolean(nc.ownerApprovedExternalDispatch));
          setSendRealExt(Boolean(nc.sendRealExternalMessages));
        }
        const ac = sMap.automation_config;
        if (ac) {
          setAutomationEnabled(ac.enabled !== false);
          setN8nWebhookUrl(String(ac.n8nWebhookUrl ?? ''));
        }
      } catch {
        setCanManageSettings(false);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.common.errorGeneric);
    }
  }, [messages.common.errorGeneric]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  const patchSetting = async (key: string, mergedValueJson: Record<string, unknown>, toastTitle: string) => {
    try {
      await apiClient.patch(`/api/v1/admin/settings/${key}`, { valueJson: mergedValueJson });
      showToast({ title: toastTitle, variant: 'success' });
      await loadContent();
    } catch (err) {
      showToast({
        title: messages.common.errorGeneric,
        message: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    }
  };

  const saveDeliverySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await patchSetting(
      'delivery_zones',
      {
        DHAKA_METRO: Number(dhakaFee),
        SUB_DHAKA: Number(subDhakaFee),
        OUTSIDE_DHAKA: Number(outsideFee),
        freeDeliveryThresholdBdt: Number(freeThreshold),
      },
      'Delivery settings saved',
    );
  };

  const handleCreateBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/api/v1/admin/banners', {
        placement: bPlacement,
        titleEn: bTitleEn,
        titleBn: bTitleBn,
        ctaHref: bCtaHref,
        isActive: true,
        ...(bStartsAt ? { startsAt: new Date(bStartsAt).toISOString() } : {}),
        ...(bEndsAt ? { endsAt: new Date(bEndsAt).toISOString() } : {}),
      });
      setBannerOpen(false);
      setBTitleEn('');
      setBTitleBn('');
      setBStartsAt('');
      setBEndsAt('');
      showToast({ title: 'Campaign banner created', variant: 'success' });
      await loadContent();
    } catch (err) {
      showToast({
        title: messages.common.errorGeneric,
        message: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    }
  };

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!data) return <LoadingIndicator label={messages.common.loading} />;

  return (
    <div className="space-y-6">
      {/* Delivery Zone Charges */}
      <Card className="space-y-4">
        <h2 className="font-display text-xl font-semibold">Bangladesh Delivery Zone Fees (BDT)</h2>
        <form onSubmit={saveDeliverySettings} className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <FormField id="set-dm" label="Dhaka Metro (৳)">
            <Input id="set-dm" type="number" value={dhakaFee} onChange={(e) => setDhakaFee(e.target.value)} />
          </FormField>
          <FormField id="set-sd" label="Sub-Dhaka (৳)">
            <Input id="set-sd" type="number" value={subDhakaFee} onChange={(e) => setSubDhakaFee(e.target.value)} />
          </FormField>
          <FormField id="set-od" label="Outside Dhaka (৳)">
            <Input id="set-od" type="number" value={outsideFee} onChange={(e) => setOutsideFee(e.target.value)} />
          </FormField>
          <FormField id="set-fr" label="Free Threshold (৳)">
            <Input id="set-fr" type="number" value={freeThreshold} onChange={(e) => setFreeThreshold(e.target.value)} />
          </FormField>
          <Button type="submit">{messages.common.save}</Button>
        </form>
      </Card>

      {/* Command 03 Operational Settings (requires manage_settings) */}
      {canManageSettings && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Contact & Social Channels */}
          <Card className="space-y-4">
            <h2 className="font-display text-xl font-semibold">Contact & Social Channels</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void patchSetting(
                  'contact_social',
                  {
                    ...(allSettings.contact_social ?? {}),
                    whatsappNumber: waNumber,
                    messengerUrl,
                    instagramHandle: igHandle,
                    instagramUrl: `https://instagram.com/${igHandle.replace(/^@/, '')}`,
                    facebookPageUrl: fbUrl,
                    supportEmail,
                    floatingWhatsappEnabled: floatingWa,
                  },
                  'Contact & social channels saved',
                );
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField id="cs-wa" label="WhatsApp Number">
                  <Input id="cs-wa" value={waNumber} onChange={(e) => setWaNumber(e.target.value)} />
                </FormField>
                <FormField id="cs-ig" label="Instagram Handle">
                  <Input id="cs-ig" value={igHandle} onChange={(e) => setIgHandle(e.target.value)} />
                </FormField>
                <FormField id="cs-msg" label="Messenger URL">
                  <Input id="cs-msg" value={messengerUrl} onChange={(e) => setMessengerUrl(e.target.value)} />
                </FormField>
                <FormField id="cs-em" label="Support Email">
                  <Input id="cs-em" type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
                </FormField>
              </div>
              <FormField id="cs-fb" label="Facebook Page URL">
                <Input id="cs-fb" value={fbUrl} onChange={(e) => setFbUrl(e.target.value)} />
              </FormField>
              <div className="flex items-center justify-between gap-3 pt-1">
                <Checkbox
                  id="cs-float"
                  label="Show Floating WhatsApp Care Button"
                  checked={floatingWa}
                  onChange={(e) => setFloatingWa(e.target.checked)}
                />
                <Button type="submit" size="sm">{messages.common.save}</Button>
              </div>
            </form>
          </Card>

          {/* Payment & Courier Rules */}
          <Card className="space-y-4">
            <h2 className="font-display text-xl font-semibold">Payment & Courier Controls</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await patchSetting(
                  'payment_config',
                  {
                    ...(allSettings.payment_config ?? {}),
                    codEnabled,
                    codMaxAmountBdt: Number(codMaxBdt) || 25000,
                    sandboxModeEnabled: sandboxPay,
                    liveActivationApprovedByOwner: livePayApproved,
                  },
                  'Payment rules saved',
                );
                await patchSetting(
                  'courier_config',
                  {
                    ...(allSettings.courier_config ?? {}),
                    defaultProvider: defaultCourier,
                    discreetParcelLabelDefault: discreetLabel,
                    hideInnerwearDescriptionOnLabel: hideInnerwearDesc,
                  },
                  'Courier & payment settings updated',
                );
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField id="pc-max" label="COD Max Limit (BDT)">
                  <Input id="pc-max" type="number" value={codMaxBdt} onChange={(e) => setCodMaxBdt(e.target.value)} />
                </FormField>
                <FormField id="cc-def" label="Default Courier">
                  <Select
                    id="cc-def"
                    value={defaultCourier}
                    onChange={(e) => setDefaultCourier(e.target.value)}
                    options={[
                      { value: 'STEADFAST', label: 'Steadfast' },
                      { value: 'PATHAO', label: 'Pathao' },
                      { value: 'REDX', label: 'REDX' },
                      { value: 'PAPERFLY', label: 'Paperfly' },
                      { value: 'ECOURIER', label: 'eCourier' },
                    ]}
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <Checkbox id="pc-cod" label="COD Enabled" checked={codEnabled} onChange={(e) => setCodEnabled(e.target.checked)} />
                <Checkbox id="pc-sbx" label="Sandbox Testing Allowed" checked={sandboxPay} onChange={(e) => setSandboxPay(e.target.checked)} />
                <Checkbox id="pc-live" label="Live Gateway Owner-Approved" checked={livePayApproved} onChange={(e) => setLivePayApproved(e.target.checked)} />
                <Checkbox id="cc-disc" label="Discreet Label Default" checked={discreetLabel} onChange={(e) => setDiscreetLabel(e.target.checked)} />
                <Checkbox id="cc-hide" label="Hide Innerwear Names on Label" checked={hideInnerwearDesc} onChange={(e) => setHideInnerwearDesc(e.target.checked)} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm">{messages.common.save}</Button>
              </div>
            </form>
          </Card>

          {/* Marketing & Analytics Tracking */}
          <Card className="space-y-4">
            <h2 className="font-display text-xl font-semibold">SEO & Marketing Pixels</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void patchSetting(
                  'marketing_config',
                  {
                    ...(allSettings.marketing_config ?? {}),
                    ga4MeasurementId: ga4Id.trim(),
                    gtmContainerId: gtmId.trim(),
                    metaPixelId: pixelId.trim(),
                    searchConsoleVerification: gscToken.trim(),
                    requireCookieConsentForMarketing: requireConsent,
                  },
                  'Marketing & SEO config saved',
                );
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField id="mk-ga4" label="GA4 Measurement ID">
                  <Input id="mk-ga4" value={ga4Id} onChange={(e) => setGa4Id(e.target.value)} placeholder="G-XXXXXXXXXX" />
                </FormField>
                <FormField id="mk-gtm" label="GTM Container ID">
                  <Input id="mk-gtm" value={gtmId} onChange={(e) => setGtmId(e.target.value)} placeholder="GTM-XXXXXXX" />
                </FormField>
                <FormField id="mk-px" label="Meta Pixel ID">
                  <Input id="mk-px" value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="Numeric Pixel ID" />
                </FormField>
                <FormField id="mk-gsc" label="Search Console Token">
                  <Input id="mk-gsc" value={gscToken} onChange={(e) => setGscToken(e.target.value)} placeholder="google-site-verification" />
                </FormField>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <Checkbox
                  id="mk-cons"
                  label="Require Cookie Consent Before Tracking"
                  checked={requireConsent}
                  onChange={(e) => setRequireConsent(e.target.checked)}
                />
                <Button type="submit" size="sm">{messages.common.save}</Button>
              </div>
            </form>
          </Card>

          {/* Notifications & Automation Safety Controls */}
          <Card className="space-y-4">
            <h2 className="font-display text-xl font-semibold">Automation & Dispatch Approval Gate</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await patchSetting(
                  'notification_config',
                  {
                    ...(allSettings.notification_config ?? {}),
                    ownerApprovedExternalDispatch: ownerApprovedExt,
                    sendRealExternalMessages: sendRealExt,
                  },
                  'Notification dispatch policy saved',
                );
                await patchSetting(
                  'automation_config',
                  {
                    ...(allSettings.automation_config ?? {}),
                    enabled: automationEnabled,
                    n8nWebhookUrl: n8nWebhookUrl.trim(),
                  },
                  'Automation & dispatch settings saved',
                );
              }}
              className="space-y-3"
            >
              <FormField id="au-n8n" label="n8n Signed Webhook URL (Optional)">
                <Input
                  id="au-n8n"
                  value={n8nWebhookUrl}
                  onChange={(e) => setN8nWebhookUrl(e.target.value)}
                  placeholder="https://n8n.yourdomain.com/webhook/she-valley"
                />
              </FormField>
              <div className="space-y-2 text-xs">
                <Checkbox
                  id="au-en"
                  label="Automation Event Bus Enabled"
                  checked={automationEnabled}
                  onChange={(e) => setAutomationEnabled(e.target.checked)}
                />
                <Checkbox
                  id="nt-own"
                  label="Owner Approved External Customer Messaging"
                  checked={ownerApprovedExt}
                  onChange={(e) => setOwnerApprovedExt(e.target.checked)}
                />
                <Checkbox
                  id="nt-real"
                  label="Allow Live External Dispatch (Requires Credentials)"
                  checked={sendRealExt}
                  onChange={(e) => setSendRealExt(e.target.checked)}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm">{messages.common.save}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Scheduled Campaign Banners */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Campaign Banners & Scheduling</h2>
          <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setBannerOpen(true)}>
            Add Banner
          </Button>
        </div>
        <div className="divide-y divide-brand-border text-xs">
          {(data.banners ?? []).map((b) => (
            <div key={b.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-brand-charcoal">
                  [{b.placement}] {b.titleEn}
                </p>
                <p className="text-brand-charcoal-muted">
                  Window: {b.startsAt ? formatDate(b.startsAt, 'short') : 'Immediate'} →{' '}
                  {b.endsAt ? formatDate(b.endsAt, 'short') : 'No end date'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={b.isActive ? 'success' : 'neutral'}>{b.isActive ? 'ACTIVE' : 'PAUSED'}</Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await apiClient.patch(`/api/v1/admin/banners/${b.id}`, { isActive: !b.isActive });
                    await loadContent();
                  }}
                >
                  {b.isActive ? 'Pause' : 'Activate'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Reviews Moderation */}
      <Card className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Review Moderation Queue</h2>
        <div className="divide-y divide-brand-border text-xs">
          {data.reviews.map((r) => (
            <div key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="font-semibold">{r.authorName} · {'★'.repeat(r.rating)}</p>
                <p className="text-brand-charcoal-muted">{r.comment}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={r.moderationStatus === 'APPROVED' ? 'success' : r.moderationStatus === 'REJECTED' ? 'error' : 'warning'}>
                  {r.moderationStatus}
                </Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await apiClient.patch(`/api/v1/admin/reviews/${r.id}`, { moderationStatus: 'APPROVED' });
                    await loadContent();
                  }}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await apiClient.patch(`/api/v1/admin/reviews/${r.id}`, { moderationStatus: 'REJECTED' });
                    await loadContent();
                  }}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Policy & Static Pages Approval Guard */}
      <Card className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Pages & Policy Publication Guard</h2>
        <div className="divide-y divide-brand-border text-xs">
          {data.pages.map((p) => (
            <div key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{p.titleEn}</p>
                <p className="text-brand-charcoal-muted">
                  /{p.slug} · {p.pageType} · Owner Approved: {p.ownerApproved ? 'Yes' : 'No'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id={`oa-${p.slug}`}
                  label="Owner Approved"
                  checked={p.ownerApproved}
                  onChange={async (e) => {
                    try {
                      await apiClient.patch(`/api/v1/admin/pages/${p.slug}`, {
                        ownerApproved: e.target.checked,
                        ...(e.target.checked ? {} : { isPublished: false }),
                      });
                      await loadContent();
                    } catch (err) {
                      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant={p.isPublished ? 'secondary' : 'primary'}
                  onClick={async () => {
                    try {
                      await apiClient.patch(`/api/v1/admin/pages/${p.slug}`, {
                        isPublished: !p.isPublished,
                      });
                      await loadContent();
                    } catch (err) {
                      showToast({ title: 'Publication Blocked', message: err instanceof Error ? err.message : undefined, variant: 'error' });
                    }
                  }}
                >
                  {p.isPublished ? 'Unpublish' : 'Publish'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Add Scheduled Banner Modal */}
      <Modal isOpen={bannerOpen} onClose={() => setBannerOpen(false)} title="Create Scheduled Banner" size="md">
        <form onSubmit={handleCreateBanner} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField id="bn-place" label="Placement">
              <Select
                id="bn-place"
                value={bPlacement}
                onChange={(e) => setBPlacement(e.target.value === 'HERO' ? 'HERO' : 'ANNOUNCEMENT')}
                options={[
                  { value: 'ANNOUNCEMENT', label: 'Announcement Bar' },
                  { value: 'HERO', label: 'Hero Banner' },
                ]}
              />
            </FormField>
            <FormField id="bn-href" label="Target Link">
              <Input id="bn-href" value={bCtaHref} onChange={(e) => setBCtaHref(e.target.value)} />
            </FormField>
          </div>
          <FormField id="bn-ten" label="Title (English)" required>
            <Input id="bn-ten" required value={bTitleEn} onChange={(e) => setBTitleEn(e.target.value)} />
          </FormField>
          <FormField id="bn-tbn" label="Title (Bengali)" required>
            <Input id="bn-tbn" required value={bTitleBn} onChange={(e) => setBTitleBn(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="bn-st" label="Starts At (Optional)">
              <Input id="bn-st" type="datetime-local" value={bStartsAt} onChange={(e) => setBStartsAt(e.target.value)} />
            </FormField>
            <FormField id="bn-en" label="Ends At (Optional)">
              <Input id="bn-en" type="datetime-local" value={bEndsAt} onChange={(e) => setBEndsAt(e.target.value)} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setBannerOpen(false)}>{messages.common.cancel}</Button>
            <Button type="submit">{messages.common.save}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function AdminAuditLogsSection() {
  const { messages, formatDate } = useLocale();
  const [logs, setLogs] = useState<
    { id: string; actorEmail: string | null; actorRole: string; action: string; entityType: string; entityId: string; requestId: string; createdAt: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<{ auditLogs: typeof logs }>('/api/v1/admin/audit-logs')
      .then((d) => setLogs(d.auditLogs ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : messages.common.errorGeneric));
  }, [messages.common.errorGeneric]);

  if (error) return <Alert variant="error">{error}</Alert>;

  return (
    <Card padding="none" className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-brand-ivory-muted border-b border-brand-border text-brand-charcoal-muted">
          <tr>
            <th className="px-4 py-3">Timestamp</th>
            <th className="px-4 py-3">Actor</th>
            <th className="px-4 py-3">Action</th>
            <th className="px-4 py-3">Entity</th>
            <th className="px-4 py-3">Request ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-border tabular-nums">
          {logs.map((l) => (
            <tr key={l.id} className="h-9">
              <td className="px-4 py-2 whitespace-nowrap">{formatDate(l.createdAt, 'short')}</td>
              <td className="px-4 py-2">{l.actorEmail || l.actorRole}</td>
              <td className="px-4 py-2 font-mono font-semibold text-brand-burgundy">{l.action}</td>
              <td className="px-4 py-2">{l.entityType}</td>
              <td className="px-4 py-2 font-mono text-brand-charcoal-muted">{l.requestId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
