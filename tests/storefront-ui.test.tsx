import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/src/App';
import {
  DEFAULT_DELIVERY_CHARGES,
  calculateDeliveryFeeBdt,
  inferDeliveryZone,
} from '@/src/config/bangladesh';

const MOCK_BOOTSTRAP = {
  success: true,
  data: {
    banners: [
      {
        id: 'b1',
        placement: 'ANNOUNCEMENT',
        titleEn: 'Discreet plain packaging · Cash on Delivery across Bangladesh',
        titleBn: 'গোপনীয় প্লেইন প্যাকেজিং · সারা বাংলাদেশে ক্যাশ অন ডেলিভারি',
        isActive: true,
      },
      {
        id: 'b2',
        placement: 'HERO',
        titleEn: 'Quiet comfort crafted for every day.',
        titleBn: 'প্রতিদিনের জন্য প্রশান্ত ও আরামদায়ক ইনারওয়্যার।',
        subtitleEn: 'Breathable combed cotton essentials.',
        subtitleBn: 'শ্বাস-প্রশ্বাসযোগ্য কটন এসেনশিয়ালস।',
        imageUrl: '/src/assets/images/hero_innerwear_atelier_1794849871246.jpg',
        isActive: true,
      },
    ],
    categories: [
      {
        id: 'c1',
        parentId: 'c0',
        slug: 'everyday-bras',
        imageUrl: '/src/assets/images/product_wireless_cotton_bra_1794849869916.jpg',
        isActive: true,
        isReturnableByHygiene: true,
        translations: {
          en: { name: 'Everyday & Wireless Bras', description: 'Soft support' },
          bn: { name: 'প্রতিদিনের ওয়্যারলেস ব্রা', description: 'নরম সাপোর্ট' },
        },
      },
    ],
    featuredProducts: [
      {
        id: 'p1',
        slug: 'cloud-cotton-wireless-everyday-bra',
        categoryId: 'c1',
        categoryName: { en: 'Everyday & Wireless Bras', bn: 'প্রতিদিনের ওয়্যারলেস ব্রা' },
        skuPrefix: 'SV-WB',
        brandName: 'SHE-VALLEY',
        status: 'ACTIVE',
        isFeatured: true,
        isNewArrival: true,
        basePriceBdt: 950,
        fabricSpec: { en: '95% Cotton', bn: '৯৫% কটন' },
        careInstructions: { en: 'Hand wash', bn: 'হাতে ধোয়া' },
        sizeGuide: [],
        translations: {
          en: { name: 'Cloud Cotton Wireless Bra', shortDescription: 'Soft fit', description: 'Breathable' },
          bn: { name: 'ক্লাউড কটন ওয়্যারলেস ব্রা', shortDescription: 'নরম ফিট', description: 'আরামদায়ক' },
        },
        images: [{ id: 'img1', url: '/src/assets/images/product_wireless_cotton_bra_1794849869916.jpg', isPrimary: true }],
        variants: [
          {
            id: 'v1',
            productId: 'p1',
            sku: 'SV-WB-34B',
            size: '34B',
            colorName: 'Muted Rose',
            colorHex: '#B87A88',
            packSize: 1,
            priceBdt: 950,
            compareAtPriceBdt: null,
            availableQty: 10,
            lowStockThreshold: 5,
          },
        ],
        totalAvailableStock: 10,
      },
    ],
    newArrivals: [],
    reviews: [],
    blogPosts: [],
    faqs: [],
    staticPages: [],
    deliveryConfig: DEFAULT_DELIVERY_CHARGES,
    storeProfile: null,
  },
};

describe('SHE-VALLEY Storefront & Bangladesh Delivery UI (Command 02)', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/storefront/bootstrap')) {
          return Promise.resolve(
            new Response(JSON.stringify(MOCK_BOOTSTRAP), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        if (url.includes('/api/v1/auth/me')) {
          return Promise.resolve(
            new Response(JSON.stringify({ success: true, data: { user: null } }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        if (url.includes('/api/v1/cart')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                data: { cartId: 'cart-1', items: [], subtotalBdt: 0, itemCount: 0 },
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data: {} }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('computes Bangladesh delivery zones and free shipping threshold accurately', () => {
    expect(inferDeliveryZone('Dhaka', 'Dhanmondi')).toBe('DHAKA_METRO');
    expect(inferDeliveryZone('Dhaka', 'Savar (Sub-Dhaka)')).toBe('SUB_DHAKA');
    expect(inferDeliveryZone('Gazipur', 'Tongi')).toBe('SUB_DHAKA');
    expect(inferDeliveryZone('Sylhet', 'Zindabazar')).toBe('OUTSIDE_DHAKA');

    expect(calculateDeliveryFeeBdt('DHAKA_METRO', 950)).toBe(70);
    expect(calculateDeliveryFeeBdt('SUB_DHAKA', 1200)).toBe(100);
    expect(calculateDeliveryFeeBdt('OUTSIDE_DHAKA', 1200)).toBe(130);
    expect(calculateDeliveryFeeBdt('OUTSIDE_DHAKA', 2500)).toBe(0);
  });

  it('renders storefront homepage, switches cleanly between English and Bengali URLs, and updates product grid', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Quiet comfort crafted for every day.')).toBeInTheDocument();
    });
    expect(screen.getByText('Cloud Cotton Wireless Bra')).toBeInTheDocument();
    expect(screen.getByText('৳950')).toBeInTheDocument();

    // Switch to Bengali
    fireEvent.click(screen.getByRole('button', { name: 'Switch language to Bengali' }));
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('bn');
      expect(window.location.pathname).toBe('/bn');
      expect(screen.getByText('ক্লাউড কটন ওয়্যারলেস ব্রা')).toBeInTheDocument();
    });

    // Open mobile navigation drawer cleanly
    fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation menu' }));
    expect(screen.getAllByText('অর্ডার ট্র্যাক').length).toBeGreaterThanOrEqual(1);
  });

  it('navigates to Track Order and Admin login screen without errors', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Quiet comfort crafted for every day.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Track Your Order' }));
    await waitFor(() => {
      expect(screen.getByText('Track Your Order')).toBeInTheDocument();
    });

    window.history.pushState({}, '', '/en/admin');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() => {
      expect(screen.getByText('SHE-VALLEY Operations Console')).toBeInTheDocument();
    });
  });
});
