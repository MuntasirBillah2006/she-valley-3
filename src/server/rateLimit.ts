import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode } from '../lib/errors.ts';

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test' && req.headers['x-test-rate-limit'] !== 'enforce') {
      return next();
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${options.keyPrefix}:${clientIp}`;
    const now = Date.now();
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    if (current.count >= options.maxRequests) {
      return next(
        new AppError({
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many requests. Please wait a moment and try again.',
          statusCode: 429,
          isOperational: true,
        }),
      );
    }

    current.count += 1;
    return next();
  };
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
