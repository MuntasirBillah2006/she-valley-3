import type {ReactNode} from 'react';
import {cn} from '@/src/lib/cn';

export type BadgeVariant = 'neutral' | 'burgundy' | 'success' | 'warning' | 'error';

const BADGE_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-brand-ivory-muted text-brand-charcoal border-brand-border',
  burgundy: 'bg-brand-burgundy-soft text-brand-burgundy border-brand-rose/35',
  success: 'bg-status-success-bg text-status-success-fg border-status-success-fg/20',
  warning: 'bg-status-warning-bg text-status-warning-fg border-status-warning-fg/20',
  error: 'bg-status-error-bg text-status-error-fg border-status-error-fg/20',
};

export interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

export function Badge({variant = 'neutral', children, className}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0',
        BADGE_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
