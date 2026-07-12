/**
 * Toast + ToastHost
 *
 * Renders the stack of toasts from useToastStore. Mount <ToastHost /> once at
 * the app root (next to GlobalUndoToast). Each toast auto-dismisses; errors
 * stay a little longer and can be dismissed manually.
 */

import { useEffect, useRef } from 'react';
import { useToastStore, type Toast as ToastData } from '@/stores/toastStore';

const VARIANT_ACCENT: Record<ToastData['variant'], string> = {
  error: 'border-l-scripture-error',
  success: 'border-l-scripture-success',
  info: 'border-l-scripture-info',
};

const DEFAULT_DURATION: Record<ToastData['variant'], number> = {
  error: 6000,
  success: 3500,
  info: 4000,
};

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, DEFAULT_DURATION[toast.variant]);
    return () => clearTimeout(timerRef.current);
  }, [onDismiss, toast.variant]);

  return (
    <div
      role="status"
      aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border border-scripture-border border-l-4 ${VARIANT_ACCENT[toast.variant]} bg-scripture-elevated shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200`}
    >
      <span className="text-sm text-scripture-text">{toast.message}</span>
      <button
        onClick={onDismiss}
        className="p-1 -mr-1 text-scripture-muted hover:text-scripture-text"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastHost() {
  const { toasts, dismiss } = useToastStore();
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 w-[min(92vw,28rem)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
