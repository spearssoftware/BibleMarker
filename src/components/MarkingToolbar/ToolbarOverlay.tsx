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
import { Z_INDEX } from '@/lib/modalConstants';

interface ToolbarOverlayProps {
  children: ReactNode;
}

export function ToolbarOverlay({ children }: ToolbarOverlayProps) {
  return (
    <div 
      className="animate-slide-up flex flex-col max-h-[50vh] w-full overflow-hidden flex-shrink-0"
      data-marking-toolbar-overlay
      style={{ zIndex: Z_INDEX.TOOLBAR_OVERLAY }}
      onWheel={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-scripture-surface/65 backdrop-blur-sm shadow-lg flex-1 min-h-0 flex flex-col overflow-hidden mx-4 my-2 rounded-xl">
        {children}
      </div>
    </div>
  );
}
