import {DHAKA_TIMEZONE, LOCALE_METADATA} from '@/src/config/locales';
import type {Locale} from '@/src/types';

export interface CurrencyFormatOptions {
  showDecimals?: boolean;
  latinNumerals?: boolean;
}

/**
 * Formats an amount in Bangladeshi Taka (BDT / ৳) for the active locale.
 */
export function formatCurrencyBDT(
  amount: number,
  locale: Locale = 'en',
  options: CurrencyFormatOptions = {},
): string {
  if (!Number.isFinite(amount)) {
    return locale === 'bn' ? '৳০' : '৳0';
  }

  const {showDecimals = false, latinNumerals = false} = options;
  const intlLocale = latinNumerals ? 'en-BD' : LOCALE_METADATA[locale].intlLocale;

  const formattedNumber = new Intl.NumberFormat(intlLocale, {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(amount);

  return `৳${formattedNumber}`;
}

export type DateFormatStyle = 'short' | 'medium' | 'long';

/**
 * Formats a Date or ISO string in Asia/Dhaka timezone for English or Bengali locales.
 */
export function formatDateBD(
  input: Date | string | number,
  locale: Locale = 'en',
  style: DateFormatStyle = 'medium',
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const intlLocale = LOCALE_METADATA[locale].intlLocale;

  const formatOptions: Record<DateFormatStyle, Intl.DateTimeFormatOptions> = {
    short: {day: '2-digit', month: '2-digit', year: 'numeric', timeZone: DHAKA_TIMEZONE},
    medium: {day: 'numeric', month: 'short', year: 'numeric', timeZone: DHAKA_TIMEZONE},
    long: {day: 'numeric', month: 'long', year: 'numeric', timeZone: DHAKA_TIMEZONE},
  };

  return new Intl.DateTimeFormat(intlLocale, formatOptions[style]).format(date);
}

export function formatNumberLocale(value: number, locale: Locale = 'en'): string {
  if (!Number.isFinite(value)) {
    return locale === 'bn' ? '০' : '0';
  }
  return new Intl.NumberFormat(LOCALE_METADATA[locale].intlLocale).format(value);
}
