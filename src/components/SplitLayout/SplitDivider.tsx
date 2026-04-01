import { useRef, useState, useCallback } from 'react';
import { usePanelStore } from '@/stores/panelStore';

interface SplitDividerProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function SplitDivider({ containerRef }: SplitDividerProps) {
  const { orientation, splitRatio, setSplitRatio } = usePanelStore();
  const [isDragging, setIsDragging] = useState(false);
  const prevRatioRef = useRef<number | null>(null);
  const isHorizontal = orientation === 'horizontal';

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startPos = isHorizontal ? e.clientX : e.clientY;
    const startRatio = splitRatio;

    setIsDragging(true);
    document.body.style.userSelect = 'none';

    const onPointerMove = (moveEvent: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const containerSize = isHorizontal ? rect.width : rect.height;
      if (containerSize === 0) return;

      const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
      const delta = currentPos - startPos;
      const deltaRatio = delta / containerSize;
      const newRatio = Math.min(0.75, Math.max(0.25, startRatio + deltaRatio));
      setSplitRatio(newRatio);
    };

    const onPointerUp = () => {
      setIsDragging(false);
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }, [isHorizontal, splitRatio, setSplitRatio, containerRef]);

  const handleDoubleClick = useCallback(() => {
    if (prevRatioRef.current !== null) {
      const restored = prevRatioRef.current;
      prevRatioRef.current = splitRatio;
      setSplitRatio(restored);
    } else {
      prevRatioRef.current = splitRatio;
      setSplitRatio(0.5);
    }
  }, [splitRatio, setSplitRatio]);

  if (isHorizontal) {
    return (
      <div
        className={`relative flex items-center justify-center shrink-0 cursor-col-resize transition-colors ${
          isDragging ? 'bg-scripture-accent' : 'bg-scripture-border/30 hover:bg-scripture-border/60'
        }`}
        style={{ width: '4px', touchAction: 'none', padding: '0 6px', boxSizing: 'content-box' }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
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
      onDoubleClick={handleDoubleClick}
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
