import type {ReactNode} from 'react';
import {cn} from '@/src/lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-brand-border bg-brand-ivory-elevated px-6 py-10 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-ivory-muted text-brand-burgundy">
          {icon}
        </div>
      )}
      <h4 className="font-display text-xl font-semibold text-brand-charcoal">{title}</h4>
      {description && (
        <p className="mt-1.5 max-w-md text-sm text-brand-charcoal-muted leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
