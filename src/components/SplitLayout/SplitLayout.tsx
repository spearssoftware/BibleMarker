import { useRef, useState, useEffect, type ReactNode } from 'react';
import { usePanelStore } from '@/stores/panelStore';
import { SplitDivider } from './SplitDivider';

const TOOLBAR_FALLBACK_PX = 60;

interface SplitLayoutProps {
  children: ReactNode;
  panel: ReactNode | null;
}

export function SplitLayout({ children, panel }: SplitLayoutProps) {
  const { activePanel, isCollapsed, splitRatio, orientation, isDragging } = usePanelStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState(0);
  const [toolbarHeight, setToolbarHeight] = useState(TOOLBAR_FALLBACK_PX);

  const showPanel = activePanel && !isCollapsed && panel;
  const isHorizontal = orientation === 'horizontal';

  // Measure container — reads orientation from store directly so the observer is stable
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        const horizontal = usePanelStore.getState().orientation === 'horizontal';
        setContainerSize(horizontal ? rect.width : rect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Measure the fixed bottom toolbar so we can reserve space for it. The
  // toolbar uses position:fixed and overlays this layout; without reserving
  // its height the divider can be dragged behind it and become unreachable.
  useEffect(() => {
    const toolbar = document.querySelector<HTMLElement>('[data-marking-toolbar]');
    if (!toolbar) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setToolbarHeight(Math.max(rect.height, TOOLBAR_FALLBACK_PX));
    });
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);

  const dividerSize = 16;
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
      className="flex-1 min-h-0 flex flex-col"
      style={{ paddingBottom: toolbarHeight }}
    >
      <div
        ref={containerRef}
        className={`flex-1 min-h-0 flex ${isHorizontal ? 'flex-row' : 'flex-col'}`}
      >
        <div
          className="relative min-h-0 min-w-0 shrink-0"
          style={{
            ...scriptureSizeStyle,
            flex: scriptureSizeStyle ? undefined : '1 0 0%',
          }}
        >
          <div
            className="absolute inset-0 overflow-hidden flex flex-col pl-safe-left pr-safe-right"
            role="main"
            aria-label="Bible reading area"
          >
            {children}
          </div>
        </div>

        {showPanel && (
          <>
            <SplitDivider containerRef={containerRef} />

            <div
              className="relative min-h-0 min-w-0 shrink-0"
              style={{
                ...panelSizeStyle,
                transition: isDragging ? undefined : isHorizontal ? 'width 300ms ease-out' : 'height 300ms ease-out',
              }}
            >
              <div className="absolute inset-0 overflow-hidden flex flex-col pr-safe-right">
                {panel}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
