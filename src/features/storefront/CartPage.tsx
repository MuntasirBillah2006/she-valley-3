import { Minus, Plus, Trash2 } from 'lucide-react';
import { EmptyState } from '@/src/components/feedback/EmptyState';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { useCart } from '@/src/hooks/useCart';
import { useLocale } from '@/src/hooks/useLocale';
import { useRouter } from '@/src/hooks/useRouter';
import { ProductImage } from './ProductImage';

export function CartPage({ freeDeliveryThresholdBdt = 2500 }: { freeDeliveryThresholdBdt?: number }) {
  const { locale, messages, formatCurrency } = useLocale();
  const { navigate } = useRouter();
  const { cart, updateQuantity, removeItem } = useCart();

  const remaining = Math.max(0, freeDeliveryThresholdBdt - cart.subtotalBdt);

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

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 space-y-8">
      <div className="border-b border-brand-border pb-4 flex items-center justify-between">
        <h1 className="font-display text-4xl font-semibold text-brand-charcoal">
          {messages.cart.title}
        </h1>
        <p className="text-sm text-brand-charcoal-muted tabular-nums">({cart.itemCount})</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-4">
          {cart.items.map((item) => (
            <Card key={item.variantId} padding="sm" className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="h-24 w-28 rounded-lg overflow-hidden bg-brand-ivory-muted shrink-0">
                <ProductImage
                  src={item.imageUrl}
                  alt={locale === 'bn' ? item.name.bn : item.name.en}
                  className="h-full w-full"
                />
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <button
                  type="button"
                  onClick={() => navigate(`/products/${item.slug}`)}
                  className="text-base font-semibold text-brand-charcoal hover:text-brand-burgundy text-left cursor-pointer"
                >
                  {locale === 'bn' ? item.name.bn : item.name.en}
                </button>
                <p className="text-xs text-brand-charcoal-muted">
                  {item.size} · {item.colorName} · <span className="font-mono">{item.sku}</span>
                </p>
                <p className="text-xs text-brand-charcoal-muted tabular-nums">
                  {formatCurrency(item.unitPriceBdt)} · {item.availableQty} {messages.cart.available}
                </p>
              </div>

              <div className="flex items-center gap-4 self-end sm:self-center">
                <div className="inline-flex items-center border border-brand-border rounded-lg bg-brand-ivory">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() =>
                      item.quantity <= 1
                        ? void removeItem(item.variantId)
                        : void updateQuantity(item.variantId, item.quantity - 1)
                    }
                    className="h-10 w-10 inline-flex items-center justify-center hover:bg-brand-ivory-muted cursor-pointer"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="px-3 text-sm font-medium tabular-nums">{item.quantity}</span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={item.quantity >= item.availableQty}
                    onClick={() => void updateQuantity(item.variantId, item.quantity + 1)}
                    className="h-10 w-10 inline-flex items-center justify-center hover:bg-brand-ivory-muted disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <span className="text-base font-semibold tabular-nums min-w-[76px] text-right">
                  {formatCurrency(item.lineTotalBdt)}
                </span>

                <button
                  type="button"
                  aria-label={messages.cart.remove}
                  onClick={() => void removeItem(item.variantId)}
                  className="p-2 text-brand-charcoal-muted hover:text-status-error-fg cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>

        <Card className="lg:col-span-4 space-y-5">
          <h2 className="font-display text-2xl font-semibold">{messages.checkout.orderSummary}</h2>
          <p className="text-xs text-brand-charcoal-muted">
            {remaining === 0
              ? messages.cart.freeShippingUnlocked
              : messages.cart.freeShippingRemaining.replace('{amount}', formatCurrency(remaining))}
          </p>
          <div className="flex items-center justify-between border-t border-brand-border pt-4 text-base font-semibold">
            <span>{messages.cart.subtotal}</span>
            <span className="tabular-nums">{formatCurrency(cart.subtotalBdt)}</span>
          </div>
          <Button fullWidth size="lg" onClick={() => navigate('/checkout')}>
            {messages.cart.proceedCheckout}
          </Button>
          <Button variant="secondary" fullWidth onClick={() => navigate('/shop')}>
            {messages.cart.continueShopping}
          </Button>
        </Card>
      </div>
    </div>
  );
}
