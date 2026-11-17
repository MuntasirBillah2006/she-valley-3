import {ChevronRight} from 'lucide-react';
import {cn} from '@/src/lib/cn';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface BreadcrumbProps {
  items: readonly BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({items, className}: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn('text-xs text-brand-charcoal-muted', className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={`${item.label}-${idx}`} className="inline-flex items-center gap-1.5">
              {idx > 0 && <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />}
              {isLast ? (
                <span aria-current="page" className="font-medium text-brand-charcoal">
                  {item.label}
                </span>
              ) : item.href ? (
                <a
                  href={item.href}
                  onClick={(e) => {
                    if (item.onClick) {
                      e.preventDefault();
                      item.onClick();
                    }
                  }}
                  className="hover:text-brand-burgundy transition-colors"
                >
                  {item.label}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={item.onClick}
                  className="hover:text-brand-burgundy transition-colors cursor-pointer"
                >
                  {item.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
