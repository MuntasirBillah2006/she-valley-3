import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/src/lib/cn';

export function ProductImage({
  src,
  alt,
  className,
  priority = false,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center bg-gradient-to-br from-brand-ivory-muted via-brand-ivory to-brand-nude/45 text-brand-charcoal-muted select-none',
          className,
        )}
        role="img"
        aria-label={alt}
      >
        <Sparkles className="h-6 w-6 text-brand-burgundy/60 mb-2" aria-hidden="true" />
        <span className="font-display text-sm tracking-wide text-brand-charcoal/80 px-4 text-center line-clamp-2">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      fetchPriority={priority ? 'high' : undefined}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn('object-cover', className)}
    />
  );
}
