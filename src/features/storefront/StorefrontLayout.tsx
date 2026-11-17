import { useEffect, useState, type ReactNode } from 'react';
import { Menu, MessageCircle, Minus, Plus, Search, ShoppingBag, Trash2, User, X } from 'lucide-react';
import { OfflineIndicator, PWAInstallButton } from '@/src/components/pwa/PwaControls';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Modal } from '@/src/components/ui/Modal';
import { useAuth } from '@/src/hooks/useAuth';
import { useCart } from '@/src/hooks/useCart';
import { useLocale } from '@/src/hooks/useLocale';
import { useRouter } from '@/src/hooks/useRouter';
import {
  buildWhatsAppHref,
  getAnalyticsConsent,
  setAnalyticsConsent,
  trackMarketingEvent,
} from '@/src/lib/analytics';
import type { StorefrontBanner, StorefrontBootstrapData } from '@/src/lib/apiClient';
import { ProductImage } from './ProductImage';

export function StorefrontLayout({
  children,
  announcementBanner,
  freeDeliveryThresholdBdt = 2500,
  contactSocial,
  marketingConfig,
}: {
  children: ReactNode;
  announcementBanner?: StorefrontBanner;
  freeDeliveryThresholdBdt?: number;
  contactSocial?: StorefrontBootstrapData['contactSocial'];
  marketingConfig?: StorefrontBootstrapData['marketingConfig'];
}) {
  const { locale, messages, formatCurrency } = useLocale();
  const { cleanPath, navigate, switchLanguageAndRoute } = useRouter();
  const { user, isStaff } = useAuth();
  const { cart, isDrawerOpen, openDrawer, closeDrawer, updateQuantity, removeItem } = useCart();

  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [consentState, setConsentState] = useState<'granted' | 'denied' | 'unset'>(() => getAnalyticsConsent());

  const whatsappNumber = contactSocial?.whatsappNumber || '01828-298143';
  const messengerUrl = contactSocial?.messengerUrl || 'https://m.me/SheValley';
  const instagramHandle = contactSocial?.instagramHandle || '@she-valley';
  const instagramUrl = contactSocial?.instagramUrl || 'https://instagram.com/she-valley';
  const facebookPageUrl = contactSocial?.facebookPageUrl || 'https://facebook.com/SheValley';
  const showFloatingWhatsapp = contactSocial?.floatingWhatsappEnabled !== false;
  const showConsentBanner =
    consentState === 'unset' && marketingConfig?.requireCookieConsentForMarketing !== false;

  const announcementText = announcementBanner
    ? locale === 'bn'
      ? announcementBanner.titleBn
      : announcementBanner.titleEn
    : messages.brand.discreetNote;

  const navItems = [
    { label: messages.nav.shop, href: '/shop' },
    { label: messages.nav.categories, href: '/shop?category=womens-innerwear' },
    { label: messages.nav.trackOrder, href: '/track-order' },
    { label: messages.nav.journal, href: '/journal' },
    { label: messages.nav.about, href: '/about' },
  ];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchTerm.trim();
    if (q) {
      trackMarketingEvent({ eventName: 'Search', metadata: { searchTerm: q } });
    }
    setSearchOpen(false);
    navigate(`/shop${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  };

  useEffect(() => {
    if (!isDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDrawer();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDrawerOpen, closeDrawer]);

  const remainingForFreeShipping = Math.max(0, freeDeliveryThresholdBdt - cart.subtotalBdt);

  return (
    <div className="min-h-screen flex flex-col bg-brand-ivory text-brand-charcoal">
      <OfflineIndicator />
      {/* Slim Dismissible Announcement Bar (<= 36px) */}
      {!bannerDismissed && (
        <div className="bg-brand-burgundy text-brand-ivory-elevated text-xs">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 h-9 flex items-center justify-between gap-4">
            <p className="truncate font-medium tracking-wide">{announcementText}</p>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              aria-label={messages.common.dismiss}
              className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* 3-Zone Top Header */}
      <header className="sticky top-0 z-30 bg-brand-ivory/95 backdrop-blur-sm border-b border-brand-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-drawer"
              className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-lg text-brand-charcoal hover:bg-brand-ivory-muted cursor-pointer"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <a
              href={`/${locale}`}
              onClick={(e) => {
                e.preventDefault();
                navigate('/');
              }}
              className="font-display text-2xl font-semibold tracking-wider text-brand-burgundy whitespace-nowrap shrink-0"
            >
              {messages.brand.name}
            </a>
          </div>

          {/* Zone 2: Clean Single-Line Nav Links */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6">
            {navItems.map((item) => {
              const isActive = cleanPath === item.href.split('?')[0];
              return (
                <a
                  key={item.href}
                  href={`/${locale}${item.href}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(item.href);
                  }}
                  className={`text-sm font-medium whitespace-nowrap shrink-0 transition-colors hover:text-brand-burgundy ${
                    isActive ? 'text-brand-burgundy underline underline-offset-4' : 'text-brand-charcoal'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Zone 3: Utility Actions + Shopping Bag */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label={messages.nav.search}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-brand-charcoal hover:bg-brand-ivory-muted transition-colors cursor-pointer"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => switchLanguageAndRoute()}
              aria-label={locale === 'en' ? 'Switch language to Bengali' : 'Switch language to English'}
              className="inline-flex min-h-10 items-center rounded-lg px-2.5 text-xs font-medium text-brand-charcoal border border-brand-border hover:bg-brand-ivory-muted transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {messages.nav.languageSwitch}
            </button>

            <button
              type="button"
              onClick={() => navigate(user ? (isStaff ? '/admin' : '/account') : '/login')}
              aria-label={user ? messages.nav.account : messages.nav.signIn}
              className="hidden sm:inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-brand-charcoal hover:bg-brand-ivory-muted transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <User className="h-4 w-4" aria-hidden="true" />
              <span>{user ? (isStaff ? messages.nav.admin : messages.nav.account) : messages.nav.signIn}</span>
            </button>

            <button
              type="button"
              onClick={openDrawer}
              aria-label={messages.nav.bag}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-burgundy px-3.5 py-2 text-xs font-medium text-brand-ivory-elevated hover:bg-brand-burgundy-hover transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              <span>{messages.nav.bag}</span>
              <span className="tabular-nums font-mono">({cart.itemCount})</span>
            </button>
          </div>
        </div>

        {/* Mobile Drawer Navigation */}
        {mobileMenuOpen && (
          <div id="mobile-nav-drawer" className="md:hidden border-t border-brand-border bg-brand-ivory-elevated px-4 py-4 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.href}
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate(item.href);
                }}
                className="flex w-full min-h-11 items-center rounded-lg px-3 text-sm font-medium text-brand-charcoal hover:bg-brand-ivory-muted cursor-pointer"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                navigate(user ? (isStaff ? '/admin' : '/account') : '/login');
              }}
              className="flex w-full min-h-11 items-center rounded-lg px-3 text-sm font-medium text-brand-burgundy hover:bg-brand-ivory-muted cursor-pointer"
            >
              {user ? (isStaff ? messages.nav.admin : messages.nav.account) : messages.nav.signIn}
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Clean Footer */}
      <footer className="bg-brand-charcoal text-brand-ivory border-t border-brand-border mt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <p className="font-display text-2xl font-semibold tracking-wider text-brand-ivory">
              {messages.brand.name}
            </p>
            <p className="text-xs tracking-widest text-brand-nude">{messages.brand.slogan}</p>
            <p className="text-sm text-brand-ivory/80 leading-relaxed">
              {messages.brand.discreetNote}
            </p>
            <div className="pt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-brand-nude">
              <a
                href={buildWhatsAppHref(whatsappNumber, 'Hi SHE-VALLEY, I would like discreet sizing help.')}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                WhatsApp ({whatsappNumber})
              </a>
              <a href={messengerUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                Messenger
              </a>
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {instagramHandle}
              </a>
              <a href={facebookPageUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                Facebook
              </a>
            </div>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold tracking-wider uppercase text-brand-nude">
              {messages.footer.shopHeading}
            </h3>
            <ul className="space-y-2 text-sm text-brand-ivory/85">
              <li>
                <button type="button" onClick={() => navigate('/shop')} className="hover:underline cursor-pointer">
                  {messages.nav.shop}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/shop?category=everyday-bras')}
                  className="hover:underline cursor-pointer"
                >
                  {locale === 'bn' ? 'প্রতিদিনের ব্রা' : 'Everyday Bras'}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/shop?category=organic-briefs')}
                  className="hover:underline cursor-pointer"
                >
                  {locale === 'bn' ? 'কটন ব্রিফ' : 'Cotton Briefs'}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/shop?category=maternity-comfort')}
                  className="hover:underline cursor-pointer"
                >
                  {locale === 'bn' ? 'ম্যাটারনিটি ও নার্সিং' : 'Maternity & Nursing'}
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold tracking-wider uppercase text-brand-nude">
              {messages.footer.careHeading}
            </h3>
            <ul className="space-y-2 text-sm text-brand-ivory/85">
              <li>
                <button type="button" onClick={() => navigate('/track-order')} className="hover:underline cursor-pointer">
                  {messages.nav.trackOrder}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate('/faq')} className="hover:underline cursor-pointer">
                  {messages.nav.faq}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate('/contact')} className="hover:underline cursor-pointer">
                  {messages.nav.contact}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate('/journal')} className="hover:underline cursor-pointer">
                  {messages.nav.journal}
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold tracking-wider uppercase text-brand-nude">
              {messages.footer.legalHeading}
            </h3>
            <ul className="space-y-2 text-sm text-brand-ivory/85">
              <li>
                <button type="button" onClick={() => navigate('/about')} className="hover:underline cursor-pointer">
                  {messages.nav.about}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate('/policies/privacy-policy')} className="hover:underline cursor-pointer">
                  {locale === 'bn' ? 'গোপনীয়তা নীতিমালা' : 'Privacy Policy'}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate('/policies/return-policy')} className="hover:underline cursor-pointer">
                  {locale === 'bn' ? 'রিটার্ন নীতিমালা' : 'Return Policy'}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate('/admin')} className="hover:underline cursor-pointer text-brand-nude">
                  {messages.nav.admin}
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-brand-ivory/70">
            <p>{messages.footer.copyright}</p>
            <p>BDT (৳) · Cash on Delivery</p>
          </div>
        </div>
      </footer>

      {/* Search Overlay Modal */}
      <Modal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        title={messages.nav.search}
        size="sm"
      >
        <form onSubmit={handleSearchSubmit} className="space-y-4">
          <Input
            autoFocus
            aria-label={messages.nav.search}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={messages.common.searchPlaceholder}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSearchOpen(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit">{messages.nav.search}</Button>
          </div>
        </form>
      </Modal>

      {/* Slide-Over Shopping Bag Drawer */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-brand-charcoal/45"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeDrawer();
            }
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={messages.cart.drawerTitle}
            className="w-full max-w-md bg-brand-ivory-elevated h-full flex flex-col border-l border-brand-border shadow-[var(--shadow-modal)]"
          >
            <div className="px-5 py-4 border-b border-brand-border flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold text-brand-charcoal">
                {messages.cart.drawerTitle} ({cart.itemCount})
              </h2>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label={messages.common.close}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-brand-ivory-muted cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {cart.items.length > 0 && (
              <div className="px-5 py-2.5 bg-brand-ivory-muted/70 border-b border-brand-border text-xs text-brand-charcoal">
                {remainingForFreeShipping === 0
                  ? messages.cart.freeShippingUnlocked
                  : messages.cart.freeShippingRemaining.replace('{amount}', formatCurrency(remainingForFreeShipping))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {cart.items.length === 0 ? (
                <div className="py-16 text-center space-y-4">
                  <p className="font-display text-xl font-semibold">{messages.cart.emptyTitle}</p>
                  <p className="text-sm text-brand-charcoal-muted">{messages.cart.emptyDesc}</p>
                  <Button
                    onClick={() => {
                      closeDrawer();
                      navigate('/shop');
                    }}
                  >
                    {messages.cart.continueShopping}
                  </Button>
                </div>
              ) : (
                cart.items.map((item) => (
                  <div
                    key={item.variantId}
                    className="flex gap-3.5 pb-4 border-b border-brand-border/80"
                  >
                    <div className="h-20 w-20 rounded-lg overflow-hidden bg-brand-ivory-muted shrink-0">
                      <ProductImage
                        src={item.imageUrl}
                        alt={locale === 'bn' ? item.name.bn : item.name.en}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-brand-charcoal truncate">
                        {locale === 'bn' ? item.name.bn : item.name.en}
                      </p>
                      <p className="text-xs text-brand-charcoal-muted">
                        {item.size} · {item.colorName}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <div className="inline-flex items-center border border-brand-border rounded-lg bg-brand-ivory">
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            onClick={() =>
                              item.quantity <= 1
                                ? void removeItem(item.variantId)
                                : void updateQuantity(item.variantId, item.quantity - 1)
                            }
                            className="h-8 w-8 inline-flex items-center justify-center hover:bg-brand-ivory-muted cursor-pointer"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="px-2.5 text-xs font-medium tabular-nums">{item.quantity}</span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            disabled={item.quantity >= item.availableQty}
                            onClick={() => void updateQuantity(item.variantId, item.quantity + 1)}
                            className="h-8 w-8 inline-flex items-center justify-center hover:bg-brand-ivory-muted disabled:opacity-40 cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold tabular-nums">
                            {formatCurrency(item.lineTotalBdt)}
                          </span>
                          <button
                            type="button"
                            aria-label={messages.cart.remove}
                            onClick={() => void removeItem(item.variantId)}
                            className="p-1.5 text-brand-charcoal-muted hover:text-status-error-fg cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.items.length > 0 && (
              <div className="p-5 border-t border-brand-border bg-brand-ivory space-y-3">
                <div className="flex items-center justify-between text-base font-semibold">
                  <span>{messages.cart.subtotal}</span>
                  <span className="tabular-nums">{formatCurrency(cart.subtotalBdt)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      closeDrawer();
                      navigate('/cart');
                    }}
                  >
                    {messages.cart.viewBag}
                  </Button>
                  <Button
                    onClick={() => {
                      closeDrawer();
                      navigate('/checkout');
                    }}
                  >
                    {messages.cart.proceedCheckout}
                  </Button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Floating Discreet WhatsApp Help Button */}
      {showFloatingWhatsapp && (
        <a
          href={buildWhatsAppHref(whatsappNumber, 'Hello SHE-VALLEY Care Team, I have a question.')}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={messages.social.whatsappCta}
          className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-brand-burgundy text-brand-ivory-elevated px-4 py-2.5 text-xs font-medium shadow-[var(--shadow-soft)] hover:bg-brand-burgundy-hover transition-colors whitespace-nowrap"
        >
          <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">{messages.social.whatsappCta}</span>
        </a>
      )}

      {/* Privacy-First Analytics Consent Bar */}
      {showConsentBanner && (
        <div
          role="region"
          aria-label="Analytics consent"
          className="fixed bottom-4 left-4 right-20 sm:right-auto sm:max-w-md z-30 rounded-xl border border-brand-border bg-brand-ivory-elevated p-3.5 shadow-[var(--shadow-modal)] flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <p className="text-xs text-brand-charcoal leading-relaxed">{messages.consent.bannerText}</p>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setAnalyticsConsent('denied');
                setConsentState('denied');
              }}
            >
              {messages.consent.decline}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setAnalyticsConsent('granted');
                setConsentState('granted');
              }}
            >
              {messages.consent.accept}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
