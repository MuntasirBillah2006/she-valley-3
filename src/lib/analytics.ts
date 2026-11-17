import { apiClient } from './apiClient';

export type MarketingEventName =
  | 'ViewContent'
  | 'Search'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'Purchase'
  | 'Contact'
  | 'Lead';

const CONSENT_STORAGE_KEY = 'sv_analytics_consent';
const PURCHASE_TRACKED_KEY = 'sv_tracked_purchases';

export function getAnalyticsConsent(): 'granted' | 'denied' | 'unset' {
  if (typeof window === 'undefined') return 'unset';
  try {
    const val = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (val === 'granted' || val === 'denied') return val;
    return 'unset';
  } catch {
    return 'unset';
  }
}

export function setAnalyticsConsent(decision: 'granted' | 'denied') {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, decision);
  } catch {
    // Ignore storage error
  }
  const w = window as Window & { dataLayer?: Record<string, unknown>[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({
    event: 'consent_update',
    analytics_storage: decision,
    ad_storage: decision,
  });
}

function hasTrackedPurchase(orderNumber: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(PURCHASE_TRACKED_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    return list.includes(orderNumber);
  } catch {
    return false;
  }
}

function markPurchaseTracked(orderNumber: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(PURCHASE_TRACKED_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(orderNumber)) {
      window.localStorage.setItem(PURCHASE_TRACKED_KEY, JSON.stringify([...list.slice(-30), orderNumber]));
    }
  } catch {
    // Ignore
  }
}

export function trackMarketingEvent(params: {
  eventName: MarketingEventName;
  eventId?: string;
  valueBdt?: number;
  orderId?: string;
  orderNumber?: string;
  metadata?: Record<string, unknown>;
}) {
  const consent = getAnalyticsConsent();
  if (consent === 'denied') {
    return;
  }

  // Prevent duplicate Purchase conversion tracking across refreshes
  if (params.eventName === 'Purchase' && params.orderNumber) {
    if (hasTrackedPurchase(params.orderNumber)) {
      return;
    }
    markPurchaseTracked(params.orderNumber);
  }

  const eventId =
    params.eventId ||
    (params.eventName === 'Purchase' && params.orderNumber
      ? `purchase_${params.orderNumber}`
      : `${params.eventName}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

  // Push to GTM / GA4 dataLayer when granted
  if (typeof window !== 'undefined' && consent === 'granted') {
    const w = window as Window & {
      dataLayer?: Record<string, unknown>[];
      fbq?: (...args: unknown[]) => void;
    };
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({
      event: params.eventName,
      event_id: eventId,
      currency: 'BDT',
      value: params.valueBdt ?? 0,
      ...params.metadata,
    });
    if (typeof w.fbq === 'function') {
      w.fbq('track', params.eventName, { currency: 'BDT', value: params.valueBdt ?? 0 }, { eventID: eventId });
    }
  }

  // Record deduplicated event server-side (without transmitting sensitive PII)
  void apiClient
    .post('/api/v1/marketing/events', {
      eventId,
      eventName: params.eventName,
      valueBdt: params.valueBdt,
      orderId: params.orderId,
      consentGranted: consent === 'granted',
      metadata: params.metadata ?? {},
    })
    .catch(() => undefined);
}

export function buildWhatsAppHref(phoneOrNumber: string, text?: string): string {
  const digits = phoneOrNumber.replace(/\D/g, '');
  const intl = digits.startsWith('880')
    ? digits
    : digits.startsWith('01')
      ? `88${digits}`
      : digits.startsWith('1')
        ? `880${digits}`
        : digits;
  const base = `https://wa.me/${intl}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
