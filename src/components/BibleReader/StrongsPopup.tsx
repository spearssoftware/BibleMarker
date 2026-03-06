/**
 * Strong's Popup Component
 *
 * Displays Strong's dictionary entries for selected word(s).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { lookupStrongs, type StrongsEntry } from '@/lib/strongs';

interface StrongsPopupProps {
  strongsNumbers: string[];
  onClose: () => void;
  position: { x: number; y: number };
}

export function StrongsPopup({ strongsNumbers, onClose, position }: StrongsPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<{ number: string; entry: StrongsEntry }[]>([]);
  const [loading, setLoading] = useState(true);
  const [clampedPos, setClampedPos] = useState(position);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      strongsNumbers.map(async (num) => {
        const entry = await lookupStrongs(num);
        return entry ? { number: num, entry } : null;
      })
    ).then((results) => {
      if (cancelled) return;
      setEntries(results.filter((r): r is { number: string; entry: StrongsEntry } => r !== null));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [strongsNumbers]);

  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 10;

    // Horizontal: center on anchor, clamp to viewport
    let x = position.x - rect.width / 2;
    if (x + rect.width > window.innerWidth - pad) x = window.innerWidth - pad - rect.width;
    if (x < pad) x = pad;

    // Vertical: prefer above the anchor; fall back to below if no room above
    let y = position.y - rect.height - 8;
    if (y < pad) {
      y = position.y + 24;
    }
    // Final clamp
    if (y + rect.height > window.innerHeight - pad) y = window.innerHeight - pad - rect.height;
    if (y < pad) y = pad;

    requestAnimationFrame(() => setClampedPos({ x, y }));
  }, [position, loading, entries]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={popupRef}
        className="fixed z-50 bg-scripture-surface border border-scripture-border/50 rounded-xl shadow-2xl
                   p-4 min-w-[300px] max-w-[420px] max-h-[60vh] overflow-y-auto
                   animate-scale-in backdrop-blur-sm custom-scrollbar"
        style={{
          left: `${clampedPos.x}px`,
          top: `${clampedPos.y}px`,
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-ui font-semibold text-scripture-text uppercase tracking-wider">
            Strong&apos;s Lookup
          </h4>
          <button
            onClick={onClose}
            className="text-scripture-muted hover:text-scripture-text transition-colors p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-scripture-muted py-4 text-center">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-sm text-scripture-muted py-4 text-center">No definitions found.</div>
        ) : (
          <div className="space-y-4">
            {entries.map(({ number, entry }) => {
              const isHebrew = number.startsWith('H');
              return (
                <div key={number} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-scripture-accent/20 text-scripture-accent text-xs font-ui font-bold">
                      {number}
                    </span>
                    <span className={`text-lg ${isHebrew ? 'font-serif' : ''}`} dir={isHebrew ? 'rtl' : 'ltr'}>
                      {entry.lemma}
                    </span>
                  </div>
                  {entry.xlit && (
                    <div className="text-sm text-scripture-muted">
                      <span className="italic">{entry.xlit}</span>
                      {entry.pronounce && <span className="ml-2">({entry.pronounce})</span>}
                    </div>
                  )}
                  <p className="text-sm text-scripture-text leading-relaxed">
                    {entry.strongs_def}
                  </p>
                  {entry.kjv_def && (
                    <div className="text-xs text-scripture-muted border-t border-scripture-border/30 pt-1.5 mt-1.5">
                      <span className="font-semibold">Translated as: </span>{entry.kjv_def}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
