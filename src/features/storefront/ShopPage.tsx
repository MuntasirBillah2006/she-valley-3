import { useEffect, useState } from 'react';
import { EmptyState } from '@/src/components/feedback/EmptyState';
import { Skeleton } from '@/src/components/feedback/Skeleton';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Select } from '@/src/components/ui/Select';
import { useLocale } from '@/src/hooks/useLocale';
import { useRouter } from '@/src/hooks/useRouter';
import { apiClient, type StorefrontCategory, type StorefrontProduct } from '@/src/lib/apiClient';
import { ProductCard } from './ProductCard';

const SIZE_OPTIONS = ['32B', '34B', '34C', '36C', '36D', 'S', 'M', 'L', 'XL'];

export function ShopPage({ categories }: { categories: StorefrontCategory[] }) {
  const { locale, messages } = useLocale();
  const { search, navigate } = useRouter();

  const params = new URLSearchParams(search);
  const [query, setQuery] = useState(params.get('q') || '');
  const [categorySlug, setCategorySlug] = useState(params.get('category') || '');
  const [sizeFilter, setSizeFilter] = useState(params.get('size') || '');
  const [colorFilter, setColorFilter] = useState(params.get('color') || '');
  const [sort, setSort] = useState(params.get('sort') || 'featured');
  const [page, setPage] = useState(1);

  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const nextParams = new URLSearchParams(search);
    setQuery(nextParams.get('q') || '');
    setCategorySlug(nextParams.get('category') || '');
    setSort(nextParams.get('sort') || 'featured');
  }, [search]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const qs = new URLSearchParams();
        if (query.trim()) qs.set('q', query.trim());
        if (categorySlug) qs.set('category', categorySlug);
        if (sizeFilter) qs.set('size', sizeFilter);
        if (colorFilter.trim()) qs.set('color', colorFilter.trim());
        if (sort) qs.set('sort', sort);
        qs.set('page', String(page));
        qs.set('limit', '12');

        const res = await fetch(`/api/v1/storefront/products?${qs.toString()}`);
        const json = await res.json();
        if (!active) return;
        setProducts(json?.data?.products ?? []);
        setTotal(json?.meta?.pagination?.total ?? 0);
        setTotalPages(Math.max(1, json?.meta?.pagination?.totalPages ?? 1));
      } catch {
        if (!active) return;
        setProducts([]);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [query, categorySlug, sizeFilter, colorFilter, sort, page]);

  const clearFilters = () => {
    setQuery('');
    setCategorySlug('');
    setSizeFilter('');
    setColorFilter('');
    setSort('featured');
    setPage(1);
    navigate('/shop', { replace: true });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-brand-border pb-6">
        <div className="space-y-1">
          <h1 className="font-display text-4xl font-semibold text-brand-charcoal">
            {messages.shop.title}
          </h1>
          <p className="text-sm text-brand-charcoal-muted">{messages.shop.subtitle}</p>
        </div>
        <p className="text-xs text-brand-charcoal-muted tabular-nums">
          {messages.shop.showingCount
            .replace('{count}', String(products.length))
            .replace('{total}', String(total))}
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-brand-ivory-elevated p-4 rounded-xl border border-brand-border">
        <div className="md:col-span-4">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={messages.common.searchPlaceholder}
            aria-label={messages.nav.search}
          />
        </div>

        <div className="md:col-span-3">
          <Select
            aria-label={messages.nav.categories}
            value={categorySlug}
            onChange={(e) => {
              setCategorySlug(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: messages.shop.allCategories },
              ...categories.map((c) => ({
                value: c.slug,
                label: locale === 'bn' ? c.translations.bn.name : c.translations.en.name,
              })),
            ]}
          />
        </div>

        <div className="md:col-span-2">
          <Input
            value={colorFilter}
            onChange={(e) => {
              setColorFilter(e.target.value);
              setPage(1);
            }}
            placeholder={messages.shop.allColors}
            aria-label={messages.shop.allColors}
          />
        </div>

        <div className="md:col-span-3">
          <Select
            aria-label={messages.shop.sortLabel}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'featured', label: messages.shop.sortFeatured },
              { value: 'newest', label: messages.shop.sortNewest },
              { value: 'price_asc', label: messages.shop.sortPriceAsc },
              { value: 'price_desc', label: messages.shop.sortPriceDesc },
            ]}
          />
        </div>

        <div className="md:col-span-12 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-brand-border/70">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSizeFilter('');
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                sizeFilter === ''
                  ? 'bg-brand-burgundy text-brand-ivory-elevated border-brand-burgundy'
                  : 'bg-brand-ivory text-brand-charcoal border-brand-border hover:bg-brand-ivory-muted'
              }`}
            >
              {messages.shop.allSizes}
            </button>
            {SIZE_OPTIONS.map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => {
                  setSizeFilter(sz === sizeFilter ? '' : sz);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  sizeFilter === sz
                    ? 'bg-brand-burgundy text-brand-ivory-elevated border-brand-burgundy'
                    : 'bg-brand-ivory text-brand-charcoal border-brand-border hover:bg-brand-ivory-muted'
                }`}
              >
                {sz}
              </button>
            ))}
          </div>

          {(query || categorySlug || sizeFilter || colorFilter) && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              {messages.shop.clearFilters}
            </Button>
          )}
        </div>
      </div>

      {/* Product Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((idx) => (
            <div key={idx} className="rounded-xl border border-brand-border p-4 space-y-3 bg-brand-ivory-elevated">
              <Skeleton className="h-52 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          title={messages.shop.emptyTitle}
          description={messages.shop.emptyDesc}
          action={<Button onClick={clearFilters}>{messages.shop.clearFilters}</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {messages.common.back}
          </Button>
          <span className="text-xs font-medium tabular-nums px-3">
            {page} / {totalPages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            →
          </Button>
        </div>
      )}
    </div>
  );
}
