/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { ErrorBoundary } from '@/src/components/feedback/ErrorBoundary';
import { LoadingIndicator } from '@/src/components/feedback/LoadingIndicator';
import { DEFAULT_DELIVERY_CHARGES } from '@/src/config/bangladesh';
import { SeoHeadManager } from '@/src/features/seo/SeoHeadManager';
import { HomePage } from '@/src/features/storefront/HomePage';
import { StorefrontLayout } from '@/src/features/storefront/StorefrontLayout';
import { AuthProvider } from '@/src/hooks/useAuth';
import { CartProvider } from '@/src/hooks/useCart';
import { LocaleProvider, useLocale } from '@/src/hooks/useLocale';
import { RouterProvider, useRouter } from '@/src/hooks/useRouter';
import { ToastProvider } from '@/src/hooks/useToast';
import { apiClient, type StorefrontBootstrapData } from '@/src/lib/apiClient';

const AdminPortal = lazy(() =>
  import('@/src/features/admin/AdminPortal').then((m) => ({ default: m.AdminPortal })),
);
const AccountDashboardPage = lazy(() =>
  import('@/src/features/account/AccountDashboardPage').then((m) => ({ default: m.AccountDashboardPage })),
);
const LoginPage = lazy(() =>
  import('@/src/features/account/AuthPages').then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('@/src/features/account/AuthPages').then((m) => ({ default: m.RegisterPage })),
);
const ResetPasswordPage = lazy(() =>
  import('@/src/features/account/AuthPages').then((m) => ({ default: m.ResetPasswordPage })),
);
const ShopPage = lazy(() =>
  import('@/src/features/storefront/ShopPage').then((m) => ({ default: m.ShopPage })),
);
const ProductDetailPage = lazy(() =>
  import('@/src/features/storefront/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage })),
);
const CartPage = lazy(() =>
  import('@/src/features/storefront/CartPage').then((m) => ({ default: m.CartPage })),
);
const CheckoutPage = lazy(() =>
  import('@/src/features/storefront/CheckoutPage').then((m) => ({ default: m.CheckoutPage })),
);
const TrackOrderPage = lazy(() =>
  import('@/src/features/storefront/TrackOrderPage').then((m) => ({ default: m.TrackOrderPage })),
);
const FaqPage = lazy(() =>
  import('@/src/features/storefront/ContentPages').then((m) => ({ default: m.FaqPage })),
);
const JournalListPage = lazy(() =>
  import('@/src/features/storefront/ContentPages').then((m) => ({ default: m.JournalListPage })),
);
const JournalDetailPage = lazy(() =>
  import('@/src/features/storefront/ContentPages').then((m) => ({ default: m.JournalDetailPage })),
);
const StaticOrPolicyPage = lazy(() =>
  import('@/src/features/storefront/ContentPages').then((m) => ({ default: m.StaticOrPolicyPage })),
);

function RouteLoadingFallback() {
  const { messages } = useLocale();
  return (
    <div className="py-24 flex justify-center">
      <LoadingIndicator label={messages.common.loading} />
    </div>
  );
}

function AppRoutes() {
  const { messages } = useLocale();
  const { cleanPath, setPageMeta } = useRouter();
  const [bootstrap, setBootstrap] = useState<StorefrontBootstrapData | null>(null);
  const [bootLoading, setBootLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiClient
      .get<StorefrontBootstrapData>('/api/v1/storefront/bootstrap')
      .then((data) => {
        if (active) setBootstrap(data);
      })
      .catch(() => {
        // Storefront continues gracefully with empty fallback if offline
      })
      .finally(() => {
        if (active) setBootLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (cleanPath === '/' || cleanPath === '') {
      setPageMeta(
        'SHE-VALLEY — Be Comfortable. Be Confident.',
        messages.storefront.heroSubcopy,
      );
    } else if (cleanPath.startsWith('/shop')) {
      setPageMeta(messages.shop.title, messages.shop.subtitle);
    } else if (cleanPath.startsWith('/cart')) {
      setPageMeta(messages.cart.title);
    } else if (cleanPath.startsWith('/checkout')) {
      setPageMeta(messages.checkout.title);
    } else if (cleanPath.startsWith('/track-order')) {
      setPageMeta(messages.tracking.title);
    } else if (cleanPath.startsWith('/admin')) {
      setPageMeta(messages.admin.title);
    }
  }, [cleanPath, messages, setPageMeta]);

  if (cleanPath === '/admin' || cleanPath.startsWith('/admin/')) {
    return (
      <Suspense fallback={<RouteLoadingFallback />}>
        <AdminPortal />
      </Suspense>
    );
  }

  const announcementBanner = bootstrap?.banners.find((b) => b.placement === 'ANNOUNCEMENT');
  const deliveryConfig = bootstrap?.deliveryConfig ?? DEFAULT_DELIVERY_CHARGES;
  const contactSocial = bootstrap?.contactSocial ?? null;
  const marketingConfig = bootstrap?.marketingConfig ?? null;

  const renderContent = () => {
    if (cleanPath === '/' || cleanPath === '') {
      if (bootLoading) {
        return (
          <div className="py-24 flex justify-center">
            <LoadingIndicator label={messages.common.loading} />
          </div>
        );
      }
      return <HomePage bootstrap={bootstrap} />;
    }

    if (cleanPath === '/shop') {
      return <ShopPage categories={bootstrap?.categories ?? []} />;
    }

    if (cleanPath.startsWith('/products/')) {
      const slug = decodeURIComponent(cleanPath.slice('/products/'.length));
      return <ProductDetailPage slug={slug} contactSocial={contactSocial} />;
    }

    if (cleanPath === '/cart') {
      return <CartPage freeDeliveryThresholdBdt={deliveryConfig.freeDeliveryThresholdBdt} />;
    }

    if (cleanPath === '/checkout') {
      return <CheckoutPage deliveryConfig={deliveryConfig} contactSocial={contactSocial} />;
    }

    if (cleanPath === '/track-order') {
      return <TrackOrderPage contactSocial={contactSocial} />;
    }

    if (cleanPath === '/login') {
      return <LoginPage />;
    }

    if (cleanPath === '/register') {
      return <RegisterPage />;
    }

    if (cleanPath === '/reset-password') {
      return <ResetPasswordPage />;
    }

    if (cleanPath === '/account') {
      return <AccountDashboardPage />;
    }

    if (cleanPath === '/faq') {
      return <FaqPage faqs={bootstrap?.faqs ?? []} />;
    }

    if (cleanPath === '/journal') {
      return <JournalListPage posts={bootstrap?.blogPosts ?? []} />;
    }

    if (cleanPath.startsWith('/journal/')) {
      const slug = decodeURIComponent(cleanPath.slice('/journal/'.length));
      return <JournalDetailPage slug={slug} />;
    }

    if (cleanPath === '/about') {
      return <StaticOrPolicyPage slug="about" contactSocial={contactSocial} />;
    }

    if (cleanPath === '/contact') {
      return <StaticOrPolicyPage slug="contact" contactSocial={contactSocial} />;
    }

    if (cleanPath.startsWith('/policies/')) {
      const slug = decodeURIComponent(cleanPath.slice('/policies/'.length));
      return <StaticOrPolicyPage slug={slug} contactSocial={contactSocial} />;
    }

    return <HomePage bootstrap={bootstrap} />;
  };

  return (
    <>
      <SeoHeadManager marketingConfig={marketingConfig} />
      <StorefrontLayout
        announcementBanner={announcementBanner}
        freeDeliveryThresholdBdt={deliveryConfig.freeDeliveryThresholdBdt}
        contactSocial={contactSocial}
        marketingConfig={marketingConfig}
      >
        <Suspense fallback={<RouteLoadingFallback />}>{renderContent()}</Suspense>
      </StorefrontLayout>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LocaleProvider>
        <RouterProvider>
          <ToastProvider>
            <AuthProvider>
              <CartProvider>
                <AppRoutes />
              </CartProvider>
            </AuthProvider>
          </ToastProvider>
        </RouterProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
}
