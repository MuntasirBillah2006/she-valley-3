import type {InputHTMLAttributes} from 'react';
import {cn} from '@/src/lib/cn';

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
}

export function Radio({label, description, id, className, checked, ...props}: RadioProps) {
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
          type="radio"
          checked={checked}
          className="peer sr-only"
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full border transition-colors duration-150',
            'border-brand-border bg-brand-ivory-elevated',
            'peer-checked:border-brand-burgundy',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-burgundy',
          )}
        >
          <span
            className={cn(
              'h-2.5 w-2.5 rounded-full bg-brand-burgundy transition-transform duration-150',
              checked ? 'scale-100' : 'scale-0',
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

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  name: string;
  legend: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly RadioOption[];
  className?: string;
}

export function RadioGroup({
  name,
  legend,
  value,
  onChange,
  options,
  className,
}: RadioGroupProps) {
  return (
    <fieldset className={cn('space-y-1', className)}>
      <legend className="text-sm font-medium text-brand-charcoal mb-2">{legend}</legend>
      <div className="space-y-1">
        {options.map((opt) => (
          <Radio
            key={opt.value}
            id={`${name}-${opt.value}`}
            name={name}
            value={opt.value}
            label={opt.label}
            description={opt.description}
            disabled={opt.disabled}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
        ))}
      </div>
    </fieldset>
  );
}
