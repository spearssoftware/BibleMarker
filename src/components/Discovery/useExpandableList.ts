import { useState } from 'react';

const VISIBLE_LIMIT = 5;

/**
 * Shared state for the Setting event list and Who's here rows: one expanded
 * row at a time, 5 shown until "+N more". `onExpand` fires when a row opens
 * (not when it closes).
 */
export function useExpandableList<T extends { slug: string }>(items: T[], onExpand: () => void) {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [revealAll, setRevealAll] = useState(false);
  const shown = revealAll ? items : items.slice(0, VISIBLE_LIMIT);

  const toggle = (slug: string) => {
    if (expandedSlug === slug) {
      setExpandedSlug(null);
      return;
    }
    setExpandedSlug(slug);
    onExpand();
  };

  return { shown, hidden: items.length - shown.length, expandedSlug, toggle, showAll: () => setRevealAll(true) };
}
