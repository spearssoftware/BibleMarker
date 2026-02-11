/**
 * Key Word Legend Component
 * 
 * Shows a compact legend of all defined key words for quick reference.
 */

import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useStudyStore } from '@/stores/studyStore';
import { KEY_WORD_CATEGORIES, type MarkingPreset } from '@/types/keyWord';
import { SYMBOLS, getHighlightColorHex } from '@/types/annotation';
import { filterPresetsByStudy } from '@/lib/studyFilter';

export function KeyWordLegend() {
  const { getFilteredPresets } = useMarkingPresetStore();
  const { activeStudyId } = useStudyStore();
  const filtered = filterPresetsByStudy(getFilteredPresets(), activeStudyId).filter((p) => p.word);

  if (filtered.length === 0) {
    return (
      <div className="text-center py-4 text-scripture-muted text-sm">
        No key words defined yet
      </div>
    );
  }

  const byCategory = filtered.reduce((acc, p) => {
    const cat = p.category || 'custom';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {} as Record<string, MarkingPreset[]>);

  return (
    <div className="space-y-4">
      {Object.entries(byCategory).map(([category, words]) => {
        const catInfo = KEY_WORD_CATEGORIES[category as keyof typeof KEY_WORD_CATEGORIES] || KEY_WORD_CATEGORIES.custom;
        return (
          <div key={category}>
            <h4 className="text-xs font-ui font-semibold text-scripture-text uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>{catInfo.icon}</span>
              <span>{catInfo.label}</span>
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {words.map((p) => {
                const symbol = p.symbol ? SYMBOLS[p.symbol] : undefined;
                const color = p.highlight?.color ? getHighlightColorHex(p.highlight.color) : undefined;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 p-2 rounded bg-scripture-elevated border border-scripture-border/30"
                  >
                    {symbol && (
                      <span className="text-base" style={{ color }}>
                        {symbol}
                      </span>
                    )}
                    <span className="text-sm text-scripture-text flex-1 truncate">
                      {p.word}
                    </span>
                    {p.usageCount > 0 && (
                      <span className="text-xs text-scripture-muted">{p.usageCount}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
