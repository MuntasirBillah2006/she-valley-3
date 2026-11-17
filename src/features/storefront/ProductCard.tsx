import { ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { useCart } from '@/src/hooks/useCart';
import { useLocale } from '@/src/hooks/useLocale';
import { useRouter } from '@/src/hooks/useRouter';
import { useToast } from '@/src/hooks/useToast';
import type { StorefrontProduct } from '@/src/lib/apiClient';
import { ProductImage } from './ProductImage';

export function ProductCard({ product }: { product: StorefrontProduct }) {
  const { locale, messages, formatCurrency } = useLocale();
  const { navigate } = useRouter();
  const { addItem } = useCart();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);

  const trans = product.translations[locale] || product.translations.en;
  const catLabel = locale === 'bn' ? product.categoryName.bn : product.categoryName.en;
  const primaryImage = product.images.find((i) => i.isPrimary) ?? product.images[0];
  const defaultVariant =
    product.variants.find((v) => v.availableQty > 0) ?? product.variants[0];
  const minPrice =
    product.variants.length > 0
      ? Math.min(...product.variants.map((v) => v.priceBdt))
      : product.basePriceBdt;

  const handleQuickAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!defaultVariant || defaultVariant.availableQty <= 0) {
      navigate(`/products/${product.slug}`);
      return;
    }
    setAdding(true);
    try {
      await addItem(defaultVariant.id, 1, true);
      showToast({ title: trans.name, message: `${defaultVariant.size} · ${defaultVariant.colorName}`, variant: 'success' });
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

  return (
    <article
      onClick={() => navigate(`/products/${product.slug}`)}
      className="group flex flex-col bg-brand-ivory-elevated border border-brand-border rounded-xl overflow-hidden cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-brand-ivory-muted">
        <ProductImage
          src={primaryImage?.url}
          alt={trans.name}
          className="h-full w-full transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>

      <div className="flex flex-1 flex-col justify-between p-4 gap-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs text-brand-charcoal-muted">
            <span className="truncate">{catLabel || product.brandName}</span>
            <span className="shrink-0">
              {product.totalAvailableStock > 0
                ? messages.storefront.inStock
                : messages.storefront.outOfStock}
            </span>
          </div>
          <h3 className="text-base font-semibold text-brand-charcoal leading-snug line-clamp-2">
            {trans.name}
          </h3>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-brand-border/70">
          <span className="text-[15px] font-semibold text-brand-charcoal tabular-nums">
            {formatCurrency(minPrice)}
          </span>
          <button
            type="button"
            disabled={adding || !defaultVariant || defaultVariant.availableQty <= 0}
            onClick={handleQuickAdd}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-brand-burgundy text-brand-ivory-elevated hover:bg-brand-burgundy-hover disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{messages.storefront.quickAdd}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
