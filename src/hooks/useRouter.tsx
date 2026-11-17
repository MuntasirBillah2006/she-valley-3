import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocale } from '@/src/hooks/useLocale';
import type { Locale } from '@/src/types';

interface RouterContextValue {
  pathname: string;
  cleanPath: string;
  search: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  switchLanguageAndRoute: (nextLocale?: Locale) => void;
  setPageMeta: (title: string, description?: string) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

function stripLocalePrefix(pathname: string): { localeFromPath: Locale | null; cleanPath: string } {
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    const rest = pathname.slice(3) || '/';
    return { localeFromPath: 'en', cleanPath: rest.startsWith('/') ? rest : `/${rest}` };
  }
  if (pathname === '/bn' || pathname.startsWith('/bn/')) {
    const rest = pathname.slice(3) || '/';
    return { localeFromPath: 'bn', cleanPath: rest.startsWith('/') ? rest : `/${rest}` };
  }
  return { localeFromPath: null, cleanPath: pathname || '/' };
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useLocale();
  const [locationState, setLocationState] = useState(() => ({
    pathname: typeof window !== 'undefined' ? window.location.pathname : '/',
    search: typeof window !== 'undefined' ? window.location.search : '',
  }));

  useEffect(() => {
    const { localeFromPath } = stripLocalePrefix(locationState.pathname);
    if (localeFromPath && localeFromPath !== locale) {
      setLocale(localeFromPath);
    }
  }, [locationState.pathname, locale, setLocale]);

  useEffect(() => {
    const handlePop = () => {
      setLocationState({
        pathname: window.location.pathname,
        search: window.location.search,
      });
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const navigate = useCallback(
    (to: string, options?: { replace?: boolean }) => {
      if (typeof window === 'undefined') {
        return;
      }
      const [rawPath, rawSearch] = to.split('?');
      const { localeFromPath, cleanPath } = stripLocalePrefix(rawPath || '/');
      const targetLocale = localeFromPath || locale;
      const finalPath = cleanPath === '/' ? `/${targetLocale}` : `/${targetLocale}${cleanPath}`;
      const finalUrl = rawSearch ? `${finalPath}?${rawSearch}` : finalPath;

      if (options?.replace) {
        window.history.replaceState({}, '', finalUrl);
      } else {
        window.history.pushState({}, '', finalUrl);
      }

      setLocationState({
        pathname: finalPath,
        search: rawSearch ? `?${rawSearch}` : '',
      });
      window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [locale],
  );

  const switchLanguageAndRoute = useCallback(
    (nextLocale?: Locale) => {
      const target = nextLocale ?? (locale === 'en' ? 'bn' : 'en');
      setLocale(target);
      if (typeof window !== 'undefined') {
        const { cleanPath } = stripLocalePrefix(window.location.pathname);
        const nextPath = cleanPath === '/' ? `/${target}` : `/${target}${cleanPath}`;
        const nextUrl = `${nextPath}${window.location.search}`;
        window.history.replaceState({}, '', nextUrl);
        setLocationState({ pathname: nextPath, search: window.location.search });
      }
    },
    [locale, setLocale],
  );

  const setPageMeta = useCallback((title: string, description?: string) => {
    if (typeof document === 'undefined') {
      return;
    }
    document.title = title.includes('SHE-VALLEY') ? title : `${title} | SHE-VALLEY`;
    if (description) {
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', description);
      }
    }
  }, []);

  const { cleanPath } = stripLocalePrefix(locationState.pathname);

  const value = useMemo<RouterContextValue>(
    () => ({
      pathname: locationState.pathname,
      cleanPath,
      search: locationState.search,
      navigate,
      switchLanguageAndRoute,
      setPageMeta,
    }),
    [locationState.pathname, cleanPath, locationState.search, navigate, switchLanguageAndRoute, setPageMeta],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error('useRouter must be used inside RouterProvider.');
  }
  return ctx;
}
