import { useEffect, useCallback } from 'react';
import { usePanelStore } from '@/stores/panelStore';

const MIN_RATIO = 0.05;
const MAX_RATIO = 0.95;
const TAP_THRESHOLD_PX = 5;
const TAP_TIMEOUT_MS = 300;
const SNAP_TOLERANCE = 0.01;

// Order matters: tap from a non-snap position goes to SNAP_CYCLE[0], then
// each subsequent tap advances. With [0.5, 0.25, 0.75], the sequence is
// even split → panel grows → panel shrinks → wraps back to even.
const SNAP_CYCLE = [0.5, 0.25, 0.75];

function nextSnap(current: number): number {
  const idx = SNAP_CYCLE.findIndex((p) => Math.abs(current - p) < SNAP_TOLERANCE);
  if (idx === -1) return SNAP_CYCLE[0];
  return SNAP_CYCLE[(idx + 1) % SNAP_CYCLE.length];
}

interface SplitDividerProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function SplitDivider({ containerRef }: SplitDividerProps) {
  const { orientation, setSplitRatio, setDragging, isDragging } = usePanelStore();
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
    const startRatio = usePanelStore.getState().splitRatio;
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
        setSplitRatio(nextSnap(usePanelStore.getState().splitRatio));
      }
      cleanup();
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', cleanup);
  }, [isHorizontal, setSplitRatio, setDragging, containerRef]);

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
