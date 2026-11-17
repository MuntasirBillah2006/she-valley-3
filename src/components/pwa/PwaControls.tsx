import { Download, WifiOff } from 'lucide-react';
import { useLocale } from '@/src/hooks/useLocale';
import { usePWAInstall } from '@/src/hooks/usePWAInstall';

export function OfflineIndicator() {
  const { isOffline } = usePWAInstall();
  const { messages } = useLocale();

  if (!isOffline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-status-warning-bg text-status-warning-fg border-b border-brand-border text-xs"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2 flex items-center gap-2">
        <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{messages.pwa.offlineBanner}</span>
      </div>
    </div>
  );
}

export function PWAInstallButton() {
  const { isInstallable, promptInstall } = usePWAInstall();
  const { messages } = useLocale();

  if (!isInstallable) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => void promptInstall()}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-brand-burgundy border border-brand-burgundy/40 bg-brand-burgundy-soft/50 hover:bg-brand-burgundy-soft transition-colors whitespace-nowrap shrink-0 cursor-pointer"
    >
      <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{messages.pwa.installApp}</span>
    </button>
  );
}
