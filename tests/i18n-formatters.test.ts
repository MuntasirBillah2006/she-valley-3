import {describe, expect, it} from 'vitest';
import {extractLocaleFromPath, getLocalizedPath, normalizeLocale} from '@/src/config/locales';
import {formatCurrencyBDT, formatDateBD} from '@/src/lib/formatters';
import bnMessages from '@/src/messages/bn.json';
import enMessages from '@/src/messages/en.json';

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, val]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return collectKeys(val as Record<string, unknown>, path);
    }
    return [path];
  });
}

describe('Internationalization & Formatting (Task 01.15)', () => {
  it('maintains 100% translation key parity between English and Bengali dictionaries', () => {
    const enKeys = collectKeys(enMessages).sort();
    const bnKeys = collectKeys(bnMessages).sort();
    expect(bnKeys).toEqual(enKeys);
  });

  it('formats BDT currency cleanly for en and bn', () => {
    const enFormatted = formatCurrencyBDT(1450, 'en');
    const bnFormatted = formatCurrencyBDT(1450, 'bn');

    expect(enFormatted).toBe('৳1,450');
    expect(bnFormatted.startsWith('৳')).toBe(true);
    expect(bnFormatted).toContain('১');
  });

  it('formats dates in Asia/Dhaka timezone for en and bn', () => {
    const enDate = formatDateBD('2026-11-16T09:00:00Z', 'en', 'medium');
    const bnDate = formatDateBD('2026-11-16T09:00:00Z', 'bn', 'medium');

    expect(enDate).toContain('2026');
    expect(bnDate.length).toBeGreaterThan(0);
  });

  it('normalizes locales and handles localized routing helpers', () => {
    expect(normalizeLocale('bn-BD')).toBe('bn');
    expect(normalizeLocale('fr')).toBe('en');

    expect(getLocalizedPath('/shop', 'bn')).toBe('/bn/shop');
    expect(getLocalizedPath('/en/shop', 'bn')).toBe('/bn/shop');
    expect(getLocalizedPath('/', 'en')).toBe('/en');

    expect(extractLocaleFromPath('/bn/categories/innerwear')).toEqual({
      locale: 'bn',
      pathnameWithoutLocale: '/categories/innerwear',
    });
    expect(extractLocaleFromPath('/about')).toEqual({
      locale: null,
      pathnameWithoutLocale: '/about',
    });
  });
});
