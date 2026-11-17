import bcrypt from 'bcryptjs';
import { and, eq, gt } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db/index.ts';
import {
  customers,
  permissions,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from '../db/schema.ts';
import { generateOpaqueToken, hashToken } from './rateLimit.ts';

export const SESSION_COOKIE_NAME = 'sv_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export type RoleCode =
  | 'SUPER_ADMIN'
  | 'STORE_MANAGER'
  | 'ORDER_MANAGER'
  | 'CUSTOMER_SUPPORT'
  | 'MODERATOR'
  | 'INVENTORY_STAFF'
  | 'ACCOUNTANT'
  | 'MARKETING_MANAGER'
  | 'CONTENT_MANAGER'
  | 'CUSTOMER';

export type PermissionCode =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'export'
  | 'refund'
  | 'manage_users'
  | 'manage_settings';

export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
  email: string;
  fullName: string;
  phone: string | null;
  preferredLocale: 'en' | 'bn';
  roles: RoleCode[];
  permissions: PermissionCode[];
  mfaEnabled: boolean;
  mfaVerified: boolean;
  status: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function setSessionCookie(res: Response, rawToken: string): void {
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

export async function createUserSession(params: {
  userId: string;
  mfaVerified: boolean;
  req: Request;
}): Promise<{ rawToken: string; sessionId: string; expiresAt: Date }> {
  const rawToken = generateOpaqueToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const [created] = await db
    .insert(sessions)
    .values({
      userId: params.userId,
      tokenHash,
      mfaVerified: params.mfaVerified,
      ipAddress: params.req.ip || null,
      userAgent: params.req.headers['user-agent']?.slice(0, 250) || null,
      expiresAt,
    })
    .returning({ id: sessions.id });

  return { rawToken, sessionId: created.id, expiresAt };
}

export async function loadUserRolesAndPermissions(userId: string): Promise<{
  roles: RoleCode[];
  permissions: PermissionCode[];
}> {
  const roleRows = await db
    .select({
      roleId: roles.id,
      roleCode: roles.code,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  const roleCodes = roleRows.map((r) => r.roleCode as RoleCode);
  if (roleCodes.length === 0) {
    return { roles: ['CUSTOMER'], permissions: [] };
  }

  const permRows = await db
    .select({
      permCode: permissions.code,
      roleCode: roles.code,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(userRoles.userId, userId));

  const permSet = new Set<PermissionCode>();
  for (const row of permRows) {
    permSet.add(row.permCode as PermissionCode);
  }

  return {
    roles: roleCodes,
    permissions: Array.from(permSet),
  };
}

export async function resolvePrincipalFromToken(rawToken: string): Promise<AuthenticatedPrincipal | null> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const rows = await db
    .select({
      sessionId: sessions.id,
      mfaVerified: sessions.mfaVerified,
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      phone: users.phone,
      preferredLocale: users.preferredLocale,
      mfaEnabled: users.mfaEnabled,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  if (row.status !== 'ACTIVE') {
    return null;
  }

  const { roles: userRoleCodes, permissions: userPerms } = await loadUserRolesAndPermissions(row.userId);

  return {
    userId: row.userId,
    sessionId: row.sessionId,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    preferredLocale: row.preferredLocale === 'bn' ? 'bn' : 'en',
    roles: userRoleCodes,
    permissions: userPerms,
    mfaEnabled: row.mfaEnabled,
    mfaVerified: row.mfaVerified,
    status: row.status,
  };
}

/**
 * Concurrency-safe user + customer upsert when signing in via Firebase Auth.
 */
export async function upsertFirebaseUser(params: {
  uid: string;
  email: string;
  fullName: string;
}): Promise<{ id: string; email: string; fullName: string; mfaEnabled: boolean }> {
  const existingByUid = await db.select().from(users).where(eq(users.uid, params.uid)).limit(1);
  if (existingByUid.length > 0) {
    const [updated] = await db
      .update(users)
      .set({ email: params.email, emailVerified: true, lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, existingByUid[0].id))
      .returning();
    return updated;
  }

  const existingByEmail = await db.select().from(users).where(eq(users.email, params.email)).limit(1);
  if (existingByEmail.length > 0) {
    const [linked] = await db
      .update(users)
      .set({ uid: params.uid, emailVerified: true, lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, existingByEmail[0].id))
      .returning();
    return linked;
  }

  const [created] = await db
    .insert(users)
    .values({
      uid: params.uid,
      email: params.email,
      fullName: params.fullName || params.email.split('@')[0],
      emailVerified: true,
      status: 'ACTIVE',
      lastLoginAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { uid: params.uid, emailVerified: true, lastLoginAt: new Date(), updatedAt: new Date() },
    })
    .returning();

  const [customerRole] = await db.select().from(roles).where(eq(roles.code, 'CUSTOMER')).limit(1);
  if (customerRole) {
    await db
      .insert(userRoles)
      .values({ userId: created.id, roleId: customerRole.id })
      .onConflictDoNothing();
  }

  const existingCustomer = await db
    .select()
    .from(customers)
    .where(eq(customers.userId, created.id))
    .limit(1);
  if (existingCustomer.length === 0) {
    await db
      .insert(customers)
      .values({
        userId: created.id,
        fullName: created.fullName,
        email: created.email,
        phone: `pending-${created.id.slice(0, 8)}`,
      })
      .onConflictDoNothing();
  }

  return created;
}
