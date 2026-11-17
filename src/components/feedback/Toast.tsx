import {AlertCircle, CheckCircle2, Info, TriangleAlert, X} from 'lucide-react';
import {useToast, type ToastVariant} from '@/src/hooks/useToast';
import {cn} from '@/src/lib/cn';

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  info: 'border-brand-border bg-brand-ivory-elevated text-brand-charcoal',
  success: 'border-status-success-fg/25 bg-status-success-bg text-status-success-fg',
  warning: 'border-status-warning-fg/25 bg-status-warning-bg text-status-warning-fg',
  error: 'border-status-error-fg/25 bg-status-error-bg text-status-error-fg',
};

function ToastIcon({variant}: {variant: ToastVariant}) {
  switch (variant) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />;
    case 'warning':
      return <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />;
    case 'info':
    default:
      return <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />;
  }
}

export function ToastViewport({dismissLabel = 'Dismiss'}: {dismissLabel?: string}) {
  const {toasts, dismissToast} = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cn(
            'flex items-start gap-3 rounded-xl border p-4 shadow-[var(--shadow-soft)]',
            VARIANT_CLASSES[toast.variant],
          )}
        >
          <ToastIcon variant={toast.variant} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-snug">{toast.title}</p>
            {toast.message && <p className="mt-1 text-xs opacity-90 leading-relaxed">{toast.message}</p>}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label={dismissLabel}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-black/5 cursor-pointer shrink-0"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
