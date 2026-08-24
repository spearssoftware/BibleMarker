/**
 * DiscoveryCard — shared chrome for a Discover-panel card.
 */

import type { ReactNode } from 'react';

interface DiscoveryCardProps {
  title: string;
  children: ReactNode;
}

export function DiscoveryCard({ title, children }: DiscoveryCardProps) {
  return (
    <div className="bg-scripture-surface border border-scripture-border rounded-lg p-3 space-y-2">
      <h3 className="text-sm font-ui font-semibold text-scripture-text">{title}</h3>
      {children}
    </div>
  );
}
