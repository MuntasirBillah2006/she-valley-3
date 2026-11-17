import type {InputHTMLAttributes} from 'react';
import {Check} from 'lucide-react';
import {cn} from '@/src/lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
}

export function Checkbox({label, description, id, className, checked, ...props}: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start gap-3 min-h-11 py-1.5 cursor-pointer select-none',
        props.disabled && 'opacity-60 cursor-not-allowed',
        className,
      )}
    >
      <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          className="peer sr-only"
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded border transition-colors duration-150',
            'border-brand-border bg-brand-ivory-elevated',
            'peer-checked:border-brand-burgundy peer-checked:bg-brand-burgundy',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-burgundy',
          )}
        >
          <Check
            className={cn(
              'h-3.5 w-3.5 text-brand-ivory-elevated transition-opacity',
              checked ? 'opacity-100' : 'opacity-0',
            )}
          />
        </span>
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-medium text-brand-charcoal leading-snug">{label}</span>
        {description && (
          <span className="text-xs text-brand-charcoal-muted mt-0.5">{description}</span>
        )}
      </span>
    </label>
  );
}
