/**
 * Discovery Store
 *
 * Transient UI state for the Discover layer's chips + Connector Lens. Plain
 * Zustand, not persisted — a fresh reader should never boot up with the lens
 * left on or a stale "found" confirmation from a previous chapter.
 */

import { create } from 'zustand';
import type { ConnectorHit } from '@/lib/chapterAnalysis';

export interface DiscoveryFound {
  book: string;
  chapter: number;
  translationId: string;
}

interface DiscoveryState {
  /** Whether the Connector Lens dimming pass is active. */
  lensActive: boolean;
  /** Set once the reader's own selection confirms the Repetition Radar word. */
  found: DiscoveryFound | null;
  /** The connector hit whose micro-prompt popover is currently open, if any. */
  activePrompt: ConnectorHit | null;

  setLensActive: (active: boolean) => void;
  toggleLens: () => void;
  setFound: (found: DiscoveryFound | null) => void;
  setActivePrompt: (hit: ConnectorHit | null) => void;
  /** Clears all Discover-layer UI state — called when the chapter changes. */
  resetForChapter: () => void;
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  lensActive: false,
  found: null,
  activePrompt: null,

  setLensActive: (active) => set({ lensActive: active }),
  toggleLens: () => set({ lensActive: !get().lensActive }),
  setFound: (found) => set({ found }),
  setActivePrompt: (hit) => set({ activePrompt: hit }),
  resetForChapter: () => set({ lensActive: false, found: null, activePrompt: null }),
}));
