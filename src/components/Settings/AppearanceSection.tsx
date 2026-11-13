/**
 * Appearance settings tab — symbol position/size/visibility, multi-word
 * marking, theme, and accessibility. Font size and scripture font live in the
 * reader's "Aa" panel. Theme and High Contrast changes go through the shared
 * handlers in `textSettings`.
 */

import { useAnnotationStore } from '@/stores/annotationStore';
import { updatePreferences } from '@/lib/database';
import {
  applySymbolOpacity,
  applySymbolSize,
  applySymbolPosition,
  SYMBOL_OPACITY_MIN,
  SYMBOL_OPACITY_MAX,
  SYMBOL_SIZE_MIN,
  SYMBOL_SIZE_MAX,
  type SymbolPosition,
  type Theme,
} from '@/lib/theme';
import { SegmentedControl, ToggleSwitch } from '@/components/shared';
import {
  THEME_OPTIONS,
  changeHighContrast,
  changeTheme,
} from '@/lib/textSettings';
import { useIsStudyMode } from '@/lib/appMode';
import { MARKING_STYLE_OPTIONS, type MarkingStyle } from '@/types';

export function AppearanceSection() {
  const isStudyMode = useIsStudyMode();
  const {
    theme,
    highContrast,
    symbolPosition,
    setSymbolPosition,
    symbolOpacity,
    setSymbolOpacity,
    symbolSize,
    setSymbolSize,
    defaultMultiWordMarking,
    setDefaultMultiWordMarking,
  } = useAnnotationStore();

  const handleSymbolOpacityChange = (next: number) => {
    setSymbolOpacity(next);
    applySymbolOpacity(next);
  };

  const handleSymbolOpacityCommit = async (next: number) => {
    try {
      await updatePreferences({ symbolOpacity: next });
    } catch (error) {
      console.error('Error updating symbol opacity:', error);
    }
  };

  const handleSymbolSizeChange = (next: number) => {
    setSymbolSize(next);
    applySymbolSize(next);
  };

  const handleSymbolSizeCommit = async (next: number) => {
    try {
      await updatePreferences({ symbolSize: next });
    } catch (error) {
      console.error('Error updating symbol size:', error);
    }
  };

  const handleDefaultMultiWordMarkingChange = async (next: MarkingStyle) => {
    setDefaultMultiWordMarking(next);
    try {
      await updatePreferences({ defaultMultiWordMarking: next });
    } catch (error) {
      console.error('Error updating default multi-word marking:', error);
    }
  };

  const handleSymbolPositionChange = async (next: SymbolPosition) => {
    setSymbolPosition(next);
    applySymbolPosition(next);
    try {
      await updatePreferences({ symbolPosition: next });
    } catch (error) {
      console.error('Error updating symbol position:', error);
    }
  };

  return (
    <div role="tabpanel" id="settings-tabpanel-appearance" aria-labelledby="settings-tab-appearance">
      <div className="space-y-0">
        {isStudyMode && (
          <>
          <div className="p-4">
            <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Symbol Position</h3>
            <SegmentedControl<SymbolPosition>
              columns={2}
              ariaLabel="Symbol position"
              value={symbolPosition}
              onChange={handleSymbolPositionChange}
              options={[
                { value: 'behind', label: 'Behind' },
                { value: 'above', label: 'Above' },
              ]}
            />
            <p className="text-xs text-scripture-muted mt-2">
              Render symbol marks as a watermark behind each annotated word, or floating above it. Above gives more legible marks but spreads verses out.
            </p>
          </div>

          <div className="border-t border-scripture-border/30 my-4"></div>

          <div className="p-4">
            <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Multi-Word Keyword Marking</h3>
            <SegmentedControl<MarkingStyle>
              columns={3}
              ariaLabel="Default marking for multi-word keywords"
              value={defaultMultiWordMarking}
              onChange={handleDefaultMultiWordMarkingChange}
              options={MARKING_STYLE_OPTIONS}
            />
            <p className="text-xs text-scripture-muted mt-2">
              The marking pre-selected when you create a keyword that spans more than one word, to tie the words together. You can still change it per keyword.
            </p>
          </div>

          <div className="border-t border-scripture-border/30 my-4"></div>

          <div className="p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-base font-ui font-semibold text-scripture-text">Symbol Visibility</h3>
              <span className="text-xs font-ui text-scripture-muted tabular-nums">
                {Math.round(symbolOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={SYMBOL_OPACITY_MIN}
              max={SYMBOL_OPACITY_MAX}
              step={0.05}
              value={symbolOpacity}
              onChange={(e) => handleSymbolOpacityChange(Number(e.target.value))}
              onPointerUp={(e) => handleSymbolOpacityCommit(Number((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => handleSymbolOpacityCommit(Number((e.target as HTMLInputElement).value))}
              disabled={highContrast}
              aria-label="Symbol mark opacity"
              className="w-full accent-scripture-accent disabled:opacity-50"
            />
            <p className="text-xs text-scripture-muted mt-2">
              {highContrast
                ? 'High Contrast Mode is on, so symbol marks are shown at full visibility.'
                : 'How visible symbol marks appear behind annotated words. Increase if the marks are hard to see.'}
            </p>
          </div>

          <div className="border-t border-scripture-border/30 my-4"></div>

          <div className="p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-base font-ui font-semibold text-scripture-text">Symbol Size</h3>
              <span className="text-xs font-ui text-scripture-muted tabular-nums">
                {symbolSize.toFixed(1)}×
              </span>
            </div>
            <input
              type="range"
              min={SYMBOL_SIZE_MIN}
              max={SYMBOL_SIZE_MAX}
              step={0.1}
              value={symbolSize}
              onChange={(e) => handleSymbolSizeChange(Number(e.target.value))}
              onPointerUp={(e) => handleSymbolSizeCommit(Number((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => handleSymbolSizeCommit(Number((e.target as HTMLInputElement).value))}
              aria-label="Symbol mark size"
              className="w-full accent-scripture-accent"
            />
            <p className="text-xs text-scripture-muted mt-2">
              How large symbol marks appear relative to the word. Increase so more of the mark shows around short words.
            </p>
          </div>

          <div className="border-t border-scripture-border/30 my-4"></div>
          </>
        )}

        <div className="p-4">
          <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Theme</h3>
          <SegmentedControl<Theme>
            columns={3}
            ariaLabel="Theme"
            value={theme}
            onChange={changeTheme}
            options={THEME_OPTIONS}
          />
          <p className="text-xs text-scripture-muted mt-2">
            Choose your preferred theme. Auto mode follows your system preference.
          </p>
        </div>

        <div className="border-t border-scripture-border/30 my-4"></div>

        <div className="p-4">
          <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Accessibility</h3>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="font-ui font-medium text-scripture-text mb-1">High Contrast Mode</div>
              <p className="text-xs text-scripture-muted">
                Increases color contrast for better readability. Meets WCAG AAA contrast requirements.
              </p>
            </div>
            <ToggleSwitch
              checked={highContrast}
              onChange={changeHighContrast}
              label="Toggle high contrast mode"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
