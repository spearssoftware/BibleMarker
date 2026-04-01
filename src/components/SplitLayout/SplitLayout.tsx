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

  return (
    <div
      ref={containerRef}
      className={`flex-1 min-h-0 flex ${isHorizontal ? 'flex-row' : 'flex-col'}`}
    >
      {/* Scripture pane — NO overflow:hidden (breaks WebKit inline-grid reflow) */}
      <div
        className="min-h-0 min-w-0 flex flex-col pl-safe-left pr-safe-right"
        style={{
          flex: showPanel ? `${splitRatio} 0 0%` : '1 0 0%',
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

          {/* Panel pane — absolute positioning works fine here */}
          <div
            className="relative min-h-0 min-w-0"
            style={{
              flex: `${1 - splitRatio} 0 0%`,
              transition: isDragging ? undefined : 'flex 300ms ease-out',
            }}
          >
            <div
              className="absolute inset-0 overflow-hidden flex flex-col"
              style={{ paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}
            >
              {panel}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
