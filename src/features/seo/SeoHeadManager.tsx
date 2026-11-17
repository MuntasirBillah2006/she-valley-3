import { useEffect } from 'react';
import { useLocale } from '@/src/hooks/useLocale';
import { useRouter } from '@/src/hooks/useRouter';
import type { StorefrontBootstrapData } from '@/src/lib/apiClient';

function upsertMeta(attrName: 'name' | 'property', key: string, content: string) {
  if (typeof document === 'undefined' || !content) return;
  let el = document.querySelector(`meta[${attrName}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string, hreflang?: string) {
  if (typeof document === 'undefined' || !href) return;
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]:not([hreflang])`;
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    if (hreflang) el.setAttribute('hreflang', hreflang);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function SeoHeadManager({
  marketingConfig,
}: {
  marketingConfig?: StorefrontBootstrapData['marketingConfig'];
}) {
  const { locale } = useLocale();
  const { cleanPath } = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const origin = window.location.origin;
    const normalized = cleanPath === '/' ? '' : cleanPath;
    const canonical = `${origin}/${locale}${normalized}`;
    const enHref = `${origin}/en${normalized}`;
    const bnHref = `${origin}/bn${normalized}`;

    upsertLink('canonical', canonical);
    upsertLink('alternate', enHref, 'en');
    upsertLink('alternate', bnHref, 'bn');
    upsertLink('alternate', enHref, 'x-default');

    upsertMeta('property', 'og:url', canonical);
    upsertMeta('property', 'og:locale', locale === 'bn' ? 'bn_BD' : 'en_BD');
    upsertMeta('property', 'og:site_name', 'SHE-VALLEY');

    if (marketingConfig?.searchConsoleVerification) {
      upsertMeta('name', 'google-site-verification', marketingConfig.searchConsoleVerification);
    }

    // Global Organization JSON-LD
    const orgId = 'sv-jsonld-org';
    let script = document.getElementById(orgId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = orgId;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'SHE-VALLEY',
      url: origin,
      slogan: 'BE COMFORTABLE. BE CONFIDENT.',
      sameAs: ['https://instagram.com/she-valley', 'https://facebook.com/SheValley'],
    });
  }, [locale, cleanPath, marketingConfig]);

  return null;
}

export function ProductJsonLd({
  name,
  description,
  sku,
  priceBdt,
  inStock,
  imageUrl,
  slug,
  categoryName,
}: {
  name: string;
  description: string;
  sku: string;
  priceBdt: number;
  inStock: boolean;
  imageUrl?: string | null;
  slug: string;
  categoryName: string;
}) {
  const { locale } = useLocale();

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const origin = window.location.origin;

    const prodScriptId = 'sv-jsonld-product';
    let prodEl = document.getElementById(prodScriptId) as HTMLScriptElement | null;
    if (!prodEl) {
      prodEl = document.createElement('script');
      prodEl.id = prodScriptId;
      prodEl.type = 'application/ld+json';
      document.head.appendChild(prodEl);
    }
    prodEl.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name,
      description,
      sku,
      brand: { '@type': 'Brand', name: 'SHE-VALLEY' },
      ...(imageUrl ? { image: imageUrl.startsWith('http') ? imageUrl : `${origin}${imageUrl}` } : {}),
      offers: {
        '@type': 'Offer',
        url: `${origin}/${locale}/products/${slug}`,
        priceCurrency: 'BDT',
        price: priceBdt.toFixed(2),
        availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      },
    });

    const bcScriptId = 'sv-jsonld-breadcrumb';
    let bcEl = document.getElementById(bcScriptId) as HTMLScriptElement | null;
    if (!bcEl) {
      bcEl = document.createElement('script');
      bcEl.id = bcScriptId;
      bcEl.type = 'application/ld+json';
      document.head.appendChild(bcEl);
    }
    bcEl.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/${locale}` },
        { '@type': 'ListItem', position: 2, name: categoryName, item: `${origin}/${locale}/shop` },
        { '@type': 'ListItem', position: 3, name, item: `${origin}/${locale}/products/${slug}` },
      ],
    });

    return () => {
      document.getElementById(prodScriptId)?.remove();
      document.getElementById(bcScriptId)?.remove();
    };
  }, [name, description, sku, priceBdt, inStock, imageUrl, slug, categoryName, locale]);

  return null;
}
