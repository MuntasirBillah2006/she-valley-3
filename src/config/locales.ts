import type {Locale} from '@/src/types';

export interface LocaleConfig {
  code: Locale;
  nativeLabel: string;
  englishLabel: string;
  intlLocale: string;
  direction: 'ltr';
}

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'bn'] as const;
export const DEFAULT_LOCALE: Locale = 'en';
export const DHAKA_TIMEZONE = 'Asia/Dhaka';

export const LOCALE_METADATA: Record<Locale, LocaleConfig> = {
  en: {
    code: 'en',
    nativeLabel: 'English',
    englishLabel: 'English',
    intlLocale: 'en-BD',
    direction: 'ltr',
  },
  bn: {
    code: 'bn',
    nativeLabel: 'বাংলা',
    englishLabel: 'Bengali',
    intlLocale: 'bn-BD',
    direction: 'ltr',
  },
};

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return value === 'en' || value === 'bn';
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) {
    return DEFAULT_LOCALE;
  }
  const base = value.toLowerCase().split('-')[0];
  return isSupportedLocale(base) ? base : DEFAULT_LOCALE;
}

/**
 * Localized route helper supporting prefix routing (/en/..., /bn/...).
 */
export function getLocalizedPath(path: string, locale: Locale): string {
  const cleaned = path.startsWith('/') ? path : `/${path}`;
  const stripped = cleaned.replace(/^\/(en|bn)(?=\/|$)/, '') || '/';
  if (stripped === '/') {
    return `/${locale}`;
  }
  return `/${locale}${stripped}`;
}

export function extractLocaleFromPath(pathname: string): {
  locale: Locale | null;
  pathnameWithoutLocale: string;
} {
  const match = pathname.match(/^\/(en|bn)(\/.*)?$/);
  if (!match) {
    return {
      locale: null,
      pathnameWithoutLocale: pathname || '/',
    };
  }

  return {
    locale: match[1] as Locale,
    pathnameWithoutLocale: match[2] || '/',
  };
}
