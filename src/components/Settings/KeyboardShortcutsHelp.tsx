/**
 * Keyboard Shortcuts Help Component
 * 
 * Displays available keyboard shortcuts for the app.
 */

import { getKeyboardShortcutsHelp } from '@/hooks/useKeyboardShortcuts';

export function KeyboardShortcutsHelp() {
  const shortcuts = getKeyboardShortcutsHelp();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-ui font-semibold text-scripture-text mb-3">Keyboard Shortcuts</h3>
        <p className="text-xs text-scripture-muted mb-4">
          Use these shortcuts to navigate and interact with the app quickly.
        </p>
        
        <div className="space-y-2">
          {shortcuts.map((shortcut, index) => (
            <div
              key={index}
              className="flex items-start justify-between py-2 border-b border-scripture-border/20 last:border-0"
            >
              <div className="flex-1">
                <div className="text-sm text-scripture-text font-medium mb-0.5">
                  {shortcut.description}
                </div>
              </div>
              <div className="flex items-center gap-1.5 ml-4">
                {shortcut.keys.map((key, keyIndex) => (
                  <span key={keyIndex}>
                    {keyIndex > 0 && <span className="text-scripture-muted mx-1">+</span>}
                    <kbd className="px-2 py-1 text-xs font-mono bg-scripture-elevated border border-scripture-border/50 rounded text-scripture-text shadow-sm">
                      {key}
                    </kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
