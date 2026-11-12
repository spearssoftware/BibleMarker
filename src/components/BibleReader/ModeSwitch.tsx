/**
 * Mode Switch
 *
 * Picks between Read, Discover and Study from the top bar. Wide layouts show a
 * segmented control; narrow ones show a chip that opens a menu. The menu's open
 * state is owned by NavigationBar so its panel bookkeeping covers it.
 */

import { useRef } from 'react';
import { SegmentedControl, ToolbarPopover, type SegmentedOption } from '@/components/shared';
import { useDiscoveryEnabled } from '@/lib/discovery-config';
import { MODE_DESCRIPTIONS, MODE_LABELS, switchMode, useEffectiveMode } from '@/lib/appMode';
import type { AppMode } from '@/stores/appModeStore';
import { usePanelStore } from '@/stores/panelStore';

interface ModeSwitchProps {
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
}

export function ModeSwitch({ menuOpen, onMenuOpenChange }: ModeSwitchProps) {
  const mode = useEffectiveMode();
  const discoveryEnabled = useDiscoveryEnabled();
  const wide = usePanelStore(s => s.orientation === 'horizontal');
  const buttonRef = useRef<HTMLButtonElement>(null);

  const modes: AppMode[] = discoveryEnabled ? ['read', 'discover', 'study'] : ['read', 'study'];

  if (wide) {
    const options: SegmentedOption<AppMode>[] = modes.map(value => ({
      value,
      label: MODE_LABELS[value],
    }));
    return (
      <SegmentedControl options={options} value={mode} onChange={switchMode} size="sm" ariaLabel="Mode" />
    );
  }

  const label = MODE_LABELS[mode];
  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onMenuOpenChange(!menuOpen);
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className={`text-xs px-2 h-[36px] rounded-lg font-ui font-semibold transition-all duration-200
                   border border-scripture-border/30 touch-target select-none
                   ${menuOpen
                     ? 'bg-scripture-accent text-scripture-bg shadow-md'
                     : 'hover:bg-scripture-elevated hover:border-scripture-border/50'}`}
        aria-label={`Mode: ${label}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        {label}
      </button>
      {menuOpen && (
        <ToolbarPopover
          triggerRef={buttonRef}
          alignment="right"
          width={272}
          label="Mode"
          onClose={() => onMenuOpenChange(false)}
          panelClassName="py-1"
        >
          <div role="menu" aria-label="Mode">
            {modes.map(value => (
              <button
                key={value}
                role="menuitemradio"
                aria-checked={value === mode}
                onClick={() => {
                  onMenuOpenChange(false);
                  switchMode(value);
                }}
                className={`w-full flex flex-col items-start px-4 py-2.5 text-sm text-left
                           hover:bg-scripture-elevated transition-colors min-h-[44px]
                           ${value === mode ? 'text-scripture-accent' : 'text-scripture-text'}`}
              >
                <span className="font-semibold">{MODE_LABELS[value]}</span>
                <span className="text-xs text-scripture-muted">{MODE_DESCRIPTIONS[value]}</span>
              </button>
            ))}
          </div>
        </ToolbarPopover>
      )}
    </>
  );
}
