import type {TextareaHTMLAttributes} from 'react';
import {cn} from '@/src/lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export function Textarea({hasError = false, className, rows = 4, ...props}: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={hasError || undefined}
      className={cn(
        'w-full rounded-lg bg-brand-ivory-elevated px-3.5 py-2.5 text-sm text-brand-charcoal placeholder:text-brand-charcoal-muted/70',
        'border transition-colors duration-150 resize-y',
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
