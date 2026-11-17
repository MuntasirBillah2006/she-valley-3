import { ArrowRight, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { useLocale } from '@/src/hooks/useLocale';
import { useRouter } from '@/src/hooks/useRouter';
import type { StorefrontBootstrapData } from '@/src/lib/apiClient';
import { ProductCard } from './ProductCard';
import { ProductImage } from './ProductImage';

export function HomePage({ bootstrap }: { bootstrap: StorefrontBootstrapData | null }) {
  const { locale, messages, formatDate } = useLocale();
  const { navigate } = useRouter();

  const heroBanner = bootstrap?.banners.find((b) => b.placement === 'HERO');
  const heroHeadline = heroBanner
    ? locale === 'bn'
      ? heroBanner.titleBn
      : heroBanner.titleEn
    : messages.storefront.heroHeadline;
  const heroSubcopy = heroBanner
    ? locale === 'bn'
      ? heroBanner.subtitleBn || messages.storefront.heroSubcopy
      : heroBanner.subtitleEn || messages.storefront.heroSubcopy
    : messages.storefront.heroSubcopy;
  const heroImg = heroBanner?.imageUrl || '/src/assets/images/hero_innerwear_atelier_1794849871246.jpg';

  const categories = (bootstrap?.categories ?? []).filter((c) => c.parentId !== null);
  const featured = bootstrap?.featuredProducts ?? [];
  const newArrivals = bootstrap?.newArrivals ?? [];
  const reviews = bootstrap?.reviews ?? [];
  const posts = bootstrap?.blogPosts ?? [];

  return (
    <div className="space-y-20 pb-8">
      {/* 1. Asymmetric Editorial Split Hero */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-8 sm:pt-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6 py-4">
            <p className="text-xs font-medium tracking-widest uppercase text-brand-burgundy">
              {messages.storefront.heroEyebrow}
            </p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold leading-[1.08] text-brand-charcoal">
              {heroHeadline}
            </h1>
            <p className="text-base text-brand-charcoal-muted max-w-xl leading-relaxed">
              {heroSubcopy}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                size="lg"
                rightIcon={<ArrowRight className="h-4 w-4" />}
                onClick={() => navigate('/shop')}
              >
                {messages.storefront.heroCta}
              </Button>
              <Button variant="secondary" size="lg" onClick={() => navigate('/track-order')}>
                {messages.storefront.heroSecondaryCta}
              </Button>
            </div>
            <p className="text-xs text-brand-charcoal-muted pt-2">
              {messages.brand.slogan} · {messages.brand.positioning}
            </p>
          </div>

          <div className="lg:col-span-6 rounded-2xl overflow-hidden border border-brand-border bg-brand-ivory-muted min-h-[320px] lg:min-h-[460px]">
            <ProductImage
              src={heroImg}
              alt={heroHeadline}
              priority
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* 2. Categories + Featured Essentials */}
      {categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-brand-border pb-4">
            <div className="space-y-1">
              <h2 className="font-display text-3xl font-semibold text-brand-charcoal">
                {messages.storefront.categoriesTitle}
              </h2>
              <p className="text-sm text-brand-charcoal-muted">
                {messages.storefront.categoriesSubtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/shop')}
              className="text-sm font-medium text-brand-burgundy hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              {messages.common.viewAll} →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {categories.map((cat) => {
              const t = cat.translations[locale] || cat.translations.en;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => navigate(`/shop?category=${cat.slug}`)}
                  className="group text-left rounded-xl overflow-hidden bg-brand-ivory-elevated border border-brand-border hover:shadow-[var(--shadow-soft)] transition-all cursor-pointer"
                >
                  <div className="aspect-[4/3] overflow-hidden bg-brand-ivory-muted">
                    <ProductImage
                      src={cat.imageUrl}
                      alt={t.name}
                      className="h-full w-full transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="p-4 space-y-1">
                    <h3 className="font-display text-xl font-semibold text-brand-charcoal">
                      {t.name}
                    </h3>
                    {t.description && (
                      <p className="text-xs text-brand-charcoal-muted line-clamp-2">{t.description}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Featured Collection Grid */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-brand-border pb-4">
          <div className="space-y-1">
            <h2 className="font-display text-3xl font-semibold text-brand-charcoal">
              {messages.storefront.featuredTitle}
            </h2>
            <p className="text-sm text-brand-charcoal-muted">{messages.storefront.featuredSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/shop')}
            className="text-sm font-medium text-brand-burgundy hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            {messages.common.viewAll} →
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.slice(0, 6).map((prod) => (
            <ProductCard key={prod.id} product={prod} />
          ))}
        </div>
      </section>

      {/* 4. Discreet Privacy, Craft Story & Trust Guarantees */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="rounded-2xl border border-brand-border bg-brand-ivory-elevated overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-5 min-h-[260px] bg-brand-ivory-muted">
            <ProductImage
              src="/src/assets/images/she_valley_fabric_editorial_1794848670027.jpg"
              alt={messages.storefront.storyTitle}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center space-y-6">
            <div className="space-y-2">
              <h2 className="font-display text-3xl font-semibold text-brand-charcoal">
                {messages.storefront.storyTitle}
              </h2>
              <p className="text-sm sm:text-base text-brand-charcoal-muted leading-relaxed">
                {messages.storefront.storyBody}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-brand-border">
              <div className="space-y-1.5">
                <ShieldCheck className="h-5 w-5 text-brand-burgundy" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-brand-charcoal">
                  {messages.storefront.trustPlain}
                </h3>
                <p className="text-xs text-brand-charcoal-muted">{messages.storefront.trustPlainDesc}</p>
              </div>
              <div className="space-y-1.5">
                <Truck className="h-5 w-5 text-brand-burgundy" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-brand-charcoal">
                  {messages.storefront.trustCod}
                </h3>
                <p className="text-xs text-brand-charcoal-muted">{messages.storefront.trustCodDesc}</p>
              </div>
              <div className="space-y-1.5">
                <Sparkles className="h-5 w-5 text-brand-burgundy" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-brand-charcoal">
                  {messages.storefront.trustFit}
                </h3>
                <p className="text-xs text-brand-charcoal-muted">{messages.storefront.trustFitDesc}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. New Arrivals + Customer Voices & Journal */}
      {newArrivals.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-brand-border pb-4">
            <div className="space-y-1">
              <h2 className="font-display text-3xl font-semibold text-brand-charcoal">
                {messages.storefront.newArrivalsTitle}
              </h2>
              <p className="text-sm text-brand-charcoal-muted">
                {messages.storefront.newArrivalsSubtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/shop?sort=newest')}
              className="text-sm font-medium text-brand-burgundy hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              {messages.common.viewAll} →
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {newArrivals.slice(0, 3).map((prod) => (
              <ProductCard key={prod.id} product={prod} />
            ))}
          </div>
        </section>
      )}

      {(reviews.length > 0 || posts.length > 0) && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {reviews.length > 0 && (
            <div className="lg:col-span-6 space-y-4">
              <h2 className="font-display text-2xl font-semibold text-brand-charcoal">
                {messages.storefront.reviewsTitle}
              </h2>
              <div className="space-y-3">
                {reviews.slice(0, 3).map((rev) => (
                  <div
                    key={rev.id}
                    className="p-4 rounded-xl bg-brand-ivory-elevated border border-brand-border space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs text-brand-charcoal-muted">
                      <span className="font-medium text-brand-charcoal">{rev.authorName}</span>
                      <span className="tabular-nums">{'★'.repeat(rev.rating)}</span>
                    </div>
                    <p className="text-sm text-brand-charcoal leading-relaxed">“{rev.comment}”</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {posts.length > 0 && (
            <div className="lg:col-span-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-semibold text-brand-charcoal">
                  {messages.storefront.journalTitle}
                </h2>
                <button
                  type="button"
                  onClick={() => navigate('/journal')}
                  className="text-xs font-medium text-brand-burgundy hover:underline cursor-pointer"
                >
                  {messages.common.viewAll} →
                </button>
              </div>
              <div className="space-y-3">
                {posts.slice(0, 2).map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => navigate(`/journal/${post.slug}`)}
                    className="w-full text-left p-4 rounded-xl bg-brand-ivory-elevated border border-brand-border hover:shadow-[var(--shadow-soft)] transition-all space-y-1.5 cursor-pointer"
                  >
                    <p className="text-xs text-brand-charcoal-muted">
                      {post.publishedAt ? formatDate(post.publishedAt, 'medium') : ''}
                    </p>
                    <h3 className="font-display text-xl font-semibold text-brand-charcoal">
                      {locale === 'bn' ? post.titleBn : post.titleEn}
                    </h3>
                    <p className="text-sm text-brand-charcoal-muted line-clamp-2">
                      {locale === 'bn' ? post.excerptBn : post.excerptEn}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
