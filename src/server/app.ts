import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ensureSystemBootstrap } from '../db/seed.ts';
import { NotFoundError, formatApiErrorResponse, generateRequestId } from '../lib/errors.ts';
import { appLogger } from '../lib/logger.ts';
import { attachOptionalAuth, type AuthRequest } from './rbac.ts';
import { accountRouter } from './routes/accountRoutes.ts';
import { adminOpsRouter } from './routes/adminOpsRoutes.ts';
import { adminRouter } from './routes/adminRoutes.ts';
import { authRouter } from './routes/authRoutes.ts';
import { cartOrderRouter } from './routes/cartOrderRoutes.ts';
import { operationsRouter } from './routes/operationsRoutes.ts';
import { seoRouter } from './routes/seoRoutes.ts';
import { storefrontRouter } from './routes/storefrontRoutes.ts';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as AuthRequest).rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(cookieParser());

  // Security headers + Request ID correlation
  app.use((req: AuthRequest, res: Response, next: NextFunction) => {
    const reqId =
      (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].trim()) ||
      generateRequestId();
    req.requestId = reqId;
    res.setHeader('X-Request-Id', reqId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (
      req.path.startsWith('/api/v1/auth') ||
      req.path.startsWith('/api/v1/account') ||
      req.path.startsWith('/api/v1/admin') ||
      req.path.startsWith('/api/v1/orders') ||
      req.path.startsWith('/api/v1/payments')
    ) {
      res.setHeader('Cache-Control', 'no-store, private');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  });

  // Health probe (no DB probe required for liveness)
  app.get('/api/v1/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        service: 'she-valley',
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Dynamic SEO endpoints (/robots.txt, /sitemap.xml)
  app.use('/', seoRouter);

  // Ensure idempotent system roles, permissions, warehouse, and settings exist before API handling
  app.use('/api', async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      await ensureSystemBootstrap();
      next();
    } catch (err) {
      next(err);
    }
  });

  app.use('/api', attachOptionalAuth);

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/storefront', storefrontRouter);
  app.use('/api/v1', cartOrderRouter);
  app.use('/api/v1', operationsRouter);
  app.use('/api/v1/account', accountRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/admin', adminOpsRouter);

  // Unknown API route handler
  app.use('/api', (req: AuthRequest, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`Endpoint ${req.method} ${req.path}`, req.requestId));
  });

  // Central Express error handler (never leaks stack traces or secrets)
  app.use((err: unknown, req: AuthRequest, res: Response, _next: NextFunction) => {
    const formatted = formatApiErrorResponse(err, req.requestId);
    appLogger.error('API request failed', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: formatted.statusCode,
      code: formatted.body.error.code,
      error: err instanceof Error ? err.message : 'unknown',
    });
    res.status(formatted.statusCode).json(formatted.body);
  });

  return app;
}
