/**
 * @vitest-environment jsdom
 */

import type { ComponentProps } from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectionMenu } from '../SelectionMenu';
import { useAnnotationStore, type TextSelection } from '@/stores/annotationStore';
import { DEFAULT_MARKING_PREFERENCES, createMarkingPreset } from '@/types';
import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';
import type { ChapterWordMatch } from '@/lib/keywordMatching';

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
    onMarkChapter: vi.fn(),
    onRemoveChapterMark: vi.fn(),
    onEditChapterMark: vi.fn(),
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
    useDiscoveryPrefsStore.setState({ markingStyle: 'highlight' });
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

    expect(props.onQuickHighlight).toHaveBeenCalledWith('yellow', 'highlight');
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

  describe('tools-off marking sheet', () => {
    const jesus: ChapterWordMatch = { word: 'Jesus', variants: [], count: 12 };
    const jesusSelection = { ...makeSelection(), chapter: 11, text: 'Jesus' };

    it('does not show the style row or scope choice in the inductive sheet', () => {
      renderMenu({ chapterWord: jesus });
      expect(screen.queryByRole('radiogroup', { name: 'Marking style' })).toBeNull();
      expect(screen.queryByRole('radiogroup', { name: 'Where to mark' })).toBeNull();
    });

    it('applies the chosen style just here and remembers it', async () => {
      const user = userEvent.setup();
      const props = renderMenu({ advanced: false });

      await user.click(screen.getByRole('radio', { name: 'Underline' }));
      expect(useDiscoveryPrefsStore.getState().markingStyle).toBe('underline');

      await user.click(screen.getByLabelText('Underline yellow'));
      expect(props.onQuickHighlight).toHaveBeenCalledWith('yellow', 'underline');
    });

    it('offers "Just here" and "Every … in this chapter" with the count, defaulting to just here', async () => {
      const user = userEvent.setup();
      const props = renderMenu({ advanced: false, selection: jesusSelection, chapterWord: jesus });

      const here = screen.getByRole('radio', { name: 'Just here' });
      expect(here.getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('radio', { name: 'Every \u201cJesus\u201d in this chapter (12)' })).toBeTruthy();

      await user.click(screen.getByLabelText('Highlight yellow'));
      expect(props.onQuickHighlight).toHaveBeenCalledWith('yellow', 'highlight');
      expect(props.onMarkChapter).not.toHaveBeenCalled();
    });

    it('marks every occurrence in the chapter in two taps', async () => {
      const user = userEvent.setup();
      useDiscoveryPrefsStore.setState({ markingStyle: 'underline' });
      const props = renderMenu({
        advanced: false,
        selection: jesusSelection,
        chapterWord: jesus,
      });

      await user.click(screen.getByRole('radio', { name: /Every .Jesus. in this chapter/ }));
      await user.click(screen.getByLabelText('Underline yellow'));

      expect(props.onMarkChapter).toHaveBeenCalledWith(jesus, 'underline', 'yellow');
      expect(props.onQuickHighlight).not.toHaveBeenCalled();
      expect(props.onClose).toHaveBeenCalled();
    });

    it('hides the chapter option when there is no single markable word (multi-word or pronoun)', () => {
      renderMenu({ advanced: false, chapterWord: null });
      expect(screen.queryByRole('radiogroup', { name: 'Where to mark' })).toBeNull();
      expect(screen.getByRole('radiogroup', { name: 'Marking style' })).toBeTruthy();
    });

    it('offers to remove a chapter mark that already covers the word', async () => {
      const user = userEvent.setup();
      const preset = createMarkingPreset({
        word: 'Jesus',
        highlight: { style: 'underline', color: 'blue' },
        scopes: [{ book: 'John', chapter: 11 }],
      });
      const props = renderMenu({
        advanced: false,
        selection: jesusSelection,
        presets: [preset],
        chapterWord: jesus,
      });

      expect(screen.queryByRole('radiogroup', { name: 'Where to mark' })).toBeNull();
      expect(screen.getByText(/in this chapter is marked/)).toBeTruthy();

      await user.click(screen.getByLabelText('Remove the mark from every \u201cJesus\u201d in this chapter'));
      expect(props.onRemoveChapterMark).toHaveBeenCalledWith(preset);
      expect(props.onClose).toHaveBeenCalled();
    });

    it('offers Edit next to Remove, opening the mark in Key Words', async () => {
      const user = userEvent.setup();
      const preset = createMarkingPreset({
        word: 'Jesus',
        highlight: { style: 'underline', color: 'blue' },
        scopes: [{ book: 'John', chapter: 11 }],
      });
      const props = renderMenu({ advanced: false, selection: jesusSelection, presets: [preset], chapterWord: jesus });

      await user.click(screen.getByRole('button', { name: 'Edit the mark on \u201cJesus\u201d in Key Words' }));
      expect(props.onEditChapterMark).toHaveBeenCalledWith(preset);
      expect(props.onRemoveChapterMark).not.toHaveBeenCalled();
      expect(props.onClose).toHaveBeenCalled();
    });

    it('says a broader key word already marks the word, without offering removal', () => {
      const preset = createMarkingPreset({
        word: 'Jesus',
        highlight: { style: 'highlight', color: 'yellow' },
      });
      renderMenu({ advanced: false, selection: jesusSelection, presets: [preset], chapterWord: jesus });

      expect(screen.getByText(/already marked by a key word/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Remove the mark/ })).toBeNull();
      expect(screen.getByRole('button', { name: /Edit the mark/ })).toBeTruthy();
    });
  });
});
