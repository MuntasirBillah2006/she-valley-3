import type {ReactNode} from 'react';
import {AlertCircle, CheckCircle2, Info, TriangleAlert} from 'lucide-react';
import {cn} from '@/src/lib/cn';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

const ALERT_STYLES: Record<AlertVariant, string> = {
  info: 'border-brand-border bg-brand-ivory-elevated text-brand-charcoal',
  success: 'border-status-success-fg/25 bg-status-success-bg text-status-success-fg',
  warning: 'border-status-warning-fg/25 bg-status-warning-bg text-status-warning-fg',
  error: 'border-status-error-fg/25 bg-status-error-bg text-status-error-fg',
};

function AlertIcon({variant}: {variant: AlertVariant}) {
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

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children?: ReactNode;
  className?: string;
}

export function Alert({variant = 'info', title, children, className}: AlertProps) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-xl border p-4',
        ALERT_STYLES[variant],
        className,
      )}
    >
      <AlertIcon variant={variant} />
      <div className="space-y-1 text-sm">
        {title && <p className="font-semibold leading-snug">{title}</p>}
        {children && (
          <div className={cn(title ? 'text-xs opacity-90 leading-relaxed' : 'text-sm font-medium leading-snug')}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
