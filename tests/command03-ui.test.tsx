import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/src/App';
import { DEFAULT_DELIVERY_CHARGES } from '@/src/config/bangladesh';

const MOCK_BOOTSTRAP = {
  success: true,
  data: {
    banners: [],
    categories: [],
    featuredProducts: [],
    newArrivals: [],
    reviews: [],
    blogPosts: [],
    faqs: [],
    staticPages: [],
    deliveryConfig: DEFAULT_DELIVERY_CHARGES,
    storeProfile: null,
    contactSocial: {
      whatsappNumber: '01828-298143',
      messengerUrl: 'https://m.me/SheValley',
      facebookPageUrl: 'https://facebook.com/SheValley',
      instagramHandle: '@she-valley',
      instagramUrl: 'https://instagram.com/she-valley',
      supportEmail: 'support@she-valley.com',
      floatingWhatsappEnabled: true,
    },
    marketingConfig: {
      requireCookieConsentForMarketing: true,
    },
  },
};

describe('SHE-VALLEY Social, Consent & Support UI (Command 03)', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/en');
    window.localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
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
              JSON.stringify({ success: true, data: { cartId: 'c1', items: [], subtotalBdt: 0, itemCount: 0 } }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
          );
        }
        if (url.includes('/api/v1/storefront/content/contact')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                data: {
                  page: {
                    id: 'pg-contact',
                    slug: 'contact',
                    pageType: 'STATIC',
                    titleEn: 'Contact SHE-VALLEY',
                    titleBn: 'যোগাযোগ',
                    bodyEn: 'Reach our support team on WhatsApp or Messenger.',
                    bodyBn: 'হোয়াটসঅ্যাপ বা মেসেঞ্জারে যোগাযোগ করুন।',
                    isPublished: true,
                    ownerApproved: true,
                  },
                },
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
          );
        }
        if (url.includes('/api/v1/support/contact') && init?.method === 'POST') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                data: { ticket: { ticketNumber: 'SV-TKT-102030' } },
              }),
              { status: 201, headers: { 'content-type': 'application/json' } },
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

  it('renders WhatsApp (01828-298143), Messenger (m.me/SheValley), Instagram (@she-valley), and cookie consent banner', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Allow Analytics')).toBeInTheDocument();
    });

    const waLinks = screen.getAllByRole('link', { name: /WhatsApp/i });
    expect(waLinks.some((a) => (a as HTMLAnchorElement).href.includes('8801828298143'))).toBe(true);

    const messengerLink = screen.getByRole('link', { name: /Messenger/i }) as HTMLAnchorElement;
    expect(messengerLink.href).toContain('https://m.me/SheValley');

    const igLink = screen.getByRole('link', { name: /@she-valley/i }) as HTMLAnchorElement;
    expect(igLink.href).toContain('https://instagram.com/she-valley');

    fireEvent.click(screen.getByRole('button', { name: 'Allow Analytics' }));
    await waitFor(() => {
      expect(window.localStorage.getItem('sv_analytics_consent')).toBe('granted');
      expect(screen.queryByText('Allow Analytics')).not.toBeInTheDocument();
    });
  });

  it('submits the discreet Contact Support Form on /en/contact cleanly', async () => {
    window.history.replaceState({}, '', '/en/contact');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Send a Discreet Support Inquiry')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Recipient Full Name/i), { target: { value: 'Nusrat Jahan' } });
    fireEvent.change(screen.getByLabelText(/11-Digit Bangladesh Mobile/i), { target: { value: '01828298143' } });
    fireEvent.change(screen.getByLabelText(/Subject/i), { target: { value: 'Band size advice' } });
    fireEvent.change(screen.getByLabelText(/How can we help\?/i), {
      target: { value: 'Please advise on 34B vs 36B comfort.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByText(/SV-TKT-102030/i)).toBeInTheDocument();
    });
  });
});
