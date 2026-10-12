/**
 * DiscoveryCard — shared chrome for a Discover-panel card.
 */

import type { ReactNode } from 'react';

interface DiscoveryCardProps {
  title: string;
  /** Scroll-anchor id for Look-Again rows. */
  id?: string;
  children: ReactNode;
}

export function DiscoveryCard({ title, id, children }: DiscoveryCardProps) {
  return (
    <div id={id} className="bg-scripture-surface border border-scripture-border rounded-lg p-3 space-y-2 scroll-mt-4">
      <h3 className="text-sm font-ui font-semibold text-scripture-text">{title}</h3>
      {children}
    </div>
  );
}
