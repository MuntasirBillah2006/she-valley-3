import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Alert } from '@/src/components/feedback/Alert';
import { EmptyState } from '@/src/components/feedback/EmptyState';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { FormField } from '@/src/components/ui/FormField';
import { Input } from '@/src/components/ui/Input';
import { Modal } from '@/src/components/ui/Modal';
import { Select } from '@/src/components/ui/Select';
import { BANGLADESH_DIVISIONS } from '@/src/config/bangladesh';
import { useAuth } from '@/src/hooks/useAuth';
import { useLocale } from '@/src/hooks/useLocale';
import { useRouter } from '@/src/hooks/useRouter';
import { useToast } from '@/src/hooks/useToast';
import { apiClient } from '@/src/lib/apiClient';
import { ProductImage } from '../storefront/ProductImage';

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  totalBdt: string;
  deliveryZone: string;
  createdAt: string;
}

interface AddressRecord {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  division: string;
  district: string;
  upazilaOrArea: string;
  streetAddress: string;
  deliveryZone: string;
}

interface WishlistRecord {
  id: string;
  productId: string;
  slug: string;
  basePriceBdt: number;
  imageUrl: string | null;
  name: { en: string; bn: string };
}

interface TicketRecord {
  id: string;
  ticketNumber: string;
  category: string;
  priority: string;
  status: string;
  resolutionSummary?: string | null;
  createdAt: string;
}

export function AccountDashboardPage() {
  const { locale, messages, formatCurrency, formatDate } = useLocale();
  const { navigate } = useRouter();
  const { user, isLoading, refreshUser, logout } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'profile' | 'orders' | 'addresses' | 'wishlist' | 'tickets'>('orders');
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [addresses, setAddresses] = useState<AddressRecord[]>([]);
  const [wishlist, setWishlist] = useState<WishlistRecord[]>([]);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<{
    order: OrderSummary & { subtotalBdt: string; deliveryFeeBdt: string };
    items: { id: string; productNameSnapshotEn: string; productNameSnapshotBn: string; variantLabelSnapshot: string; quantity: number; lineTotalBdt: string }[];
  } | null>(null);

  // New Address state
  const [addrLabel, setAddrLabel] = useState('Home');
  const [addrName, setAddrName] = useState('');
  const [addrPhone, setAddrPhone] = useState('');
  const [addrDiv, setAddrDiv] = useState('Dhaka');
  const [addrDist, setAddrDist] = useState('Dhaka');
  const [addrArea, setAddrArea] = useState('Dhanmondi');
  const [addrStreet, setAddrStreet] = useState('');

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login');
      return;
    }
    if (user) {
      setFullName(user.fullName);
      setPhone(user.phone || '');
      setAddrName(user.fullName);
      setAddrPhone(user.phone || '');
      Promise.all([
        apiClient.get<{ orders: OrderSummary[] }>('/api/v1/account/orders'),
        apiClient.get<{ addresses: AddressRecord[] }>('/api/v1/account/addresses'),
        apiClient.get<{ items: WishlistRecord[] }>('/api/v1/account/wishlist'),
        apiClient.get<{ tickets: TicketRecord[] }>('/api/v1/account/tickets'),
      ])
        .then(([o, a, w, tk]) => {
          setOrders(o.orders ?? []);
          setAddresses(a.addresses ?? []);
          setWishlist(w.items ?? []);
          setTickets(tk.tickets ?? []);
        })
        .catch(() => undefined);
    }
  }, [user, isLoading, navigate]);

  if (!user) return null;

  const divObj = BANGLADESH_DIVISIONS.find((d) => d.nameEn === addrDiv) ?? BANGLADESH_DIVISIONS[0];
  const distObj = divObj.districts.find((d) => d.nameEn === addrDist) ?? divObj.districts[0];

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.patch('/api/v1/account/profile', {
        fullName,
        ...(phone ? { phone } : {}),
        preferredLocale: locale,
      });
      await refreshUser();
      showToast({ title: messages.common.save, variant: 'success' });
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await apiClient.post<{ address: AddressRecord }>('/api/v1/account/addresses', {
        label: addrLabel,
        recipientName: addrName,
        phone: addrPhone,
        division: divObj.nameEn,
        district: distObj.nameEn,
        upazilaOrArea: addrArea,
        streetAddress: addrStreet,
        isDefault: addresses.length === 0,
      });
      setAddresses((prev) => [data.address, ...prev]);
      setAddrStreet('');
      showToast({ title: messages.common.save, variant: 'success' });
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  const handleDeleteAddress = async (id: string) => {
    await apiClient.delete(`/api/v1/account/addresses/${id}`);
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  };

  const handleViewOrder = async (orderId: string) => {
    const data = await apiClient.get<{
      order: OrderSummary & { subtotalBdt: string; deliveryFeeBdt: string };
      items: { id: string; productNameSnapshotEn: string; productNameSnapshotBn: string; variantLabelSnapshot: string; quantity: number; lineTotalBdt: string }[];
    }>(`/api/v1/account/orders/${orderId}`);
    setSelectedOrderDetail(data);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-border pb-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-brand-charcoal">{user.fullName}</h1>
          <p className="text-xs text-brand-charcoal-muted">{user.email}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await logout();
            navigate('/');
          }}
        >
          {messages.account.signOut}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['orders', messages.account.ordersTab],
            ['addresses', messages.account.addressesTab],
            ['wishlist', messages.account.wishlistTab],
            ['tickets', messages.social.ticketsTab],
            ['profile', messages.account.profileTab],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-xs font-medium rounded-lg border cursor-pointer ${
              tab === key
                ? 'bg-brand-burgundy text-brand-ivory-elevated border-brand-burgundy'
                : 'bg-brand-ivory-elevated text-brand-charcoal border-brand-border hover:bg-brand-ivory-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <EmptyState
              title={messages.account.noOrders}
              action={<Button onClick={() => navigate('/shop')}>{messages.cart.continueShopping}</Button>}
            />
          ) : (
            orders.map((ord) => (
              <Card key={ord.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-brand-burgundy">{ord.orderNumber}</span>
                    <Badge variant="neutral">{ord.status.replace(/_/g, ' ')}</Badge>
                  </div>
                  <p className="text-xs text-brand-charcoal-muted">
                    {formatDate(ord.createdAt, 'medium')} · {ord.deliveryZone.replace('_', ' ')}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold tabular-nums">{formatCurrency(Number(ord.totalBdt))}</span>
                  <Button size="sm" variant="secondary" onClick={() => void handleViewOrder(ord.id)}>
                    {messages.storefront.viewDetails}
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'addresses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 space-y-3">
            {addresses.length === 0 ? (
              <Alert variant="info">No saved addresses yet.</Alert>
            ) : (
              addresses.map((addr) => (
                <Card key={addr.id} className="flex items-start justify-between gap-4">
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold">
                      {addr.label} — {addr.recipientName}
                    </p>
                    <p className="text-xs text-brand-charcoal-muted">{addr.phone}</p>
                    <p className="text-xs text-brand-charcoal-muted">
                      {addr.streetAddress}, {addr.upazilaOrArea}, {addr.district}, {addr.division}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete address"
                    onClick={() => void handleDeleteAddress(addr.id)}
                    className="p-2 text-brand-charcoal-muted hover:text-status-error-fg cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Card>
              ))
            )}
          </div>

          <Card className="lg:col-span-6">
            <form onSubmit={handleAddAddress} className="space-y-3">
              <h2 className="font-display text-2xl font-semibold">{messages.account.addAddress}</h2>
              <div className="grid grid-cols-2 gap-3">
                <Input value={addrLabel} onChange={(e) => setAddrLabel(e.target.value)} placeholder="Home / Office" />
                <Input required value={addrName} onChange={(e) => setAddrName(e.target.value)} placeholder={messages.checkout.fullName} />
              </div>
              <Input required value={addrPhone} onChange={(e) => setAddrPhone(e.target.value)} placeholder="01XXXXXXXXX" />
              <div className="grid grid-cols-3 gap-2">
                <Select
                  value={divObj.nameEn}
                  onChange={(e) => {
                    const nd = BANGLADESH_DIVISIONS.find((d) => d.nameEn === e.target.value) ?? BANGLADESH_DIVISIONS[0];
                    setAddrDiv(nd.nameEn);
                    setAddrDist(nd.districts[0].nameEn);
                    setAddrArea(nd.districts[0].areas[0]);
                  }}
                  options={BANGLADESH_DIVISIONS.map((d) => ({ value: d.nameEn, label: d.nameEn }))}
                />
                <Select
                  value={distObj.nameEn}
                  onChange={(e) => {
                    const nd = divObj.districts.find((d) => d.nameEn === e.target.value) ?? divObj.districts[0];
                    setAddrDist(nd.nameEn);
                    setAddrArea(nd.areas[0]);
                  }}
                  options={divObj.districts.map((d) => ({ value: d.nameEn, label: d.nameEn }))}
                />
                <Select
                  value={addrArea}
                  onChange={(e) => setAddrArea(e.target.value)}
                  options={distObj.areas.map((a) => ({ value: a, label: a }))}
                />
              </div>
              <Input required value={addrStreet} onChange={(e) => setAddrStreet(e.target.value)} placeholder={messages.checkout.street} />
              <Button type="submit" fullWidth>{messages.common.save}</Button>
            </form>
          </Card>
        </div>
      )}

      {tab === 'wishlist' && (
        <div>
          {wishlist.length === 0 ? (
            <EmptyState
              title={messages.account.noWishlist}
              action={<Button onClick={() => navigate('/shop')}>{messages.cart.continueShopping}</Button>}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {wishlist.map((w) => (
                <Card key={w.id} padding="none" className="overflow-hidden">
                  <div className="aspect-[4/3] bg-brand-ivory-muted">
                    <ProductImage src={w.imageUrl} alt={locale === 'bn' ? w.name.bn : w.name.en} className="h-full w-full" />
                  </div>
                  <div className="p-4 space-y-3">
                    <p className="font-semibold text-sm truncate">{locale === 'bn' ? w.name.bn : w.name.en}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold tabular-nums">{formatCurrency(w.basePriceBdt)}</span>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => navigate(`/products/${w.slug}`)}>
                          {messages.storefront.viewDetails}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await apiClient.delete(`/api/v1/account/wishlist/${w.productId}`);
                            setWishlist((prev) => prev.filter((item) => item.id !== w.id));
                          }}
                        >
                          {messages.cart.remove}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'tickets' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => navigate('/contact')}>
              {messages.social.contactFormTitle}
            </Button>
          </div>
          {tickets.length === 0 ? (
            <EmptyState
              title="No support tickets yet."
              action={<Button onClick={() => navigate('/contact')}>{messages.nav.contact}</Button>}
            />
          ) : (
            tickets.map((t) => (
              <Card key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-brand-burgundy">{t.ticketNumber}</span>
                    <Badge variant={t.status === 'RESOLVED' || t.status === 'CLOSED' ? 'success' : 'burgundy'}>
                      {t.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="text-xs text-brand-charcoal-muted">
                    {t.category} · {t.priority} · {formatDate(t.createdAt, 'medium')}
                  </p>
                  {t.resolutionSummary && (
                    <p className="text-xs text-brand-charcoal">{t.resolutionSummary}</p>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'profile' && (
        <Card className="max-w-lg">
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <FormField id="prof-name" label={messages.account.fullName} required>
              <Input id="prof-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </FormField>
            <FormField id="prof-phone" label={messages.account.phone}>
              <Input id="prof-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </FormField>
            <Button type="submit">{messages.common.save}</Button>
          </form>
        </Card>
      )}

      <Modal
        isOpen={Boolean(selectedOrderDetail)}
        onClose={() => setSelectedOrderDetail(null)}
        title={selectedOrderDetail?.order.orderNumber || ''}
      >
        {selectedOrderDetail && (
          <div className="space-y-4">
            <div className="space-y-2">
              {selectedOrderDetail.items.map((it) => (
                <div key={it.id} className="flex justify-between text-sm">
                  <span>
                    {locale === 'bn' ? it.productNameSnapshotBn : it.productNameSnapshotEn} ({it.variantLabelSnapshot}) × {it.quantity}
                  </span>
                  <span className="tabular-nums font-medium">{formatCurrency(Number(it.lineTotalBdt))}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-brand-border pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>{messages.cart.subtotal}</span>
                <span className="tabular-nums">{formatCurrency(Number(selectedOrderDetail.order.subtotalBdt))}</span>
              </div>
              <div className="flex justify-between">
                <span>{messages.checkout.deliveryFee}</span>
                <span className="tabular-nums">{formatCurrency(Number(selectedOrderDetail.order.deliveryFeeBdt))}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>{messages.checkout.total}</span>
                <span className="tabular-nums">{formatCurrency(Number(selectedOrderDetail.order.totalBdt))}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
