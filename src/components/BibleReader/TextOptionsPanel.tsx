/**
 * Text options panel ("Aa")
 *
 * Font size, scripture font and theme from the reader's top bar, plus the
 * Read-only verse numbers toggle. Content only: NavigationBar wraps it in a
 * ToolbarPopover.
 */

import { SegmentedControl, ToggleSwitch } from '@/components/shared';
import { useEffectiveMode } from '@/lib/appMode';
import {
  FONT_SIZE_OPTIONS,
  SCRIPTURE_FONTS,
  THEME_OPTIONS,
  changeFontSize,
  changeScriptureFont,
  changeShowVerseNumbers,
  changeTheme,
  type FontSizeValue,
} from '@/lib/textSettings';
import type { Theme } from '@/lib/theme';
import { useAnnotationStore } from '@/stores/annotationStore';

const HEADING_CLASSES = 'text-sm font-ui font-semibold text-scripture-text mb-2';

export function TextOptionsPanel() {
  const mode = useEffectiveMode();
  const fontSize = useAnnotationStore(s => s.fontSize);
  const scriptureFont = useAnnotationStore(s => s.scriptureFont);
  const theme = useAnnotationStore(s => s.theme);
  const showVerseNumbers = useAnnotationStore(s => s.showVerseNumbers);

  return (
    <div className="space-y-4">
      <section>
        <h3 className={HEADING_CLASSES}>Font Size</h3>
        <SegmentedControl<FontSizeValue>
          columns={4}
          size="sm"
          ariaLabel="Font size"
          value={fontSize}
          onChange={changeFontSize}
          options={FONT_SIZE_OPTIONS}
        />
      </section>

      <section>
        <h3 className={HEADING_CLASSES}>Scripture Font</h3>
        <div className="grid grid-cols-2 gap-2">
          {SCRIPTURE_FONTS.map(f => (
            <button
              key={f.id}
              type="button"
              aria-pressed={scriptureFont === f.id}
              onClick={() => changeScriptureFont(f.id)}
              className={`px-3 py-2 rounded-lg text-sm transition-all duration-200 text-left
                        ${scriptureFont === f.id
                          ? 'bg-scripture-accent text-scripture-bg shadow-md'
                          : 'bg-scripture-elevated hover:bg-scripture-border/50 border border-scripture-border/50 text-scripture-text'
                        }`}
            >
              <span className="block font-ui text-xs mb-0.5 opacity-70">{f.label}</span>
              <span style={{ fontFamily: f.stack }} className="text-base italic">The Word</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className={HEADING_CLASSES}>Theme</h3>
        <SegmentedControl<Theme>
          columns={3}
          size="sm"
          ariaLabel="Theme"
          value={theme}
          onChange={changeTheme}
          options={THEME_OPTIONS}
        />
      </section>

      {mode === 'read' && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-ui font-semibold text-scripture-text">Verse numbers</span>
          <ToggleSwitch checked={showVerseNumbers} onChange={changeShowVerseNumbers} label="Verse numbers" />
        </div>
      )}
    </div>
  );
}
