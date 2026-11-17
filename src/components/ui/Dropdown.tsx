import {useEffect, useRef, useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {cn} from '@/src/lib/cn';

export interface DropdownItem {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface DropdownProps {
  label: string;
  items: readonly DropdownItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function Dropdown({label, items, selectedId, onSelect, className}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const activeItem = items.find((item) => item.id === selectedId);

  return (
    <div ref={containerRef} className={cn('relative inline-block text-left', className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex min-h-11 items-center justify-between gap-2.5 rounded-lg border border-brand-border bg-brand-ivory-elevated px-4 py-2 text-sm font-medium text-brand-charcoal hover:bg-brand-ivory-muted transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <span>{activeItem ? activeItem.label : label}</span>
        <ChevronDown
          className={cn('h-4 w-4 text-brand-charcoal-muted transition-transform', isOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 min-w-48 rounded-lg border border-brand-border bg-brand-ivory-elevated p-1.5 shadow-[var(--shadow-soft)]"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onSelect(item.id);
                setIsOpen(false);
              }}
              className={cn(
                'flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                item.id === selectedId
                  ? 'bg-brand-burgundy-soft text-brand-burgundy font-medium'
                  : 'text-brand-charcoal hover:bg-brand-ivory-muted',
                item.disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
