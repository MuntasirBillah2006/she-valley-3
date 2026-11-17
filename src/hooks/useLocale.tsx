import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';
import {DEFAULT_LOCALE, isSupportedLocale} from '@/src/config/locales';
import {formatCurrencyBDT, formatDateBD, type CurrencyFormatOptions, type DateFormatStyle} from '@/src/lib/formatters';
import bnMessages from '@/src/messages/bn.json';
import enMessages from '@/src/messages/en.json';
import type {Locale} from '@/src/types';

export type MessagesDictionary = typeof enMessages;

const DICTIONARIES: Record<Locale, MessagesDictionary> = {
  en: enMessages,
  bn: bnMessages,
};

const STORAGE_KEY = 'she-valley-locale';

interface LocaleContextValue {
  locale: Locale;
  messages: MessagesDictionary;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  formatCurrency: (amount: number, options?: CurrencyFormatOptions) => string;
  formatDate: (input: Date | string | number, style?: DateFormatStyle) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readInitialLocale(initialLocale?: Locale): Locale {
  if (initialLocale && isSupportedLocale(initialLocale)) {
    return initialLocale;
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isSupportedLocale(stored)) {
        return stored;
      }
    } catch {
      // Ignore storage access errors in restricted contexts
    }
  }
  return DEFAULT_LOCALE;
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => readInitialLocale(initialLocale));

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, locale);
      } catch {
        // Ignore storage write errors
      }
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => (prev === 'en' ? 'bn' : 'en'));
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      messages: DICTIONARIES[locale],
      setLocale,
      toggleLocale,
      formatCurrency: (amount, options) => formatCurrencyBDT(amount, locale, options),
      formatDate: (input, style) => formatDateBD(input, locale, style),
    }),
    [locale, setLocale, toggleLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used inside a LocaleProvider.');
  }
  return ctx;
}
