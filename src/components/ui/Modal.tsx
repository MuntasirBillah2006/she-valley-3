import {useEffect, type ReactNode} from 'react';
import {X} from 'lucide-react';
import {cn} from '@/src/lib/cn';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-charcoal/45 backdrop-blur-[2px]"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sv-modal-title"
        aria-describedby={description ? 'sv-modal-desc' : undefined}
        className={cn(
          'w-full rounded-xl bg-brand-ivory-elevated border border-brand-border p-6 shadow-[var(--shadow-modal)]',
          SIZE_CLASSES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-brand-border">
          <div className="space-y-1">
            <h2 id="sv-modal-title" className="font-display text-2xl font-semibold text-brand-charcoal">
              {title}
            </h2>
            {description && (
              <p id="sv-modal-desc" className="text-sm text-brand-charcoal-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-brand-charcoal-muted hover:bg-brand-ivory-muted hover:text-brand-charcoal transition-colors cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="py-5 text-sm text-brand-charcoal">{children}</div>

        {footer && (
          <div className="pt-4 border-t border-brand-border flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
