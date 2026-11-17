import type {ReactNode} from 'react';
import {cn} from '@/src/lib/cn';

export interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function FormField({
  id,
  label,
  required = false,
  hint,
  error,
  children,
  className,
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-brand-charcoal flex items-center gap-1">
        <span>{label}</span>
        {required && (
          <span className="text-brand-burgundy" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div>{children}</div>
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-status-error-fg">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-xs text-brand-charcoal-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
