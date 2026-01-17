/**
 * Key Word Legend Component
 * 
 * Shows a compact legend of all defined key words for quick reference.
 */

import { useKeyWordStore } from '@/stores/keyWordStore';
import { KEY_WORD_CATEGORIES } from '@/types/keyWord';
import { SYMBOLS, HIGHLIGHT_COLORS } from '@/types/annotation';

export function KeyWordLegend() {
  const { keyWords, getFilteredKeyWords } = useKeyWordStore();
  const filtered = getFilteredKeyWords();

  if (filtered.length === 0) {
    return (
      <div className="text-center py-4 text-scripture-muted text-sm">
        No key words defined yet
      </div>
    );
  }

  // Group by category
  const byCategory = filtered.reduce((acc, kw) => {
    const cat = kw.category || 'custom';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(kw);
    return acc;
  }, {} as Record<string, typeof filtered>);

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
              {words.map((kw) => {
                const symbol = kw.symbol ? SYMBOLS[kw.symbol] : undefined;
                const color = kw.color ? HIGHLIGHT_COLORS[kw.color] : undefined;
                return (
                  <div
                    key={kw.id}
                    className="flex items-center gap-2 p-2 rounded bg-scripture-elevated border border-scripture-border/30"
                  >
                    {symbol && (
                      <span
                        className="text-base"
                        style={{ color: color }}
                      >
                        {symbol}
                      </span>
                    )}
                    <span className="text-sm text-scripture-text flex-1 truncate">
                      {kw.word}
                    </span>
                    {kw.usageCount > 0 && (
                      <span className="text-xs text-scripture-muted">
                        {kw.usageCount}
                      </span>
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
