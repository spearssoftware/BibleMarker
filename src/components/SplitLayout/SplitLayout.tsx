import { useRef, type ReactNode } from 'react';
import { usePanelStore } from '@/stores/panelStore';
import { SplitDivider } from './SplitDivider';

interface SplitLayoutProps {
  children: ReactNode;
  panel: ReactNode | null;
}

export function SplitLayout({ children, panel }: SplitLayoutProps) {
  const { activePanel, isCollapsed, splitRatio, orientation } = usePanelStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const showPanel = activePanel && !isCollapsed && panel;
  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      ref={containerRef}
      className={`flex-1 min-h-0 flex ${isHorizontal ? 'flex-row' : 'flex-col'}`}
    >
      <div
        className="min-h-0 min-w-0 overflow-hidden pl-safe-left pr-safe-right"
        style={{
          flex: showPanel ? `${splitRatio} 0 0%` : '1 0 0%',
          transition: 'flex 300ms ease-out',
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
          <div
            className="min-h-0 min-w-0 overflow-hidden"
            style={{
              flex: `${1 - splitRatio} 0 0%`,
              transition: 'flex 300ms ease-out',
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
