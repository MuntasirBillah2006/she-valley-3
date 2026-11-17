import { useEffect, useMemo, useState } from 'react';
import { Heart, MessageCircle, Minus, Plus, Ruler, ShieldCheck, ZoomIn } from 'lucide-react';
import { Alert } from '@/src/components/feedback/Alert';
import { EmptyState } from '@/src/components/feedback/EmptyState';
import { LoadingIndicator } from '@/src/components/feedback/LoadingIndicator';
import { Breadcrumb } from '@/src/components/layout/Breadcrumb';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Modal } from '@/src/components/ui/Modal';
import { Select } from '@/src/components/ui/Select';
import { Textarea } from '@/src/components/ui/Textarea';
import { ProductJsonLd } from '@/src/features/seo/SeoHeadManager';
import { useAuth } from '@/src/hooks/useAuth';
import { useCart } from '@/src/hooks/useCart';
import { useLocale } from '@/src/hooks/useLocale';
import { useRouter } from '@/src/hooks/useRouter';
import { useToast } from '@/src/hooks/useToast';
import { buildWhatsAppHref, trackMarketingEvent } from '@/src/lib/analytics';
import {
  apiClient,
  type StorefrontBootstrapData,
  type StorefrontProduct,
  type StorefrontReview,
} from '@/src/lib/apiClient';
import { ProductCard } from './ProductCard';
import { ProductImage } from './ProductImage';

const RECENTLY_VIEWED_KEY = 'she-valley-recently-viewed';

interface RecentItem {
  slug: string;
  nameEn: string;
  nameBn: string;
  priceBdt: number;
  imageUrl?: string | null;
}

export function ProductDetailPage({
  slug,
  contactSocial,
}: {
  slug: string;
  contactSocial?: StorefrontBootstrapData['contactSocial'];
}) {
  const { locale, messages, formatCurrency, formatDate } = useLocale();
  const { navigate, setPageMeta } = useRouter();
  const { addItem } = useCart();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [product, setProduct] = useState<StorefrontProduct | null>(null);
  const [reviews, setReviews] = useState<StorefrontReview[]>([]);
  const [related, setRelated] = useState<StorefrontProduct[]>([]);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'fabric' | 'shipping'>('fabric');
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
  const [wishlisted, setWishlisted] = useState(false);
  const [adding, setAdding] = useState(false);

  // Review form state
  const [reviewName, setReviewName] = useState('');
  const [reviewRating, setReviewRating] = useState('5');
  const [reviewFit, setReviewFit] = useState('TRUE_TO_SIZE');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setNotFound(false);
      try {
        const data = await apiClient.get<{
          product: StorefrontProduct;
          reviews: StorefrontReview[];
          relatedProducts: StorefrontProduct[];
        }>(`/api/v1/storefront/products/${slug}`);
        if (!active) return;

        setProduct(data.product);
        setReviews(data.reviews ?? []);
        setRelated(data.relatedProducts ?? []);
        const firstVariant =
          data.product.variants.find((v) => v.availableQty > 0) ?? data.product.variants[0];
        setSelectedVariantId(firstVariant?.id ?? '');
        const primaryImg = data.product.images.find((i) => i.isPrimary) ?? data.product.images[0];
        setActiveImageUrl(primaryImg?.url ?? null);
        setQuantity(1);

        const trans = data.product.translations[locale] || data.product.translations.en;
        setPageMeta(trans.name, trans.shortDescription || undefined);

        trackMarketingEvent({
          eventName: 'ViewContent',
          valueBdt: data.product.basePriceBdt,
          metadata: { slug: data.product.slug, skuPrefix: data.product.skuPrefix },
        });

        // Save to recently viewed in localStorage
        try {
          const prevRaw = window.localStorage.getItem(RECENTLY_VIEWED_KEY);
          const prev: RecentItem[] = prevRaw ? JSON.parse(prevRaw) : [];
          const entry: RecentItem = {
            slug: data.product.slug,
            nameEn: data.product.translations.en.name,
            nameBn: data.product.translations.bn.name,
            priceBdt: data.product.basePriceBdt,
            imageUrl: primaryImg?.url ?? null,
          };
          const updated = [entry, ...prev.filter((p) => p.slug !== entry.slug)].slice(0, 4);
          window.localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
          setRecentItems(updated.filter((r) => r.slug !== entry.slug));
        } catch {
          // Ignore storage restrictions
        }
      } catch {
        if (!active) return;
        setNotFound(true);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [slug, locale, setPageMeta]);

  const selectedVariant = useMemo(
    () => product?.variants.find((v) => v.id === selectedVariantId) ?? product?.variants[0],
    [product, selectedVariantId],
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20 flex justify-center">
        <LoadingIndicator label={messages.common.loading} />
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16">
        <EmptyState
          title={messages.common.noResults}
          action={<Button onClick={() => navigate('/shop')}>{messages.cart.continueShopping}</Button>}
        />
      </div>
    );
  }

  const trans = product.translations[locale] || product.translations.en;
  const catName = locale === 'bn' ? product.categoryName.bn : product.categoryName.en;
  const fabricText = locale === 'bn' ? product.fabricSpec.bn : product.fabricSpec.en;
  const careText = locale === 'bn' ? product.careInstructions.bn : product.careInstructions.en;
  const available = selectedVariant?.availableQty ?? 0;

  const handleAddToBag = async (goCheckout = false) => {
    if (!selectedVariant || available <= 0) return;
    setAdding(true);
    try {
      await addItem(selectedVariant.id, quantity, !goCheckout);
      trackMarketingEvent({
        eventName: 'AddToCart',
        valueBdt: Number(selectedVariant.priceBdt) * quantity,
        metadata: { sku: selectedVariant.sku, quantity },
      });
      if (goCheckout) {
        navigate('/checkout');
      } else {
        showToast({ title: trans.name, message: `${selectedVariant.size} · ${selectedVariant.colorName}`, variant: 'success' });
      }
    } catch (err) {
      showToast({
        title: messages.common.errorGeneric,
        message: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setAdding(false);
    }
  };

  const handleWishlistToggle = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      if (wishlisted) {
        await apiClient.delete(`/api/v1/account/wishlist/${product.id}`);
        setWishlisted(false);
      } else {
        await apiClient.post('/api/v1/account/wishlist', { productId: product.id });
        setWishlisted(true);
      }
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post(`/api/v1/storefront/products/${product.slug}/reviews`, {
        authorName: reviewName,
        rating: Number(reviewRating),
        fitFeedback: reviewFit,
        comment: reviewComment,
      });
      setReviewSuccess(true);
      setReviewName('');
      setReviewComment('');
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  const whatsappNumber = contactSocial?.whatsappNumber || '01828-298143';
  const primaryImage = activeImageUrl ?? product.images[0]?.url ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-16 pb-20 sm:pb-8">
      <ProductJsonLd
        name={trans.name}
        description={trans.shortDescription || trans.description}
        sku={selectedVariant?.sku || product.skuPrefix}
        priceBdt={selectedVariant?.priceBdt ?? product.basePriceBdt}
        inStock={available > 0}
        imageUrl={primaryImage}
        slug={product.slug}
        categoryName={catName}
      />
      <Breadcrumb
        items={[
          { label: messages.nav.shop, href: `/${locale}/shop` },
          { label: trans.name },
        ]}
      />

      {/* Sticky Gallery Left + Contiguous Purchase Module Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Gallery */}
        <div className="lg:col-span-7 lg:sticky lg:top-24 space-y-4">
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-brand-ivory-muted border border-brand-border">
            <ProductImage
              src={activeImageUrl}
              alt={trans.name}
              priority
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              aria-label="Zoom product image"
              className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-ivory-elevated/90 border border-brand-border text-brand-charcoal hover:bg-brand-ivory-elevated cursor-pointer"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto">
              {product.images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveImageUrl(img.url)}
                  className={`h-20 w-24 rounded-lg overflow-hidden border cursor-pointer shrink-0 ${
                    activeImageUrl === img.url ? 'border-brand-burgundy ring-1 ring-brand-burgundy' : 'border-brand-border'
                  }`}
                >
                  <ProductImage src={img.url} alt={trans.name} className="h-full w-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Purchase Module */}
        <div className="lg:col-span-5 space-y-6">
          <div className="space-y-2 border-b border-brand-border pb-5">
            <div className="flex items-center gap-2 text-xs text-brand-charcoal-muted">
              <span>{catName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{selectedVariant?.sku || product.skuPrefix}</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-brand-charcoal">
              {trans.name}
            </h1>
            <div className="flex items-baseline gap-3 pt-1">
              <span className="text-2xl font-semibold text-brand-burgundy tabular-nums">
                {formatCurrency(selectedVariant?.priceBdt ?? product.basePriceBdt)}
              </span>
              {selectedVariant?.compareAtPriceBdt && (
                <span className="text-sm text-brand-charcoal-muted line-through tabular-nums">
                  {formatCurrency(selectedVariant.compareAtPriceBdt)}
                </span>
              )}
              <span className="text-xs font-medium text-brand-charcoal-muted ml-auto">
                {available <= 0
                  ? messages.storefront.outOfStock
                  : available <= (selectedVariant?.lowStockThreshold ?? 5)
                    ? `${messages.storefront.lowStock} (${available})`
                    : `${messages.storefront.inStock} (${available})`}
              </span>
            </div>
            {trans.shortDescription && (
              <p className="text-sm text-brand-charcoal-muted pt-1">{trans.shortDescription}</p>
            )}
          </div>

          {/* Variant Selector (Size + Color) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-brand-charcoal">
                {messages.pdp.selectSize} · {selectedVariant?.colorName}
              </span>
              <button
                type="button"
                onClick={() => setSizeGuideOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-burgundy hover:underline cursor-pointer"
              >
                <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{messages.pdp.sizeGuide}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {product.variants.map((v) => {
                const isSelected = v.id === selectedVariant?.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setSelectedVariantId(v.id);
                      setQuantity(1);
                    }}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-brand-burgundy bg-brand-burgundy text-brand-ivory-elevated'
                        : 'border-brand-border bg-brand-ivory-elevated text-brand-charcoal hover:bg-brand-ivory-muted'
                    } ${v.availableQty <= 0 ? 'opacity-50' : ''}`}
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-black/15 shrink-0"
                      style={{ backgroundColor: v.colorHex }}
                      aria-hidden="true"
                    />
                    <span>
                      {v.size} · {v.colorName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quantity & Actions */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center border border-brand-border rounded-lg bg-brand-ivory-elevated">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="h-11 w-11 inline-flex items-center justify-center hover:bg-brand-ivory-muted disabled:opacity-40 cursor-pointer"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="px-4 text-sm font-semibold tabular-nums">{quantity}</span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  disabled={quantity >= available}
                  onClick={() => setQuantity((q) => Math.min(available, q + 1))}
                  className="h-11 w-11 inline-flex items-center justify-center hover:bg-brand-ivory-muted disabled:opacity-40 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <Button
                fullWidth
                size="lg"
                isLoading={adding}
                disabled={available <= 0}
                onClick={() => void handleAddToBag(false)}
              >
                {available <= 0 ? messages.storefront.outOfStock : messages.pdp.addToBag}
              </Button>

              <button
                type="button"
                aria-label={messages.pdp.saveWishlist}
                onClick={() => void handleWishlistToggle()}
                className={`inline-flex h-12 w-12 items-center justify-center rounded-lg border transition-colors shrink-0 cursor-pointer ${
                  wishlisted
                    ? 'border-brand-burgundy bg-brand-burgundy-soft text-brand-burgundy'
                    : 'border-brand-border bg-brand-ivory-elevated text-brand-charcoal hover:bg-brand-ivory-muted'
                }`}
              >
                <Heart className="h-4 w-4" fill={wishlisted ? 'currentColor' : 'none'} />
              </button>
            </div>

            <Button
              variant="secondary"
              fullWidth
              disabled={available <= 0 || adding}
              onClick={() => void handleAddToBag(true)}
            >
              {messages.pdp.buyNow}
            </Button>

            <a
              href={buildWhatsAppHref(
                whatsappNumber,
                `Hi SHE-VALLEY, I have a question about "${trans.name}" (${selectedVariant?.sku || product.skuPrefix}).`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full min-h-10 items-center justify-center gap-2 rounded-lg border border-brand-border bg-brand-ivory px-4 py-2 text-xs font-medium text-brand-charcoal hover:bg-brand-ivory-muted transition-colors"
            >
              <MessageCircle className="h-4 w-4 text-brand-burgundy shrink-0" aria-hidden="true" />
              <span>{messages.social.askProductWhatsapp}</span>
            </a>
          </div>

          {/* Fabric / Shipping Tabs */}
          <div className="border-t border-brand-border pt-5 space-y-4">
            <div className="flex gap-2 border-b border-brand-border pb-2">
              <button
                type="button"
                onClick={() => setActiveTab('fabric')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                  activeTab === 'fabric'
                    ? 'bg-brand-burgundy text-brand-ivory-elevated'
                    : 'text-brand-charcoal-muted hover:text-brand-charcoal'
                }`}
              >
                {messages.pdp.fabricTab}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('shipping')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                  activeTab === 'shipping'
                    ? 'bg-brand-burgundy text-brand-ivory-elevated'
                    : 'text-brand-charcoal-muted hover:text-brand-charcoal'
                }`}
              >
                {messages.pdp.shippingTab}
              </button>
            </div>

            {activeTab === 'fabric' ? (
              <div className="space-y-3 text-sm text-brand-charcoal leading-relaxed">
                <p>{trans.description}</p>
                {fabricText && (
                  <p className="text-xs text-brand-charcoal-muted">{fabricText}</p>
                )}
                {careText && (
                  <p className="text-xs text-brand-charcoal-muted">{careText}</p>
                )}
                {trans.fitNotes && (
                  <p className="text-xs text-brand-burgundy font-medium">
                    {messages.pdp.fitNotes}: {trans.fitNotes}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2.5 text-sm text-brand-charcoal-muted leading-relaxed">
                <ShieldCheck className="h-5 w-5 text-brand-burgundy shrink-0 mt-0.5" />
                <p>{messages.pdp.shippingNote}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reviews & Submit Review */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 border-t border-brand-border pt-10">
        <div className="lg:col-span-7 space-y-4">
          <h2 className="font-display text-2xl font-semibold text-brand-charcoal">
            {messages.pdp.reviewsHeading} ({reviews.length})
          </h2>
          {reviews.length === 0 ? (
            <p className="text-sm text-brand-charcoal-muted">{messages.common.noResults}</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => (
                <div key={r.id} className="p-4 rounded-xl bg-brand-ivory-elevated border border-brand-border space-y-1">
                  <div className="flex items-center justify-between text-xs text-brand-charcoal-muted">
                    <span className="font-medium text-brand-charcoal">{r.authorName}</span>
                    <span>
                      {'★'.repeat(r.rating)} · {formatDate(r.createdAt, 'medium')}
                    </span>
                  </div>
                  <p className="text-sm text-brand-charcoal">{r.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5">
          <form
            onSubmit={handleReviewSubmit}
            className="p-5 rounded-xl bg-brand-ivory-elevated border border-brand-border space-y-3"
          >
            <h3 className="font-display text-xl font-semibold">{messages.pdp.writeReview}</h3>
            {reviewSuccess && (
              <Alert variant="success">{messages.pdp.reviewSubmitted}</Alert>
            )}
            <Input
              required
              value={reviewName}
              onChange={(e) => setReviewName(e.target.value)}
              placeholder={messages.pdp.reviewName}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                value={reviewRating}
                onChange={(e) => setReviewRating(e.target.value)}
                options={[
                  { value: '5', label: '5 ★' },
                  { value: '4', label: '4 ★' },
                  { value: '3', label: '3 ★' },
                  { value: '2', label: '2 ★' },
                  { value: '1', label: '1 ★' },
                ]}
              />
              <Select
                value={reviewFit}
                onChange={(e) => setReviewFit(e.target.value)}
                options={[
                  { value: 'TRUE_TO_SIZE', label: messages.pdp.fitTrue },
                  { value: 'RUNS_SMALL', label: messages.pdp.fitSmall },
                  { value: 'RUNS_LARGE', label: messages.pdp.fitLarge },
                ]}
              />
            </div>
            <Textarea
              required
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder={messages.pdp.reviewComment}
            />
            <Button type="submit" fullWidth>
              {messages.common.submit}
            </Button>
          </form>
        </div>
      </section>

      {/* Related & Recently Viewed */}
      {related.length > 0 && (
        <section className="space-y-6 border-t border-brand-border pt-10">
          <h2 className="font-display text-2xl font-semibold text-brand-charcoal">
            {messages.pdp.relatedTitle}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {recentItems.length > 0 && (
        <section className="space-y-4 border-t border-brand-border pt-8">
          <h2 className="font-display text-2xl font-semibold text-brand-charcoal">
            {messages.pdp.recentlyViewed}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {recentItems.map((r) => (
              <button
                key={r.slug}
                type="button"
                onClick={() => navigate(`/products/${r.slug}`)}
                className="text-left rounded-xl border border-brand-border bg-brand-ivory-elevated overflow-hidden hover:shadow-[var(--shadow-soft)] cursor-pointer"
              >
                <div className="aspect-[4/3] bg-brand-ivory-muted">
                  <ProductImage
                    src={r.imageUrl}
                    alt={locale === 'bn' ? r.nameBn : r.nameEn}
                    className="h-full w-full"
                  />
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-xs font-semibold truncate">{locale === 'bn' ? r.nameBn : r.nameEn}</p>
                  <p className="text-xs text-brand-charcoal-muted tabular-nums">
                    {formatCurrency(r.priceBdt)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Size Guide Modal */}
      <Modal
        isOpen={sizeGuideOpen}
        onClose={() => setSizeGuideOpen(false)}
        title={messages.pdp.sizeGuideTitle}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-brand-charcoal-muted leading-relaxed">{messages.pdp.sizeTip}</p>
          <div className="overflow-x-auto rounded-lg border border-brand-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-ivory-muted text-xs font-semibold text-brand-charcoal">
                <tr>
                  <th className="px-4 py-2.5">{messages.pdp.sizeCol}</th>
                  <th className="px-4 py-2.5">{messages.pdp.underbustCol}</th>
                  <th className="px-4 py-2.5">{messages.pdp.bustCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border tabular-nums">
                {(product.sizeGuide.length > 0
                  ? product.sizeGuide
                  : [
                      { size: '32B / S', underbustCm: '68–72 cm', bustCm: '82–86 cm' },
                      { size: '34B / M', underbustCm: '73–77 cm', bustCm: '87–91 cm' },
                      { size: '36C / L', underbustCm: '78–82 cm', bustCm: '93–97 cm' },
                      { size: '38D / XL', underbustCm: '83–87 cm', bustCm: '99–104 cm' },
                    ]
                ).map((row) => (
                  <tr key={row.size}>
                    <td className="px-4 py-2.5 font-medium">{row.size}</td>
                    <td className="px-4 py-2.5">{row.underbustCm}</td>
                    <td className="px-4 py-2.5">{row.bustCm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Image Zoom Lightbox Modal */}
      <Modal
        isOpen={zoomOpen}
        onClose={() => setZoomOpen(false)}
        title={trans.name}
        size="lg"
      >
        <div className="aspect-[4/3] rounded-xl overflow-hidden bg-brand-ivory-muted">
          <ProductImage src={activeImageUrl} alt={trans.name} className="w-full h-full object-contain" />
        </div>
      </Modal>
    </div>
  );
}
