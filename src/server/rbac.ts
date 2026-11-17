import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.ts';
import {
  SESSION_COOKIE_NAME,
  resolvePrincipalFromToken,
  type AuthenticatedPrincipal,
  type PermissionCode,
  type RoleCode,
} from './auth.ts';

export interface AuthRequest extends Request {
  principal?: AuthenticatedPrincipal;
  requestId?: string;
  rawBody?: string;
}

const STAFF_ROLES: ReadonlySet<RoleCode> = new Set([
  'SUPER_ADMIN',
  'STORE_MANAGER',
  'ORDER_MANAGER',
  'CUSTOMER_SUPPORT',
  'MODERATOR',
  'INVENTORY_STAFF',
  'ACCOUNTANT',
  'MARKETING_MANAGER',
  'CONTENT_MANAGER',
]);

export function isStaffPrincipal(principal: AuthenticatedPrincipal): boolean {
  return principal.roles.some((r) => STAFF_ROLES.has(r));
}

function extractSessionToken(req: Request): string | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  return null;
}

export async function attachOptionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const token = extractSessionToken(req);
    if (token) {
      const principal = await resolvePrincipalFromToken(token);
      if (principal) {
        req.principal = principal;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const token = extractSessionToken(req);
    if (!token) {
      return next(new UnauthorizedError('Authentication is required.'));
    }

    const principal = await resolvePrincipalFromToken(token);
    if (!principal) {
      return next(new UnauthorizedError('Session is invalid or expired.'));
    }

    req.principal = principal;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireStaff(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!req.principal) {
    return next(new UnauthorizedError('Authentication is required.'));
  }
  if (!isStaffPrincipal(req.principal)) {
    return next(new ForbiddenError('Staff role access is required.'));
  }
  if (req.principal.mfaEnabled && !req.principal.mfaVerified) {
    return next(new ForbiddenError('MFA verification is required for this privileged account.'));
  }
  return next();
}

export function requirePermission(...required: PermissionCode[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.principal) {
      return next(new UnauthorizedError('Authentication is required.'));
    }
    if (!isStaffPrincipal(req.principal)) {
      return next(new ForbiddenError('Staff privileges are required.'));
    }
    if (req.principal.mfaEnabled && !req.principal.mfaVerified) {
      return next(new ForbiddenError('MFA verification is required before privileged operations.'));
    }

    // Super Admin always holds full capabilities; otherwise verify explicit permissions
    if (req.principal.roles.includes('SUPER_ADMIN')) {
      return next();
    }

    const held = new Set(req.principal.permissions);
    const hasAll = required.every((perm) => held.has(perm));
    if (!hasAll) {
      return next(
        new ForbiddenError(`Missing required permission: ${required.join(', ')}`),
      );
    }

    return next();
  };
}

export function requireRole(...allowed: RoleCode[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.principal) {
      return next(new UnauthorizedError('Authentication is required.'));
    }
    if (req.principal.mfaEnabled && !req.principal.mfaVerified) {
      return next(new ForbiddenError('MFA verification is required.'));
    }
    const hasRole = req.principal.roles.some((r) => allowed.includes(r));
    if (!hasRole) {
      return next(new ForbiddenError('Insufficient role for this operation.'));
    }
    return next();
  };
}

export function requireAnyPermission(...allowed: PermissionCode[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.principal) {
      return next(new UnauthorizedError('Authentication is required.'));
    }
    if (!isStaffPrincipal(req.principal)) {
      return next(new ForbiddenError('Staff privileges are required.'));
    }
    if (req.principal.mfaEnabled && !req.principal.mfaVerified) {
      return next(new ForbiddenError('MFA verification is required before privileged operations.'));
    }
    if (req.principal.roles.includes('SUPER_ADMIN')) {
      return next();
    }
    const held = new Set(req.principal.permissions);
    if (!allowed.some((perm) => held.has(perm))) {
      return next(
        new ForbiddenError(`Missing any of required permissions: ${allowed.join(', ')}`),
      );
    }
    return next();
  };
}
