import { useRef, type ReactNode } from 'react';
import { usePanelStore } from '@/stores/panelStore';
import { SplitDivider } from './SplitDivider';

interface SplitLayoutProps {
  children: ReactNode;
  panel: ReactNode | null;
}

export function SplitLayout({ children, panel }: SplitLayoutProps) {
  const { activePanel, isCollapsed, splitRatio, orientation, isDragging } = usePanelStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const showPanel = activePanel && !isCollapsed && panel;
  const isHorizontal = orientation === 'horizontal';
  const pct = Math.round(splitRatio * 100);

  // Use CSS Grid for explicit size assignment — flex can cause WebKit
  // to skip text reflow when the container width changes.
  const gridTemplate = showPanel
    ? isHorizontal
      ? { gridTemplateColumns: `${pct}fr auto ${100 - pct}fr` }
      : { gridTemplateRows: `${pct}fr auto ${100 - pct}fr` }
    : isHorizontal
      ? { gridTemplateColumns: '1fr' }
      : { gridTemplateRows: '1fr' };

  const panelTransition = isDragging
    ? undefined
    : isHorizontal
      ? 'grid-template-columns 300ms ease-out'
      : 'grid-template-rows 300ms ease-out';

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 grid"
      style={{ ...gridTemplate, transition: panelTransition }}
    >
      {/* Scripture pane */}
      <div
        className="min-h-0 min-w-0 overflow-hidden flex flex-col pl-safe-left pr-safe-right"
        style={{ paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}
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
            className="min-h-0 min-w-0 overflow-hidden flex flex-col"
            style={{ paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}
          >
            {panel}
          </div>
        </>
      )}
    </div>
  );
}
