import { useCallback, useEffect, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { Alert } from '@/src/components/feedback/Alert';
import { LoadingIndicator } from '@/src/components/feedback/LoadingIndicator';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { FormField } from '@/src/components/ui/FormField';
import { Input } from '@/src/components/ui/Input';
import { Modal } from '@/src/components/ui/Modal';
import { Select } from '@/src/components/ui/Select';
import { Textarea } from '@/src/components/ui/Textarea';
import { useLocale } from '@/src/hooks/useLocale';
import { useToast } from '@/src/hooks/useToast';
import { apiClient } from '@/src/lib/apiClient';

interface AdminCategory {
  id: string;
  slug: string;
  en: { name: string } | null;
  bn: { name: string } | null;
}

interface AdminProduct {
  id: string;
  slug: string;
  skuPrefix: string;
  status: string;
  basePriceBdt: number;
  en?: { name: string; description: string };
  bn?: { name: string; description: string };
  variants: {
    id: string;
    sku: string;
    size: string;
    colorName: string;
    priceBdt: number;
    onHandQty: number;
    reservedQty: number;
    availableQty: number;
  }[];
}

export function AdminProductsSection() {
  const { messages, formatCurrency } = useLocale();
  const { showToast } = useToast();

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [priceModalVariant, setPriceModalVariant] = useState<{ id: string; sku: string; priceBdt: number } | null>(null);
  const [newPrice, setNewPrice] = useState('');

  // Create Product Form
  const [categoryId, setCategoryId] = useState('');
  const [slug, setSlug] = useState('');
  const [skuPrefix, setSkuPrefix] = useState('SV-');
  const [nameEn, setNameEn] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [descEn, setDescEn] = useState('');
  const [descBn, setDescBn] = useState('');
  const [basePrice, setBasePrice] = useState('990');
  const [varSku, setVarSku] = useState('');
  const [varSize, setVarSize] = useState('34B');
  const [varColor, setVarColor] = useState('Ivory');
  const [varStock, setVarStock] = useState('15');

  // Create Category Form
  const [catSlug, setCatSlug] = useState('');
  const [catNameEn, setCatNameEn] = useState('');
  const [catNameBn, setCatNameBn] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        apiClient.get<{ products: AdminProduct[] }>(`/api/v1/admin/products${query ? `?q=${encodeURIComponent(query)}` : ''}`),
        apiClient.get<{ categories: AdminCategory[] }>('/api/v1/admin/categories'),
      ]);
      setProducts(pRes.products ?? []);
      setCategories(cRes.categories ?? []);
      if (!categoryId && cRes.categories?.[0]) {
        setCategoryId(cRes.categories[0].id);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [query, categoryId, messages.common.errorGeneric]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const priceNum = Number(basePrice);
      await apiClient.post('/api/v1/admin/products', {
        categoryId,
        slug,
        skuPrefix,
        status: 'ACTIVE',
        basePriceBdt: priceNum,
        nameEn,
        nameBn,
        descriptionEn: descEn,
        descriptionBn: descBn,
        initialVariant: {
          sku: varSku || `${skuPrefix}-${varSize}`.toUpperCase(),
          size: varSize,
          colorName: varColor,
          colorHex: '#DEC8BF',
          priceBdt: priceNum,
          initialStock: Number(varStock) || 0,
        },
      });
      setCreateOpen(false);
      setSlug('');
      setNameEn('');
      setNameBn('');
      setDescEn('');
      setDescBn('');
      showToast({ title: 'Product created', variant: 'success' });
      await loadData();
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/api/v1/admin/categories', {
        slug: catSlug,
        nameEn: catNameEn,
        nameBn: catNameBn,
        isActive: true,
      });
      setCatOpen(false);
      setCatSlug('');
      setCatNameEn('');
      setCatNameBn('');
      showToast({ title: 'Category created', variant: 'success' });
      await loadData();
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  const handleUpdateVariantPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!priceModalVariant) return;
    try {
      await apiClient.patch(`/api/v1/admin/variants/${priceModalVariant.id}`, {
        priceBdt: Number(newPrice),
      });
      setPriceModalVariant(null);
      showToast({ title: 'Variant price updated (audit logged)', variant: 'success' });
      await loadData();
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:w-72">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products or SKU..."
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCatOpen(true)}>
            + Category
          </Button>
          <a
            href="/api/v1/admin/products/export"
            className="inline-flex items-center gap-1.5 min-h-10 px-3.5 py-2 text-xs font-medium rounded-lg border border-brand-border bg-brand-ivory-elevated hover:bg-brand-ivory-muted"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{messages.admin.exportCsv}</span>
          </a>
          <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateOpen(true)}>
            {messages.admin.createProduct}
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
                <th className="px-4 py-3">Product (EN / BN)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Variants & Stock</th>
                <th className="px-4 py-3 text-right">Base Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-brand-ivory/60">
                  <td className="px-4 py-3 space-y-0.5">
                    <p className="font-semibold text-sm text-brand-charcoal">{p.en?.name || p.slug}</p>
                    <p className="text-brand-charcoal-muted">{p.bn?.name}</p>
                    <p className="font-mono text-[11px] text-brand-charcoal-muted">{p.skuPrefix}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={p.status === 'ACTIVE' ? 'success' : 'neutral'}>{p.status}</Badge>
                  </td>
                  <td className="px-4 py-3 space-y-1.5">
                    {p.variants.map((v) => (
                      <div key={v.id} className="flex items-center justify-between gap-3 tabular-nums">
                        <span className="font-mono">{v.sku} ({v.size} · {v.colorName})</span>
                        <div className="flex items-center gap-2">
                          <span>Avail: {v.availableQty}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setPriceModalVariant({ id: v.id, sku: v.sku, priceBdt: v.priceBdt });
                              setNewPrice(String(v.priceBdt));
                            }}
                            className="text-brand-burgundy hover:underline cursor-pointer"
                          >
                            {formatCurrency(v.priceBdt)}
                          </button>
                        </div>
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatCurrency(p.basePriceBdt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Create Product Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={messages.admin.createProduct} size="lg">
        <form onSubmit={handleCreateProduct} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField id="p-cat" label="Category" required>
              <Select
                id="p-cat"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                options={categories.map((c) => ({ value: c.id, label: c.en?.name || c.slug }))}
              />
            </FormField>
            <FormField id="p-slug" label="Slug" required>
              <Input id="p-slug" required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="soft-cotton-bra" />
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField id="p-name-en" label="Name (English)" required>
              <Input id="p-name-en" required value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </FormField>
            <FormField id="p-name-bn" label="Name (Bengali)" required>
              <Input id="p-name-bn" required value={nameBn} onChange={(e) => setNameBn(e.target.value)} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField id="p-desc-en" label="Description (English)" required>
              <Textarea id="p-desc-en" required value={descEn} onChange={(e) => setDescEn(e.target.value)} />
            </FormField>
            <FormField id="p-desc-bn" label="Description (Bengali)" required>
              <Textarea id="p-desc-bn" required value={descBn} onChange={(e) => setDescBn(e.target.value)} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FormField id="p-prefix" label="SKU Prefix" required>
              <Input id="p-prefix" required value={skuPrefix} onChange={(e) => setSkuPrefix(e.target.value)} />
            </FormField>
            <FormField id="p-price" label="Price (BDT)" required>
              <Input id="p-price" type="number" required value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
            </FormField>
            <FormField id="p-size" label="Initial Size" required>
              <Input id="p-size" required value={varSize} onChange={(e) => setVarSize(e.target.value)} />
            </FormField>
            <FormField id="p-stock" label="Initial Stock" required>
              <Input id="p-stock" type="number" required value={varStock} onChange={(e) => setVarStock(e.target.value)} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="p-vsku" label="Variant SKU" required>
              <Input id="p-vsku" required value={varSku} onChange={(e) => setVarSku(e.target.value)} placeholder="SV-CB-34B" />
            </FormField>
            <FormField id="p-vcol" label="Color Name" required>
              <Input id="p-vcol" required value={varColor} onChange={(e) => setVarColor(e.target.value)} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>{messages.common.cancel}</Button>
            <Button type="submit">{messages.common.save}</Button>
          </div>
        </form>
      </Modal>

      {/* Create Category Modal */}
      <Modal isOpen={catOpen} onClose={() => setCatOpen(false)} title="Create Category" size="sm">
        <form onSubmit={handleCreateCategory} className="space-y-3">
          <FormField id="c-slug" label="Slug" required>
            <Input id="c-slug" required value={catSlug} onChange={(e) => setCatSlug(e.target.value)} />
          </FormField>
          <FormField id="c-en" label="English Name" required>
            <Input id="c-en" required value={catNameEn} onChange={(e) => setCatNameEn(e.target.value)} />
          </FormField>
          <FormField id="c-bn" label="Bengali Name" required>
            <Input id="c-bn" required value={catNameBn} onChange={(e) => setCatNameBn(e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCatOpen(false)}>{messages.common.cancel}</Button>
            <Button type="submit">{messages.common.save}</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Variant Price Modal */}
      <Modal
        isOpen={Boolean(priceModalVariant)}
        onClose={() => setPriceModalVariant(null)}
        title={`Update Price — ${priceModalVariant?.sku || ''}`}
        size="sm"
      >
        <form onSubmit={handleUpdateVariantPrice} className="space-y-4">
          <FormField id="vp-price" label="New Price (BDT)" required>
            <Input id="vp-price" type="number" required value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPriceModalVariant(null)}>{messages.common.cancel}</Button>
            <Button type="submit">{messages.common.save}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function AdminInventorySection() {
  const { messages, formatCurrency, formatDate } = useLocale();
  const { showToast } = useToast();

  const [data, setData] = useState<{
    items: {
      inventoryId: string;
      variantId: string;
      sku: string;
      size: string;
      colorName: string;
      onHandQty: number;
      reservedQty: number;
      availableQty: number;
      valuationBdt: number;
      stockStatus: string;
    }[];
    totalValuationBdt: number;
    movements: {
      id: string;
      type: string;
      quantityDelta: number;
      balanceAfter: number;
      reason: string | null;
      createdAt: string;
    }[];
    suppliers: { id: string; name: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [adjType, setAdjType] = useState<'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT' | 'RECONCILIATION'>('STOCK_IN');
  const [adjDelta, setAdjDelta] = useState('10');
  const [adjReason, setAdjReason] = useState('');

  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purRef, setPurRef] = useState('');
  const [purQty, setPurQty] = useState('20');
  const [purCost, setPurCost] = useState('520');

  const loadInv = useCallback(async () => {
    try {
      const res = await apiClient.get<NonNullable<typeof data>>('/api/v1/admin/inventory');
      setData(res);
      if (!selectedVariantId && res.items[0]) {
        setSelectedVariantId(res.items[0].variantId);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.common.errorGeneric);
    }
  }, [selectedVariantId, messages.common.errorGeneric]);

  useEffect(() => {
    void loadInv();
  }, [loadInv]);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/api/v1/admin/inventory/adjust', {
        variantId: selectedVariantId,
        type: adjType,
        quantityDelta: Number(adjDelta),
        reason: adjReason,
      });
      setAdjustOpen(false);
      setAdjReason('');
      showToast({ title: 'Inventory adjusted', variant: 'success' });
      await loadInv();
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/api/v1/admin/purchases', {
        supplierId: data?.suppliers[0]?.id,
        referenceNo: purRef,
        variantId: selectedVariantId,
        quantity: Number(purQty),
        unitCostBdt: Number(purCost),
      });
      setPurchaseOpen(false);
      setPurRef('');
      showToast({ title: 'Purchase receipt recorded & stocked in', variant: 'success' });
      await loadInv();
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!data) return <LoadingIndicator label={messages.common.loading} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Card padding="sm" className="inline-flex items-center gap-4">
          <span className="text-xs text-brand-charcoal-muted">Total Inventory Valuation</span>
          <span className="font-mono text-lg font-semibold tabular-nums text-brand-burgundy">
            {formatCurrency(data.totalValuationBdt)}
          </span>
        </Card>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPurchaseOpen(true)}>
            {messages.admin.recordPurchase}
          </Button>
          <Button size="sm" onClick={() => setAdjustOpen(true)}>
            {messages.admin.adjustStock}
          </Button>
        </div>
      </div>

      <Card padding="none" className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-brand-ivory-muted border-b border-brand-border text-brand-charcoal-muted">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Variant</th>
              <th className="px-4 py-3 text-right">On Hand</th>
              <th className="px-4 py-3 text-right">Reserved</th>
              <th className="px-4 py-3 text-right">Available</th>
              <th className="px-4 py-3 text-right">Valuation</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border tabular-nums">
            {data.items.map((row) => (
              <tr key={row.variantId} className="h-10">
                <td className="px-4 py-2 font-mono font-medium">{row.sku}</td>
                <td className="px-4 py-2">{row.size} · {row.colorName}</td>
                <td className="px-4 py-2 text-right">{row.onHandQty}</td>
                <td className="px-4 py-2 text-right">{row.reservedQty}</td>
                <td className="px-4 py-2 text-right font-semibold">{row.availableQty}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(row.valuationBdt)}</td>
                <td className="px-4 py-2">
                  <Badge
                    variant={
                      row.stockStatus === 'OUT_OF_STOCK'
                        ? 'error'
                        : row.stockStatus === 'LOW_STOCK'
                          ? 'warning'
                          : 'success'
                    }
                  >
                    {row.stockStatus.replace(/_/g, ' ')}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Recent Stock Movements Ledger</h2>
        <div className="divide-y divide-brand-border text-xs tabular-nums">
          {data.movements.slice(0, 12).map((m) => (
            <div key={m.id} className="py-2 flex items-center justify-between gap-4">
              <div>
                <span className="font-mono font-semibold text-brand-burgundy">{m.type}</span>
                <span className="mx-2 font-mono">({m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta})</span>
                <span className="text-brand-charcoal-muted">{m.reason}</span>
              </div>
              <span className="text-brand-charcoal-muted shrink-0">
                Bal: {m.balanceAfter} · {formatDate(m.createdAt, 'short')}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Modal isOpen={adjustOpen} onClose={() => setAdjustOpen(false)} title={messages.admin.adjustStock} size="sm">
        <form onSubmit={handleAdjust} className="space-y-3">
          <FormField id="adj-v" label="Variant SKU" required>
            <Select
              id="adj-v"
              value={selectedVariantId}
              onChange={(e) => setSelectedVariantId(e.target.value)}
              options={data.items.map((i) => ({ value: i.variantId, label: `${i.sku} (Avail: ${i.availableQty})` }))}
            />
          </FormField>
          <FormField id="adj-t" label="Movement Type" required>
            <Select
              id="adj-t"
              value={adjType}
              onChange={(e) => setAdjType(e.target.value as typeof adjType)}
              options={[
                { value: 'STOCK_IN', label: 'STOCK_IN (+)' },
                { value: 'STOCK_OUT', label: 'STOCK_OUT (-)' },
                { value: 'ADJUSTMENT', label: 'ADJUSTMENT (+/-)' },
                { value: 'RECONCILIATION', label: 'RECONCILIATION (+/-)' },
              ]}
            />
          </FormField>
          <FormField id="adj-d" label="Quantity Delta (e.g. 10 or -2)" required>
            <Input id="adj-d" type="number" required value={adjDelta} onChange={(e) => setAdjDelta(e.target.value)} />
          </FormField>
          <FormField id="adj-r" label="Reason" required>
            <Input id="adj-r" required minLength={3} value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAdjustOpen(false)}>{messages.common.cancel}</Button>
            <Button type="submit">{messages.common.save}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={purchaseOpen} onClose={() => setPurchaseOpen(false)} title={messages.admin.recordPurchase} size="sm">
        <form onSubmit={handlePurchase} className="space-y-3">
          <FormField id="pur-ref" label="Purchase Reference #" required>
            <Input id="pur-ref" required value={purRef} onChange={(e) => setPurRef(e.target.value)} placeholder="PO-2026-001" />
          </FormField>
          <FormField id="pur-v" label="Variant SKU" required>
            <Select
              id="pur-v"
              value={selectedVariantId}
              onChange={(e) => setSelectedVariantId(e.target.value)}
              options={data.items.map((i) => ({ value: i.variantId, label: i.sku }))}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="pur-qty" label="Quantity" required>
              <Input id="pur-qty" type="number" required min={1} value={purQty} onChange={(e) => setPurQty(e.target.value)} />
            </FormField>
            <FormField id="pur-cost" label="Unit Cost (BDT)" required>
              <Input id="pur-cost" type="number" required min={0} value={purCost} onChange={(e) => setPurCost(e.target.value)} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setPurchaseOpen(false)}>{messages.common.cancel}</Button>
            <Button type="submit">{messages.common.save}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
