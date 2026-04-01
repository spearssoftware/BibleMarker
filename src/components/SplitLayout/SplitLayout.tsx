import { useRef, useState, useEffect, type ReactNode } from 'react';
import { usePanelStore } from '@/stores/panelStore';
import { SplitDivider } from './SplitDivider';

interface SplitLayoutProps {
  children: ReactNode;
  panel: ReactNode | null;
}

export function SplitLayout({ children, panel }: SplitLayoutProps) {
  const { activePanel, isCollapsed, splitRatio, orientation, isDragging } = usePanelStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState(0);

  const showPanel = activePanel && !isCollapsed && panel;
  const isHorizontal = orientation === 'horizontal';

  // Measure container with ResizeObserver to compute pixel widths.
  // Flex-based widths don't trigger WebKit inline reflow — pixel widths do.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setContainerSize(isHorizontal ? rect.width : rect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isHorizontal]);

  // Compute pixel sizes for the divider gap
  const dividerSize = 16; // 4px bar + 6px padding each side
  const availableSize = containerSize - (showPanel ? dividerSize : 0);
  const scriptureSize = showPanel ? Math.round(availableSize * splitRatio) : availableSize;
  const panelSize = showPanel ? availableSize - scriptureSize : 0;

  const scriptureSizeStyle = containerSize > 0 && showPanel
    ? isHorizontal ? { width: scriptureSize } : { height: scriptureSize }
    : undefined;

  const panelSizeStyle = containerSize > 0
    ? isHorizontal ? { width: panelSize } : { height: panelSize }
    : undefined;

  return (
    <div
      ref={containerRef}
      className={`flex-1 min-h-0 flex ${isHorizontal ? 'flex-row' : 'flex-col'}`}
    >
      {/* Scripture pane — no absolute positioning so WebKit propagates width changes as content reflow */}
      <div
        className="min-h-0 min-w-0 shrink-0 overflow-hidden flex flex-col pl-safe-left pr-safe-right"
        style={{
          ...scriptureSizeStyle,
          flex: scriptureSizeStyle ? undefined : '1 0 0%',
          paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
        }}
        role="main"
        aria-label="Bible reading area"
      >
        {children}
      </div>

      {showPanel && (
        <>
          <SplitDivider containerRef={containerRef} />

          {/* Panel pane */}
          <div
            className="min-h-0 min-w-0 shrink-0 overflow-hidden flex flex-col"
            style={{
              ...panelSizeStyle,
              transition: isDragging ? undefined : isHorizontal ? 'width 300ms ease-out' : 'height 300ms ease-out',
              paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
            }}
          >
            {panel}
          </div>
        </>
      )}
    </div>
  );
}
