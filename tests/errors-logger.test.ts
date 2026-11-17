import {describe, expect, it} from 'vitest';
import {
  BusinessRuleError,
  ErrorCode,
  NotFoundError,
  ValidationError,
  formatApiErrorResponse,
} from '@/src/lib/errors';
import {createLogger, maskPhoneNumber, redactSensitiveData, type LogEntry} from '@/src/lib/logger';

describe('Error Handling & Structured Logging (Task 01.11)', () => {
  it('formats operational ValidationError with field details and safe envelope', () => {
    const err = new ValidationError('Invalid fields', [{field: 'phone', message: 'Required'}], 'req_123');
    const formatted = formatApiErrorResponse(err);

    expect(formatted.statusCode).toBe(400);
    expect(formatted.body.success).toBe(false);
    expect(formatted.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(formatted.body.error.requestId).toBe('req_123');
    expect(formatted.body.error.details).toEqual([{field: 'phone', message: 'Required'}]);
  });

  it('masks unexpected non-operational errors without leaking stack traces or secrets', () => {
    const raw = new Error('SELECT * FROM users failed with secret=abc123');
    const formatted = formatApiErrorResponse(raw, 'req_safe');

    expect(formatted.statusCode).toBe(500);
    expect(formatted.body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(formatted.body.error.message).not.toContain('secret=abc123');
    expect(JSON.stringify(formatted.body)).not.toContain('at ');
  });

  it('supports NotFoundError and BusinessRuleError status codes', () => {
    expect(formatApiErrorResponse(new NotFoundError('Product')).statusCode).toBe(404);
    expect(formatApiErrorResponse(new BusinessRuleError('Insufficient stock')).statusCode).toBe(422);
  });

  it('redacts sensitive keys recursively in structured logger', () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({module: 'auth'}, 'info', (entry) => entries.push(entry));

    logger.info('User login attempt', {
      phone: maskPhoneNumber('01712345678'),
      password: 'my-secret-password',
      nested: {apiKey: 'live_key_123', safeFlag: true},
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].module).toBe('auth');
    expect(entries[0].data?.password).toBe('[REDACTED]');
    expect((entries[0].data?.nested as Record<string, unknown>).apiKey).toBe('[REDACTED]');
    expect((entries[0].data?.nested as Record<string, unknown>).safeFlag).toBe(true);
    expect(entries[0].data?.phone).toBe('017******78');
  });

  it('redacts arrays and objects safely', () => {
    const sanitized = redactSensitiveData([{token: 'abc', count: 2}]) as Array<Record<string, unknown>>;
    expect(sanitized[0].token).toBe('[REDACTED]');
    expect(sanitized[0].count).toBe(2);
  });
});
