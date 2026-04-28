import { useRef, useEffect, useCallback } from 'react';
import { usePanelStore } from '@/stores/panelStore';

const MIN_RATIO = 0.05;
const MAX_RATIO = 0.95;
const TAP_THRESHOLD_PX = 5;
const TAP_TIMEOUT_MS = 300;

interface SplitDividerProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function SplitDivider({ containerRef }: SplitDividerProps) {
  const { orientation, splitRatio, setSplitRatio, setDragging, isDragging } = usePanelStore();
  const prevRatioRef = useRef<number | null>(null);
  const isHorizontal = orientation === 'horizontal';

  // Guard body user-select with lifecycle cleanup (safe if component unmounts mid-drag)
  useEffect(() => {
    if (!isDragging) return;
    document.body.style.userSelect = 'none';
    return () => { document.body.style.userSelect = ''; };
  }, [isDragging]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const containerSize = isHorizontal ? rect.width : rect.height;
    if (containerSize === 0) return;

    const startPos = isHorizontal ? e.clientX : e.clientY;
    const startTime = Date.now();
    const startRatio = splitRatio;
    let movedEnough = false;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
      const delta = currentPos - startPos;
      if (!movedEnough) {
        if (Math.abs(delta) <= TAP_THRESHOLD_PX) return;
        movedEnough = true;
        setDragging(true);
      }
      const newRatio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, startRatio + delta / containerSize));
      setSplitRatio(newRatio);
    };

    const cleanup = () => {
      setDragging(false);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', cleanup);
    };

    const onPointerUp = () => {
      const elapsed = Date.now() - startTime;
      if (!movedEnough && elapsed < TAP_TIMEOUT_MS) {
        // Tap: toggle 50% ↔ previous ratio
        if (Math.abs(splitRatio - 0.5) < 0.001) {
          if (prevRatioRef.current !== null) {
            setSplitRatio(prevRatioRef.current);
          }
        } else {
          prevRatioRef.current = splitRatio;
          setSplitRatio(0.5);
        }
      }
      cleanup();
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', cleanup);
  }, [isHorizontal, splitRatio, setSplitRatio, setDragging, containerRef]);

  if (isHorizontal) {
    return (
      <div
        className={`relative flex items-center justify-center shrink-0 cursor-col-resize transition-colors ${
          isDragging ? 'bg-scripture-accent' : 'bg-scripture-border/30 hover:bg-scripture-border/60'
        }`}
        style={{ width: '4px', touchAction: 'none', padding: '0 6px', boxSizing: 'content-box' }}
        onPointerDown={handlePointerDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
      >
        <div
          className={`w-1 h-8 rounded-full transition-colors ${
            isDragging ? 'bg-scripture-accent' : 'bg-scripture-muted/50'
          }`}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 cursor-row-resize transition-colors ${
        isDragging ? 'bg-scripture-accent' : 'bg-scripture-border/30 hover:bg-scripture-border/60'
      }`}
      style={{ height: '4px', touchAction: 'none', padding: '6px 0', boxSizing: 'content-box' }}
      onPointerDown={handlePointerDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize panels"
    >
      <div
        className={`h-1 w-8 rounded-full transition-colors ${
          isDragging ? 'bg-scripture-accent' : 'bg-scripture-muted/50'
        }`}
      />
    </div>
  );
}
