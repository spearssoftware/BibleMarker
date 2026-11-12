/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { GettingStartedSection } from '../GettingStartedSection';
import { useAppModeStore, type AppMode } from '@/stores/appModeStore';
import { useFeatureFlagsStore } from '@/stores/featureFlagsStore';
import { DEFAULT_FLAGS, FLAG_KEYS } from '@/lib/feature-flags';

const MARKING_SENTENCE =
  'Select a word or phrase to highlight, underline or color it. Choose "every one in this chapter" to mark each place it appears.';

function renderIn(mode: AppMode, discoveryEnabled = true) {
  useFeatureFlagsStore.setState({
    flags: { ...DEFAULT_FLAGS, [FLAG_KEYS.discoveryEnabled]: discoveryEnabled },
  });
  useAppModeStore.setState({ mode });
  return render(<GettingStartedSection />);
}

afterEach(cleanup);

describe('GettingStartedSection', () => {
  it.each(['read', 'discover', 'study'] as const)('lists the modes and drops the inductive intro in %s', mode => {
    renderIn(mode);

    expect(screen.getByText('Modes')).toBeTruthy();
    expect(screen.getByText('Just the text. Highlight and mark as you go.', { exact: false })).toBeTruthy();
    expect(screen.getByText('See the setting, people, places and commentary beside the text.', { exact: false })).toBeTruthy();
    expect(screen.getByText('The full inductive toolset', { exact: false })).toBeTruthy();
    expect(screen.queryByText('inductive Bible study method', { exact: false })).toBeNull();
  });

  it('omits Discover from the modes list when the kill switch is off', () => {
    renderIn('read', false);

    expect(screen.queryByText('See the setting, people, places and commentary beside the text.', { exact: false })).toBeNull();
  });

  it.each(['read', 'discover', 'study'] as const)('shows the verse-number note bullet in %s', mode => {
    renderIn(mode);

    expect(screen.getByText('Click verse numbers to add inline notes (supports Markdown)')).toBeTruthy();
  });

  it.each(['read', 'discover'] as const)('shows one marking paragraph and no Study-only blocks in %s', mode => {
    renderIn(mode);

    expect(screen.getByText(MARKING_SENTENCE)).toBeTruthy();
    expect(screen.queryByText('Key Words: Keyword vs Match vs Apply')).toBeNull();
    expect(screen.queryByText('🔍 Observe')).toBeNull();
    expect(screen.queryByText('📊 Analyze')).toBeNull();
  });

  it('shows the Key Words, Observe, Analyze and Study Tools blocks in Study', () => {
    renderIn('study');

    expect(screen.queryByText(MARKING_SENTENCE)).toBeNull();
    expect(screen.getByText('✏️ Key Words: Keyword vs Match vs Apply')).toBeTruthy();
    expect(screen.getByText('🔍 Observe')).toBeTruthy();
    expect(screen.getByText('📊 Analyze')).toBeTruthy();
    expect(screen.getByText('Open Study Tools (📖 from the toolbar)', { exact: false })).toBeTruthy();
  });

  it('shows Study Tools with Discover wording in Discover', () => {
    renderIn('discover');

    expect(screen.getByText('📖 Study Tools')).toBeTruthy();
    expect(
      screen.getByText('Open Study Tools (📖 from links in Discover or a verse number)', { exact: false })
    ).toBeTruthy();
  });

  it('hides Study Tools in Read', () => {
    renderIn('read');

    expect(screen.queryByText('📖 Study Tools')).toBeNull();
  });
});
