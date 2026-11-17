import {describe, expect, it} from 'vitest';
import {getEnvironmentProfile, parseClientEnv, parseServerEnv} from '@/src/config/env';

describe('Environment Configuration (Task 01.10)', () => {
  it('parses valid client env with defaults', () => {
    const parsed = parseClientEnv({});
    expect(parsed.VITE_APP_NAME).toBe('SHE-VALLEY');
    expect(parsed.VITE_DEFAULT_LOCALE).toBe('en');
    expect(parsed.VITE_CURRENCY).toBe('BDT');
  });

  it('rejects unsupported currency in client env', () => {
    expect(() => parseClientEnv({VITE_CURRENCY: 'USD'})).toThrow(/Invalid client environment/);
  });

  it('parses valid server env and rejects weak AUTH_SECRET', () => {
    const ok = parseServerEnv({
      NODE_ENV: 'production',
      AUTH_SECRET: 'super-secure-secret-key-at-least-16',
    });
    expect(ok.NODE_ENV).toBe('production');

    expect(() =>
      parseServerEnv({
        NODE_ENV: 'production',
        AUTH_SECRET: 'short',
      }),
    ).toThrow(/Invalid server environment/);
  });

  it('returns distinct profiles for development, test, and production', () => {
    const dev = getEnvironmentProfile('development');
    const test = getEnvironmentProfile('test');
    const prod = getEnvironmentProfile('production');

    expect(dev.enableDiagnostics).toBe(true);
    expect(dev.logLevel).toBe('debug');
    expect(test.isTest).toBe(true);
    expect(prod.strictSecretValidation).toBe(true);
    expect(prod.enableDiagnostics).toBe(false);
  });
});
