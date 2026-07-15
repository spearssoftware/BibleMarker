/**
 * Appearance settings tab — font size, scripture font, symbol position/size/
 * visibility, multi-word marking, theme, and accessibility. Reads its own
 * appearance state from the annotation store and owns its persistence handlers.
 * `theme`/`highContrast` stay owned by SettingsPanel (loaded with the rest of
 * preferences) and are passed in.
 */

import { useAnnotationStore } from '@/stores/annotationStore';
import { updatePreferences } from '@/lib/database';
import {
  applyScriptureFont,
  applySymbolOpacity,
  applySymbolSize,
  applySymbolPosition,
  SYMBOL_OPACITY_MIN,
  SYMBOL_OPACITY_MAX,
  SYMBOL_SIZE_MIN,
  SYMBOL_SIZE_MAX,
  type ScriptureFont,
  type SymbolPosition,
} from '@/lib/theme';
import { SegmentedControl } from '@/components/shared';
import { MARKING_STYLE_OPTIONS, type MarkingStyle } from '@/types';

type FontSizeValue = 'sm' | 'base' | 'lg' | 'xl';
type ThemeValue = 'dark' | 'light' | 'auto';

const fontSizeOptions: ReadonlyArray<{ value: FontSizeValue; label: string }> = [
  { value: 'sm', label: 'Small' },
  { value: 'base', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra Large' },
];

const themeOptions: ReadonlyArray<{ value: ThemeValue; label: string }> = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'auto', label: 'Auto' },
];

const SCRIPTURE_FONTS: Array<{ id: ScriptureFont; label: string; stack: string }> = [
  { id: 'crimson-pro', label: 'Crimson Pro', stack: "'Crimson Pro', Georgia, serif" },
  { id: 'lora', label: 'Lora', stack: "'Lora', Georgia, serif" },
  { id: 'merriweather', label: 'Merriweather', stack: "'Merriweather', Georgia, serif" },
  { id: 'literata', label: 'Literata', stack: "'Literata', Georgia, serif" },
];

interface AppearanceSectionProps {
  theme: ThemeValue;
  highContrast: boolean;
  onThemeChange: (theme: ThemeValue) => void;
  onHighContrastChange: (enabled: boolean) => void;
}

export function AppearanceSection({ theme, highContrast, onThemeChange, onHighContrastChange }: AppearanceSectionProps) {
  const {
    fontSize,
    setFontSize,
    scriptureFont,
    setScriptureFont,
    symbolPosition,
    setSymbolPosition,
    symbolOpacity,
    setSymbolOpacity,
    symbolSize,
    setSymbolSize,
    defaultMultiWordMarking,
    setDefaultMultiWordMarking,
  } = useAnnotationStore();

  const handleFontSizeChange = async (newSize: FontSizeValue) => {
    setFontSize(newSize);
    try {
      await updatePreferences({ fontSize: newSize });
    } catch (error) {
      console.error('Error updating font size:', error);
    }
  };

  const handleFontChange = async (font: ScriptureFont) => {
    setScriptureFont(font);
    applyScriptureFont(font);
    try {
      await updatePreferences({ scriptureFont: font });
    } catch (error) {
      console.error('Error updating scripture font:', error);
    }
  };

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
        <div className="p-4">
          <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Font Size</h3>
          <SegmentedControl<FontSizeValue>
            columns={4}
            ariaLabel="Font size"
            value={fontSize}
            onChange={handleFontSizeChange}
            options={fontSizeOptions}
          />
          <p className="text-xs text-scripture-muted mt-2">
            Adjust the text size for Bible reading
          </p>
        </div>

        <div className="border-t border-scripture-border/30 my-4"></div>

        <div className="p-4">
          <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Scripture Font</h3>
          <div className="grid grid-cols-2 gap-2">
            {SCRIPTURE_FONTS.map((f) => (
              <button
                key={f.id}
                onClick={() => handleFontChange(f.id)}
                className={`px-3 py-3 rounded-lg text-sm transition-all duration-200 text-left
                          ${scriptureFont === f.id
                            ? 'bg-scripture-accent text-scripture-bg shadow-md'
                            : 'bg-scripture-elevated hover:bg-scripture-border/50 border border-scripture-border/50 text-scripture-text'
                          }`}
              >
                <span className="block font-ui text-xs mb-1 opacity-70">{f.label}</span>
                <span style={{ fontFamily: f.stack }} className="text-base italic">The Word</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-scripture-muted mt-2">
            Choose the font used for Bible text
          </p>
        </div>

        <div className="border-t border-scripture-border/30 my-4"></div>

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

        <div className="p-4">
          <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Theme</h3>
          <SegmentedControl<ThemeValue>
            columns={3}
            ariaLabel="Theme"
            value={theme}
            onChange={onThemeChange}
            options={themeOptions}
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
            <button
              onClick={() => onHighContrastChange(!highContrast)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-scripture-accent focus:ring-offset-2 ${
                highContrast ? 'bg-scripture-accent' : 'bg-scripture-border'
              }`}
              role="switch"
              aria-checked={highContrast}
              aria-label="Toggle high contrast mode"
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-scripture-onAccent shadow ring-0 transition duration-200 ease-in-out ${
                  highContrast ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
