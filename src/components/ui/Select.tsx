import type {SelectHTMLAttributes} from 'react';
import {ChevronDown} from 'lucide-react';
import {cn} from '@/src/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly SelectOption[];
  placeholder?: string;
  hasError?: boolean;
}

export function Select({
  options,
  placeholder,
  hasError = false,
  className,
  ...props
}: SelectProps) {
  return (
    <div className="relative w-full">
      <select
        aria-invalid={hasError || undefined}
        className={cn(
          'w-full min-h-11 appearance-none rounded-lg bg-brand-ivory-elevated pl-3.5 pr-10 py-2.5 text-sm text-brand-charcoal',
          'border transition-colors duration-150 cursor-pointer',
          hasError
            ? 'border-status-error-fg bg-status-error-bg/30'
            : 'border-brand-border hover:border-brand-rose/70',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-charcoal-muted"
        aria-hidden="true"
      />
    </div>
  );
}
