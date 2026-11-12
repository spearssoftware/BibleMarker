/**
 * Modes Banner
 *
 * One-shot notice shown after `seedAppMode` assigns a mode to an existing
 * user on the first launch with three modes. Mirrors the plain banner look
 * used by `UpdateBanner`'s web/Capacitor variant.
 */

import { MODE_LABELS, useEffectiveMode } from '@/lib/appMode';

interface ModesBannerProps {
  onDismiss: () => void;
}

export function ModesBanner({ onDismiss }: ModesBannerProps) {
  const label = MODE_LABELS[useEffectiveMode()];

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 px-4 py-2 bg-scripture-accent/15 text-scripture-text border-b border-scripture-accent/30"
    >
      <span className="text-sm">
        BibleMarker now has three modes. You're in {label}. Switch any time from the top bar.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-scripture-muted hover:text-scripture-text text-sm px-1 flex-shrink-0"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
