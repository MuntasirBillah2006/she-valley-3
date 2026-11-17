import {Loader2} from 'lucide-react';
import {cn} from '@/src/lib/cn';

export interface LoadingIndicatorProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const ICON_SIZES = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-7 w-7',
};

export function LoadingIndicator({
  label = 'Loading',
  size = 'md',
  className,
}: LoadingIndicatorProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('inline-flex items-center gap-2.5 text-sm text-brand-charcoal-muted', className)}
    >
      <Loader2 className={cn('animate-spin text-brand-burgundy', ICON_SIZES[size])} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
