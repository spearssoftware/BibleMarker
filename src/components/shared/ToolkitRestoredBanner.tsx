/**
 * Toolkit Restored Banner
 *
 * One-shot notice shown after `maybeEnableInductiveTools` auto-enables the
 * Precept toolkit for an existing user whose data (marks, keywords, notes)
 * predates the discovery-first default. Mirrors the plain banner look used
 * by `UpdateBanner`'s web/Capacitor variant.
 */

interface ToolkitRestoredBannerProps {
  onDismiss: () => void;
}

export function ToolkitRestoredBanner({ onDismiss }: ToolkitRestoredBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 px-4 py-2 bg-scripture-accent/15 text-scripture-text border-b border-scripture-accent/30"
    >
      <span className="text-sm">
        Your study tools are right where you left them. New readers start with a simpler view —
        switch anytime in Settings → Bible → Inductive study tools.
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
