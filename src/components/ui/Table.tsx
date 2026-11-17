import type {ReactNode} from 'react';
import {cn} from '@/src/lib/cn';

export function Table({children, className}: {children: ReactNode; className?: string}) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-brand-border bg-brand-ivory-elevated">
      <table className={cn('w-full border-collapse text-left text-sm', className)}>{children}</table>
    </div>
  );
}

export function TableHead({children}: {children: ReactNode}) {
  return (
    <thead className="bg-brand-ivory-muted/70 text-xs font-semibold text-brand-charcoal-muted border-b border-brand-border">
      {children}
    </thead>
  );
}

export function TableBody({children}: {children: ReactNode}) {
  return <tbody className="divide-y divide-brand-border">{children}</tbody>;
}

export function TableRow({children, className}: {children: ReactNode; className?: string}) {
  return <tr className={cn('hover:bg-brand-ivory/60 transition-colors', className)}>{children}</tr>;
}

export function TableHeaderCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <th className={cn('px-4 py-3 font-medium whitespace-nowrap', className)}>{children}</th>;
}

export function TableCell({
  children,
  numeric = false,
  className,
}: {
  children: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        'px-4 py-3 text-brand-charcoal align-top',
        numeric && 'font-mono tabular-nums',
        className,
      )}
    >
      {children}
    </td>
  );
}
