/**
 * Undo Toast Component
 *
 * Brief toast notification with an undo action. Auto-dismisses after a timeout.
 */

import { useEffect, useRef } from 'react';
import { Button } from './Button';

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number;
}

export function UndoToast({ message, onUndo, onDismiss, duration = 5000 }: UndoToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, duration);
    return () => clearTimeout(timerRef.current);
  }, [onDismiss, duration]);

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200"
         style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-scripture-elevated border border-scripture-border shadow-lg">
        <span className="text-sm text-scripture-text">{message}</span>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            clearTimeout(timerRef.current);
            onUndo();
          }}
        >
          Undo
        </Button>
      </div>
    </div>
  );
}
