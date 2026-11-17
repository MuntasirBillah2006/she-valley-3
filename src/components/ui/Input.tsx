import type {InputHTMLAttributes} from 'react';
import {cn} from '@/src/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export function Input({hasError = false, className, ...props}: InputProps) {
  return (
    <input
      aria-invalid={hasError || undefined}
      className={cn(
        'w-full min-h-11 rounded-lg bg-brand-ivory-elevated px-3.5 py-2.5 text-sm text-brand-charcoal placeholder:text-brand-charcoal-muted/70',
        'border transition-colors duration-150',
        hasError
          ? 'border-status-error-fg bg-status-error-bg/30'
          : 'border-brand-border hover:border-brand-rose/70',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  );
}
