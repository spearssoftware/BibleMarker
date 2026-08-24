/**
 * @vitest-environment jsdom
 */

import type { ComponentProps } from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectionMenu } from '../SelectionMenu';
import { useAnnotationStore, type TextSelection } from '@/stores/annotationStore';
import { DEFAULT_MARKING_PREFERENCES } from '@/types';

function makeSelection(): TextSelection {
  return {
    moduleId: 'sword-nasb2020',
    book: 'John',
    chapter: 1,
    startVerse: 1,
    endVerse: 1,
    text: 'Word',
    menuAnchor: { x: 100, y: 200 },
  };
}

function renderMenu(overrides: Partial<ComponentProps<typeof SelectionMenu>> = {}) {
  const props = {
    selection: makeSelection(),
    presets: [],
    onApplyPreset: vi.fn(),
    onAddAsVariant: vi.fn(),
    onOpenKeyWordManager: vi.fn(),
    onQuickAddKeyword: vi.fn(),
    onAddToList: vi.fn(),
    onReferenceLookup: vi.fn(),
    onQuickHighlight: vi.fn(),
    onCancel: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<SelectionMenu {...props} />);
  return props;
}

describe('SelectionMenu', () => {
  beforeEach(() => {
    useAnnotationStore.setState({ preferences: { ...DEFAULT_MARKING_PREFERENCES, recentColors: [] } });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the full toolkit by default (advanced=true)', () => {
    renderMenu();

    expect(screen.getByLabelText('Create key word')).toBeTruthy();
    expect(screen.getByLabelText('Add person')).toBeTruthy();
    expect(screen.getByLabelText('Add place')).toBeTruthy();
    expect(screen.getByLabelText('Add observation')).toBeTruthy();
    expect(screen.getByLabelText('Look up in study tools')).toBeTruthy();
    expect(screen.getByLabelText('Cancel selection')).toBeTruthy();
    // Quick-highlight row is shown in both modes.
    expect(screen.getByRole('group', { name: 'Highlight color' })).toBeTruthy();
  });

  it('hides advanced items and shows only swatches + Cancel when advanced=false', () => {
    renderMenu({ advanced: false });

    expect(screen.queryByLabelText('Create key word')).toBeNull();
    expect(screen.queryByLabelText('Add person')).toBeNull();
    expect(screen.queryByLabelText('Add place')).toBeNull();
    expect(screen.queryByLabelText('Add observation')).toBeNull();
    expect(screen.queryByLabelText('Look up in study tools')).toBeNull();

    expect(screen.getByRole('group', { name: 'Highlight color' })).toBeTruthy();
    expect(screen.getByLabelText('Cancel selection')).toBeTruthy();
  });

  it('calls onQuickHighlight with the chosen color', async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    // With no recent colors yet, the row fills from the front of the
    // hue-spread defaults - "yellow" is always the first swatch in that case.
    await user.click(screen.getByLabelText('Highlight yellow'));

    expect(props.onQuickHighlight).toHaveBeenCalledWith('yellow');
  });

  it('shows at most 8 swatches, with no duplicates', () => {
    renderMenu();
    const group = screen.getByRole('group', { name: 'Highlight color' });
    expect(group.children.length).toBe(8);
    const labels = Array.from(group.children).map(el => el.getAttribute('aria-label'));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('shows recently-used colors first, filling the rest from the hue-spread defaults', () => {
    useAnnotationStore.setState({
      preferences: { ...DEFAULT_MARKING_PREFERENCES, recentColors: ['teal', 'yellow'] },
    });
    renderMenu();
    const group = screen.getByRole('group', { name: 'Highlight color' });
    const labels = Array.from(group.children).map(el => el.getAttribute('aria-label'));
    expect(labels[0]).toBe('Highlight teal');
    expect(labels[1]).toBe('Highlight yellow');
    expect(group.children.length).toBe(8);
  });
});
