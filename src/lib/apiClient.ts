export class ApiClientError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly requestId?: string;

  constructor(message: string, statusCode: number, code = 'API_ERROR', requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = code;
    this.requestId = requestId;
  }
}

const CART_TOKEN_STORAGE_KEY = 'sv_cart_token';

export function getStoredCartToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem(CART_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredCartToken(token: string): void {
  if (typeof window === 'undefined' || !token) {
    return;
  }
  try {
    window.localStorage.setItem(CART_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage quota errors
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const cartToken = getStoredCartToken();
  const headers: Record<string, string> = {
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(cartToken ? { 'x-cart-token': cartToken } : {}),
    ...extraHeaders,
  };

  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!res.ok) {
      throw new ApiClientError('Request failed. Please try again.', res.status);
    }
    return (await res.text()) as unknown as T;
  }

  const payload = await res.json();
  if (!res.ok || payload?.success === false) {
    const errObj = payload?.error;
    throw new ApiClientError(
      errObj?.message || 'Unable to complete request.',
      res.status,
      errObj?.code || 'API_ERROR',
      errObj?.requestId,
    );
  }

  return payload.data as T;
}

export const apiClient = {
  get: <T>(path: string) => requestJson<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    requestJson<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }, headers),
  patch: <T>(path: string, body?: unknown) =>
    requestJson<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => requestJson<T>(path, { method: 'DELETE' }),
};

export interface StorefrontVariant {
  id: string;
  productId: string;
  sku: string;
  size: string;
  colorName: string;
  colorHex: string;
  packSize: number;
  priceBdt: number;
  compareAtPriceBdt: number | null;
  availableQty: number;
  lowStockThreshold: number;
}

export interface StorefrontProduct {
  id: string;
  slug: string;
  categoryId: string;
  categoryName: { en: string; bn: string };
  skuPrefix: string;
  brandName: string;
  status: string;
  isFeatured: boolean;
  isNewArrival: boolean;
  basePriceBdt: number;
  fabricSpec: { en: string; bn: string };
  careInstructions: { en: string; bn: string };
  sizeGuide: { size: string; underbustCm: string; bustCm: string }[];
  translations: {
    en: { name: string; shortDescription?: string | null; description: string; fitNotes?: string | null };
    bn: { name: string; shortDescription?: string | null; description: string; fitNotes?: string | null };
  };
  images: { id: string; url: string; altEn?: string | null; altBn?: string | null; isPrimary: boolean }[];
  variants: StorefrontVariant[];
  totalAvailableStock: number;
}

export interface StorefrontCategory {
  id: string;
  parentId: string | null;
  slug: string;
  imageUrl: string | null;
  isActive: boolean;
  isReturnableByHygiene: boolean;
  translations: {
    en: { name: string; description?: string | null };
    bn: { name: string; description?: string | null };
  };
}

export interface StorefrontBanner {
  id: string;
  placement: string;
  titleEn: string;
  titleBn: string;
  subtitleEn?: string | null;
  subtitleBn?: string | null;
  ctaLabelEn?: string | null;
  ctaLabelBn?: string | null;
  ctaHref?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
}

export interface StorefrontReview {
  id: string;
  productId: string;
  authorName: string;
  rating: number;
  title?: string | null;
  comment: string;
  fitFeedback: string;
  createdAt: string;
}

export interface StorefrontBlogPost {
  id: string;
  slug: string;
  titleEn: string;
  titleBn: string;
  excerptEn: string;
  excerptBn: string;
  contentEn: string;
  contentBn: string;
  coverImageUrl?: string | null;
  publishedAt?: string | null;
}

export interface StorefrontFaq {
  id: string;
  category: string;
  questionEn: string;
  questionBn: string;
  answerEn: string;
  answerBn: string;
}

export interface StorefrontContentPage {
  id: string;
  slug: string;
  pageType: string;
  titleEn: string;
  titleBn: string;
  bodyEn: string;
  bodyBn: string;
  isPublished: boolean;
  ownerApproved: boolean;
}

export interface StorefrontBootstrapData {
  banners: StorefrontBanner[];
  categories: StorefrontCategory[];
  featuredProducts: StorefrontProduct[];
  newArrivals: StorefrontProduct[];
  reviews: StorefrontReview[];
  blogPosts: StorefrontBlogPost[];
  faqs: StorefrontFaq[];
  staticPages: StorefrontContentPage[];
  deliveryConfig: {
    DHAKA_METRO: number;
    SUB_DHAKA: number;
    OUTSIDE_DHAKA: number;
    freeDeliveryThresholdBdt: number;
  };
  storeProfile: {
    brandName: string;
    slogan: string;
    supportEmail: string;
    supportPhone: string;
    whatsappNumber: string;
    messengerUrl?: string;
    brandHandle?: string;
    officeAddress: string;
    discreetPackagingDefault: boolean;
  } | null;
  contactSocial: {
    whatsappNumber: string;
    messengerUrl: string;
    facebookPageUrl: string;
    instagramHandle: string;
    instagramUrl: string;
    supportEmail: string;
    floatingWhatsappEnabled: boolean;
    whatsappCloudApiStatus?: string;
    messengerApiStatus?: string;
  } | null;
  marketingConfig: {
    ga4MeasurementId?: string;
    gtmContainerId?: string;
    metaPixelId?: string;
    searchConsoleVerification?: string;
    capiEnabled?: boolean;
    requireCookieConsentForMarketing?: boolean;
  } | null;
}

export interface PaymentMethodSummary {
  provider: 'COD' | 'BKASH' | 'NAGAD' | 'SSLCOMMERZ';
  label: string;
  labelBn: string;
  enabled: boolean;
  connectionStatus: 'ACTIVE' | 'SANDBOX' | 'PENDING_CREDENTIALS';
  credentialsConfigured: boolean;
  liveApproved: boolean;
  feeRatePercent: number;
  note: string;
}
