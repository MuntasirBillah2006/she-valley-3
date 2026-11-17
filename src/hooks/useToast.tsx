import {createContext, useCallback, useContext, useMemo, useState, type ReactNode} from 'react';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toasts: readonly ToastItem[];
  pushToast: (toast: Omit<ToastItem, 'id'> & {durationMs?: number}) => string;
  showToast: (toast: Omit<ToastItem, 'id'> & {durationMs?: number}) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({children}: {children: ReactNode}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    ({durationMs = 4500, ...toast}: Omit<ToastItem, 'id'> & {durationMs?: number}) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, {id, ...toast}]);

      if (durationMs > 0 && typeof window !== 'undefined') {
        window.setTimeout(() => {
          dismissToast(id);
        }, durationMs);
      }
      return id;
    },
    [dismissToast],
  );

  const value = useMemo(
    () => ({toasts, pushToast, showToast: pushToast, dismissToast}),
    [toasts, pushToast, dismissToast],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside a ToastProvider.');
  }
  return ctx;
}
