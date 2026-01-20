/**
 * Annotation Legend Component
 * 
 * Displays a legend of all annotated words/phrases in the current chapter,
 * showing which highlights, colors, underlines, and symbols were used for each word.
 * This helps maintain consistency during Precept-style Bible study.
 */

import { useMemo } from 'react';
import type { Annotation, TextAnnotation, SymbolAnnotation } from '@/types/annotation';
import { HIGHLIGHT_COLORS, SYMBOLS } from '@/types/annotation';

interface AnnotationLegendProps {
  annotations: Annotation[];
}

interface WordEntry {
  text: string;
  highlights: { color: string }[];
  textColors: { color: string }[];
  underlines: { color: string; style?: string }[];
  symbols: { symbol: string; color?: string }[];
}

export function AnnotationLegend({ annotations }: AnnotationLegendProps) {
  // Group annotations by word/phrase (normalized to lowercase for comparison)
  const wordEntries = useMemo(() => {
    const wordMap = new Map<string, WordEntry>();

    for (const ann of annotations) {
      // Only process annotations with selectedText
      if (ann.type === 'symbol') {
        const symAnn = ann as SymbolAnnotation;
        if (symAnn.selectedText && symAnn.position === 'center') {
          const normalizedText = symAnn.selectedText.trim().toLowerCase();
          if (!wordMap.has(normalizedText)) {
            wordMap.set(normalizedText, {
              text: symAnn.selectedText.trim(), // Keep original casing for display
              highlights: [],
              textColors: [],
              underlines: [],
              symbols: [],
            });
          }
          const entry = wordMap.get(normalizedText)!;
          entry.symbols.push({
            symbol: SYMBOLS[symAnn.symbol],
            color: symAnn.color,
          });
        }
      } else {
        const textAnn = ann as TextAnnotation;
        if (textAnn.selectedText) {
          const normalizedText = textAnn.selectedText.trim().toLowerCase();
          if (!wordMap.has(normalizedText)) {
            wordMap.set(normalizedText, {
              text: textAnn.selectedText.trim(), // Keep original casing for display
              highlights: [],
              textColors: [],
              underlines: [],
              symbols: [],
            });
          }
          const entry = wordMap.get(normalizedText)!;
          
          if (textAnn.type === 'highlight') {
            entry.highlights.push({ color: textAnn.color });
          } else if (textAnn.type === 'textColor') {
            entry.textColors.push({ color: textAnn.color });
          } else if (textAnn.type === 'underline') {
            entry.underlines.push({
              color: textAnn.color,
              style: textAnn.underlineStyle,
            });
          }
        }
      }
    }

    // Convert map to array and sort alphabetically
    return Array.from(wordMap.values()).sort((a, b) =>
      a.text.localeCompare(b.text)
    );
  }, [annotations]);

  if (wordEntries.length === 0) {
    return (
      <div className="annotation-legend">
        <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
          <h3 className="text-sm font-ui font-semibold mb-2 text-scripture-text">
            Annotation Legend
          </h3>
          <p className="text-xs text-scripture-muted">
            No annotations yet. Select text and add highlights, colors, underlines, or symbols to see them here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="annotation-legend space-y-4">
      <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-3">
        <h3 className="text-sm font-ui font-semibold mb-3 text-scripture-text">
          Annotation Legend ({wordEntries.length} {wordEntries.length === 1 ? 'word' : 'words'})
        </h3>
        <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
          {wordEntries.map((entry, index) => (
            <div
              key={index}
              className="bg-scripture-surface/50 border border-scripture-border/50 rounded-lg p-3 word-entry"
            >
            {/* Word/Phrase */}
            <div className="font-medium text-scripture-text mb-1.5">
              "{entry.text}"
            </div>
            
            {/* Annotations */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Highlights */}
              {entry.highlights.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-scripture-muted">Highlight:</span>
                  {entry.highlights.map((hl, i) => (
                    <span
                      key={i}
                      className="inline-block w-4 h-4 rounded border border-scripture-border/30"
                      style={{ backgroundColor: HIGHLIGHT_COLORS[hl.color as keyof typeof HIGHLIGHT_COLORS] + '40' }}
                      title={hl.color}
                    />
                  ))}
                </div>
              )}
              
              {/* Text Colors */}
              {entry.textColors.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-scripture-muted">Color:</span>
                  {entry.textColors.map((tc, i) => (
                    <span
                      key={i}
                      className="inline-block w-4 h-4 rounded border border-scripture-border/30"
                      style={{ backgroundColor: HIGHLIGHT_COLORS[tc.color as keyof typeof HIGHLIGHT_COLORS] }}
                      title={tc.color}
                    />
                  ))}
                </div>
              )}
              
              {/* Underlines */}
              {entry.underlines.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-scripture-muted">Underline:</span>
                  {entry.underlines.map((ul, i) => (
                    <span
                      key={i}
                      className="inline-block border-b-2"
                      style={{
                        borderBottomColor: HIGHLIGHT_COLORS[ul.color as keyof typeof HIGHLIGHT_COLORS],
                        borderBottomStyle: (ul.style || 'solid') as any,
                      }}
                      title={ul.color}
                    >
                      {entry.text.substring(0, 8)}
                    </span>
                  ))}
                </div>
              )}
              
              {/* Symbols */}
              {entry.symbols.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-scripture-muted">Symbol:</span>
                  {entry.symbols.map((sym, i) => (
                    <span
                      key={i}
                      className="text-base"
                      style={{
                        color: sym.color ? HIGHLIGHT_COLORS[sym.color as keyof typeof HIGHLIGHT_COLORS] : undefined,
                        opacity: 0.6,
                      }}
                      title={sym.color || 'No color'}
                    >
                      {sym.symbol}
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            {/* Show warning if same word has inconsistent annotations */}
            {(entry.highlights.length > 1 || entry.textColors.length > 1 || entry.underlines.length > 1 || entry.symbols.length > 1) && (
              <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                ⚠️ Multiple annotations - check consistency
              </div>
            )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}