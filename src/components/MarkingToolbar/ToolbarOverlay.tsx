/**
 * Unified Toolbar Overlay Wrapper
 * 
 * Provides consistent structure for all toolbar overlays:
 * - Resizable height with drag handle (double-click to toggle max/default)
 * - Scrollable content
 * - Prevents background scrolling
 * - Consistent styling
 */

import { ReactNode, useState, useRef, useCallback, useEffect, useSyncExternalStore } from 'react';
import { Z_INDEX } from '@/lib/modalConstants';

interface ToolbarOverlayProps {
  children: ReactNode;
}

const MIN_HEIGHT_VH = 20; // Minimum 20% of viewport
const MAX_HEIGHT_VH = 85; // Maximum 85% of viewport (leaves room for navbar ~60px + safe area)
const DEFAULT_HEIGHT_VH = 50; // Default 50% of viewport
const STORAGE_KEY = 'toolbarOverlayHeight';
const PREV_HEIGHT_KEY = 'toolbarOverlayPrevHeight';

// Navbar height estimate (py-2.5 = 20px padding + content ~24px + safe-top varies)
const NAVBAR_HEIGHT_PX = 60;

// Shared height state across all overlay instances
let sharedHeightVh = (() => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = parseFloat(stored);
    if (!isNaN(parsed) && parsed >= MIN_HEIGHT_VH && parsed <= MAX_HEIGHT_VH) {
      return parsed;
    }
  }
  return DEFAULT_HEIGHT_VH;
})();

const heightListeners = new Set<() => void>();

function subscribeToHeight(callback: () => void) {
  heightListeners.add(callback);
  return () => heightListeners.delete(callback);
}

function getHeightSnapshot() {
  return sharedHeightVh;
}

// For SSR compatibility
function getServerSnapshot() {
  return DEFAULT_HEIGHT_VH;
}

function setSharedHeight(newHeight: number) {
  sharedHeightVh = newHeight;
  localStorage.setItem(STORAGE_KEY, newHeight.toString());
  heightListeners.forEach(listener => listener());
}

// Export for debugging/testing
export function resetOverlayHeight() {
  setSharedHeight(DEFAULT_HEIGHT_VH);
}

export function ToolbarOverlay({ children }: ToolbarOverlayProps) {
  // Use shared height state so all overlays respond together
  const heightVh = useSyncExternalStore(subscribeToHeight, getHeightSnapshot, getServerSnapshot);
  
  // Sync from localStorage on mount in case module state is stale
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed >= MIN_HEIGHT_VH && parsed <= MAX_HEIGHT_VH && parsed !== sharedHeightVh) {
        sharedHeightVh = parsed;
        heightListeners.forEach(listener => listener());
      }
    }
  }, []);
  
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef<number>(0);
  const dragStartHeight = useRef<number>(0);
  const lastClickTime = useRef<number>(0);
  
  // Double-click to toggle between max and previous/default height
  const handleDoubleClick = useCallback(() => {
    const isAtMax = heightVh >= MAX_HEIGHT_VH - 5; // Within 5vh of max
    
    if (isAtMax) {
      // Restore previous height or default
      const prevStored = localStorage.getItem(PREV_HEIGHT_KEY);
      const prevHeight = prevStored ? parseFloat(prevStored) : DEFAULT_HEIGHT_VH;
      setSharedHeight(Math.max(MIN_HEIGHT_VH, Math.min(MAX_HEIGHT_VH, prevHeight)));
    } else {
      // Save current height and go to max
      localStorage.setItem(PREV_HEIGHT_KEY, heightVh.toString());
      setSharedHeight(MAX_HEIGHT_VH);
    }
  }, [heightVh]);
  
  const handleDragStart = useCallback((clientY: number) => {
    // Check for double-click/double-tap (within 300ms)
    const now = Date.now();
    if (now - lastClickTime.current < 300) {
      handleDoubleClick();
      lastClickTime.current = 0;
      return;
    }
    lastClickTime.current = now;
    
    setIsDragging(true);
    dragStartY.current = clientY;
    dragStartHeight.current = heightVh;
  }, [heightVh, handleDoubleClick]);
  
  const handleDragMove = useCallback((clientY: number) => {
    if (!isDragging) return;
    
    const viewportHeight = window.innerHeight;
    // Dragging up (negative delta) should increase height
    const deltaY = dragStartY.current - clientY;
    const deltaVh = (deltaY / viewportHeight) * 100;
    const newHeight = Math.min(MAX_HEIGHT_VH, Math.max(MIN_HEIGHT_VH, dragStartHeight.current + deltaVh));
    
    setSharedHeight(newHeight);
  }, [isDragging]);
  
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);
  
  // Mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleDragStart(e.clientY);
  }, [handleDragStart]);
  
  // Touch events
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    handleDragStart(e.touches[0].clientY);
  }, [handleDragStart]);
  
  // Global event listeners for drag
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      handleDragMove(e.clientY);
    };
    const handleTouchMove = (e: TouchEvent) => {
      handleDragMove(e.touches[0].clientY);
    };
    const handleEnd = () => handleDragEnd();
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleEnd);
    
    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleDragMove, handleDragEnd]);
  
  // Calculate max height: use vh but cap to leave room for navbar
  const maxHeightStyle = `min(${heightVh}vh, calc(100vh - ${NAVBAR_HEIGHT_PX}px - env(safe-area-inset-top) - 80px))`;
  
  return (
    <div 
      className="animate-slide-up flex flex-col w-full max-w-5xl mx-auto overflow-hidden flex-shrink-0
                 pl-safe-left pr-safe-right"
      data-marking-toolbar-overlay
      style={{ zIndex: Z_INDEX.TOOLBAR_OVERLAY, height: maxHeightStyle, maxHeight: maxHeightStyle }}
      onWheel={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-scripture-surface/65 backdrop-blur-md shadow-lg flex-1 min-h-0 flex flex-col overflow-hidden mx-4 my-2 rounded-xl">
        {/* Resize handle - integrated at top of overlay, z-20 to stay above panel content */}
        <div
          className={`flex-shrink-0 flex items-center justify-center py-3 cursor-ns-resize select-none transition-colors relative z-20
                     border-b border-scripture-border/20
                     ${isDragging ? 'bg-scripture-border/30' : 'hover:bg-scripture-border/15 active:bg-scripture-border/30'}`}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onPointerDown={(e) => {
            e.stopPropagation();
            handleDragStart(e.clientY);
          }}
          role="slider"
          aria-label="Resize overlay height. Double-click to toggle max height."
          aria-valuenow={Math.round(heightVh)}
          aria-valuemin={MIN_HEIGHT_VH}
          aria-valuemax={MAX_HEIGHT_VH}
          tabIndex={0}
          style={{ touchAction: 'none' }}
        >
          <div className={`w-12 h-1.5 rounded-full transition-colors ${isDragging ? 'bg-scripture-accent' : 'bg-scripture-muted/50'}`} />
        </div>
        {children}
      </div>
    </div>
  );
}
