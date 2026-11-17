import { and, eq, gt, isNull } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { BD_PHONE_REGEX, normalizeBdPhone } from '../../config/bangladesh.ts';
import { db } from '../../db/index.ts';
import {
  customers,
  passwordResetTokens,
  roles,
  sessions,
  userRoles,
  users,
} from '../../db/schema.ts';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../lib/errors.ts';
import { adminAuth } from '../../lib/firebase-admin.ts';
import { recordAuditLog } from '../audit.ts';
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  createUserSession,
  hashPassword,
  loadUserRolesAndPermissions,
  setSessionCookie,
  upsertFirebaseUser,
  verifyPassword,
} from '../auth.ts';
import { createRateLimiter, generateOpaqueToken, hashToken } from '../rateLimit.ts';
import { requireAuth, type AuthRequest } from '../rbac.ts';

const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 25,
  keyPrefix: 'auth',
});

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().toLowerCase(),
  phone: z
    .string()
    .trim()
    .regex(BD_PHONE_REGEX, 'Enter a valid 11-digit Bangladesh mobile number.'),
  password: z.string().min(8).max(128),
  preferredLocale: z.enum(['en', 'bn']).default('en'),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(1),
});

const mfaSchema = z.object({
  passcode: z.string().trim().min(4).max(12),
});

const resetRequestSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});

const resetConfirmSchema = z.object({
  token: z.string().trim().min(16),
  newPassword: z.string().min(8).max(128),
});

export const authRouter = Router();

authRouter.get('/me', (req: AuthRequest, res) => {
  return res.json({
    success: true,
    data: { user: req.principal ?? null },
  });
});

authRouter.post('/register', authLimiter, async (req: AuthRequest, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'Please check registration fields.',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        req.requestId,
      );
    }

    const phone = normalizeBdPhone(parsed.data.phone);
    const existingEmail = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);
    if (existingEmail.length > 0) {
      throw new ConflictError('An account with this email already exists.', req.requestId);
    }

    const existingPhone = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    if (existingPhone.length > 0) {
      throw new ConflictError('An account with this mobile number already exists.', req.requestId);
    }

    const passwordHash = await hashPassword(parsed.data.password);

    const createdUser = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          email: parsed.data.email,
          phone,
          passwordHash,
          fullName: parsed.data.fullName,
          preferredLocale: parsed.data.preferredLocale,
          status: 'ACTIVE',
          emailVerified: false,
          mfaEnabled: false,
        })
        .returning();

      const [custRole] = await tx
        .select()
        .from(roles)
        .where(eq(roles.code, 'CUSTOMER'))
        .limit(1);
      if (custRole) {
        await tx.insert(userRoles).values({ userId: u.id, roleId: custRole.id });
      }

      await tx
        .insert(customers)
        .values({
          userId: u.id,
          fullName: u.fullName,
          phone,
          email: u.email,
        })
        .onConflictDoUpdate({
          target: customers.phone,
          set: { userId: u.id, fullName: u.fullName, email: u.email, updatedAt: new Date() },
        });

      await recordAuditLog(tx, {
        actorUserId: u.id,
        actorEmail: u.email,
        actorRole: 'CUSTOMER',
        action: 'AUTH_REGISTER',
        entityType: 'users',
        entityId: u.id,
        afterState: { email: u.email, phone },
        ipAddress: req.ip,
        requestId: req.requestId || 'unknown',
      });

      return u;
    });

    const { rawToken } = await createUserSession({
      userId: createdUser.id,
      mfaVerified: true,
      req,
    });
    setSessionCookie(res, rawToken);

    const authz = await loadUserRolesAndPermissions(createdUser.id);
    return res.status(201).json({
      success: true,
      data: {
        token: rawToken,
        user: {
          userId: createdUser.id,
          email: createdUser.email,
          fullName: createdUser.fullName,
          phone: createdUser.phone,
          preferredLocale: createdUser.preferredLocale,
          roles: authz.roles,
          permissions: authz.permissions,
          mfaEnabled: false,
          mfaVerified: true,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', authLimiter, async (req: AuthRequest, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Email/phone and password are required.', undefined, req.requestId);
    }

    const rawId = parsed.data.identifier.trim();
    const isEmail = rawId.includes('@');
    const normalized = isEmail ? rawId.toLowerCase() : normalizeBdPhone(rawId);

    const rows = await db
      .select()
      .from(users)
      .where(isEmail ? eq(users.email, normalized) : eq(users.phone, normalized))
      .limit(1);

    if (rows.length === 0 || !rows[0].passwordHash) {
      throw new UnauthorizedError('Invalid credentials.', req.requestId);
    }

    const user = rows[0];
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid credentials.', req.requestId);
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedError('This account has been disabled. Contact support.', req.requestId);
    }

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) {
      await recordAuditLog(db, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: 'UNKNOWN',
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'users',
        entityId: user.id,
        ipAddress: req.ip,
        requestId: req.requestId || 'unknown',
      });
      throw new UnauthorizedError('Invalid credentials.', req.requestId);
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const authz = await loadUserRolesAndPermissions(user.id);
    const mfaRequired = Boolean(user.mfaEnabled);
    const { rawToken } = await createUserSession({
      userId: user.id,
      mfaVerified: !mfaRequired,
      req,
    });
    setSessionCookie(res, rawToken);

    await recordAuditLog(db, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: authz.roles[0] || 'CUSTOMER',
      action: mfaRequired ? 'AUTH_LOGIN_MFA_CHALLENGE' : 'AUTH_LOGIN',
      entityType: 'users',
      entityId: user.id,
      ipAddress: req.ip,
      requestId: req.requestId || 'unknown',
    });

    return res.json({
      success: true,
      data: {
        token: rawToken,
        mfaRequired,
        user: {
          userId: user.id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          preferredLocale: user.preferredLocale,
          roles: authz.roles,
          permissions: authz.permissions,
          mfaEnabled: user.mfaEnabled,
          mfaVerified: !mfaRequired,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/mfa/verify', authLimiter, requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const parsed = mfaSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('A valid MFA passcode is required.', undefined, req.requestId);
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.principal!.userId))
      .limit(1);

    if (!user || !user.mfaEnabled || !user.mfaPasscodeHash) {
      throw new ValidationError('MFA is not configured on this account.', undefined, req.requestId);
    }

    const ok = await verifyPassword(parsed.data.passcode, user.mfaPasscodeHash);
    if (!ok) {
      throw new UnauthorizedError('Invalid MFA verification passcode.', req.requestId);
    }

    await db
      .update(sessions)
      .set({ mfaVerified: true })
      .where(eq(sessions.id, req.principal!.sessionId));

    await recordAuditLog(db, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: req.principal!.roles[0] || 'STAFF',
      action: 'AUTH_MFA_VERIFIED',
      entityType: 'sessions',
      entityId: req.principal!.sessionId,
      ipAddress: req.ip,
      requestId: req.requestId || 'unknown',
    });

    return res.json({
      success: true,
      data: { mfaVerified: true },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/firebase', authLimiter, async (req: AuthRequest, res, next) => {
  try {
    const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';
    if (!idToken) {
      throw new ValidationError('Firebase ID token is required.', undefined, req.requestId);
    }

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch {
      throw new UnauthorizedError('Invalid Firebase authentication token.', req.requestId);
    }

    if (!decoded.email) {
      throw new ValidationError('Google account email is required.', undefined, req.requestId);
    }

    const user = await upsertFirebaseUser({
      uid: decoded.uid,
      email: decoded.email.toLowerCase(),
      fullName: decoded.name || decoded.email.split('@')[0],
    });

    const authz = await loadUserRolesAndPermissions(user.id);
    const { rawToken } = await createUserSession({
      userId: user.id,
      mfaVerified: !user.mfaEnabled,
      req,
    });
    setSessionCookie(res, rawToken);

    await recordAuditLog(db, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: authz.roles[0] || 'CUSTOMER',
      action: 'AUTH_LOGIN_FIREBASE',
      entityType: 'users',
      entityId: user.id,
      ipAddress: req.ip,
      requestId: req.requestId || 'unknown',
    });

    return res.json({
      success: true,
      data: {
        token: rawToken,
        mfaRequired: user.mfaEnabled,
        user: {
          userId: user.id,
          email: user.email,
          fullName: user.fullName,
          roles: authz.roles,
          permissions: authz.permissions,
          mfaEnabled: user.mfaEnabled,
          mfaVerified: !user.mfaEnabled,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req: AuthRequest, res, next) => {
  try {
    const rawToken =
      req.cookies?.[SESSION_COOKIE_NAME] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7).trim()
        : null);

    if (rawToken) {
      await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(rawToken)));
    }
    clearSessionCookie(res);
    return res.json({ success: true, data: { loggedOut: true } });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/password-reset/request', authLimiter, async (req: AuthRequest, res, next) => {
  try {
    const parsed = resetRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Valid email is required.', undefined, req.requestId);
    }

    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    let devPreviewToken: string | undefined;
    if (user) {
      const rawToken = generateOpaqueToken(24);
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      if (process.env.NODE_ENV !== 'production') {
        devPreviewToken = rawToken;
      }
    }

    return res.json({
      success: true,
      data: {
        message: 'If an account matches this email, password reset instructions have been issued.',
        ...(devPreviewToken ? { devPreviewToken } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/password-reset/confirm', authLimiter, async (req: AuthRequest, res, next) => {
  try {
    const parsed = resetConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Valid reset token and new password (min 8 chars) are required.', undefined, req.requestId);
    }

    const tokenHash = hashToken(parsed.data.token);
    const now = new Date();
    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundError('Password reset token');
    }

    const record = rows[0];
    const newHash = await hashPassword(parsed.data.newPassword);

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, record.userId));
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, record.id));
      await tx.delete(sessions).where(eq(sessions.userId, record.userId));
    });

    return res.json({
      success: true,
      data: { passwordUpdated: true },
    });
  } catch (err) {
    next(err);
  }
});
