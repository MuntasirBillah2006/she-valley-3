import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { apiClient } from '@/src/lib/apiClient';
import { firebaseAuth, googleAuthProvider } from '@/src/lib/firebase';

export interface AuthUser {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  preferredLocale: 'en' | 'bn';
  roles: string[];
  permissions: string[];
  mfaEnabled: boolean;
  mfaVerified: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isStaff: boolean;
  refreshUser: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<{ user: AuthUser; mfaRequired: boolean }>;
  verifyMfa: (passcode: string) => Promise<void>;
  register: (input: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    preferredLocale: 'en' | 'bn';
  }) => Promise<AuthUser>;
  loginWithGoogle: () => Promise<{ user: AuthUser; mfaRequired: boolean }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STAFF_ROLE_SET = new Set([
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiClient.get<{ user: AuthUser | null }>('/api/v1/auth/me');
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await apiClient.post<{ user: AuthUser; mfaRequired: boolean }>('/api/v1/auth/login', {
      identifier,
      password,
    });
    setUser(data.user);
    return data;
  }, []);

  const verifyMfa = useCallback(async (passcode: string) => {
    await apiClient.post('/api/v1/auth/mfa/verify', { passcode });
    await refreshUser();
  }, [refreshUser]);

  const register = useCallback(
    async (input: {
      fullName: string;
      email: string;
      phone: string;
      password: string;
      preferredLocale: 'en' | 'bn';
    }) => {
      const data = await apiClient.post<{ user: AuthUser }>('/api/v1/auth/register', input);
      setUser(data.user);
      return data.user;
    },
    [],
  );

  const loginWithGoogle = useCallback(async () => {
    const cred = await signInWithPopup(firebaseAuth, googleAuthProvider);
    const idToken = await cred.user.getIdToken();
    const data = await apiClient.post<{ user: AuthUser; mfaRequired: boolean }>('/api/v1/auth/firebase', {
      idToken,
    });
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await apiClient.post('/api/v1/auth/logout');
    setUser(null);
  }, []);

  const isStaff = Boolean(user?.roles.some((r) => STAFF_ROLE_SET.has(r)));

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isStaff,
      refreshUser,
      login,
      verifyMfa,
      register,
      loginWithGoogle,
      logout,
    }),
    [user, isLoading, isStaff, refreshUser, login, verifyMfa, register, loginWithGoogle, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return ctx;
}
