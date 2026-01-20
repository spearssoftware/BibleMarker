/**
 * Unified Toolbar Overlay Wrapper
 * 
 * Provides consistent structure for all toolbar overlays:
 * - Max 50% screen height
 * - Scrollable content
 * - Prevents background scrolling
 * - Consistent styling
 */

import { ReactNode } from 'react';

interface ToolbarOverlayProps {
  children: ReactNode;
}

export function ToolbarOverlay({ children }: ToolbarOverlayProps) {
  return (
    <div 
      className="bg-scripture-surface/90 backdrop-blur-sm animate-slide-up shadow-lg 
                 flex flex-col max-h-[50vh] overflow-hidden flex-shrink-0"
      data-marking-toolbar-overlay
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="bg-scripture-surface flex-1 min-h-0 flex flex-col overflow-hidden mx-2 my-2 rounded-xl">
        {children}
      </div>
    </div>
  );
}
