/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { EraStrip } from '../EraStrip';
import { track } from '@/lib/telemetry';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

describe('EraStrip', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('shows the band label and places the marker proportionally within the band', () => {
    // Patriarchs spans -1920..-1636 (285 years); -1920 is the band start.
    render(<EraStrip book="Gen" chapter={12} translationId="nasb" year={-1920} yearPending={false} />);
    expect(screen.getByText('Patriarchs')).toBeTruthy();
    // Inset 10% into the band so it clears the seam: (1 + 0.1) / 8.
    expect(parseFloat(screen.getByTestId('era-marker').style.left)).toBeCloseTo(13.75);
    expect(screen.getByRole('img', { name: 'Era: Patriarchs' })).toBeTruthy();
  });

  it('is hidden while the year is loading or errored, even for Genesis 1-11', () => {
    const { container } = render(<EraStrip book="Gen" chapter={3} translationId="nasb" year={null} yearPending />);
    expect(container.textContent).toBe('');
    expect(track).not.toHaveBeenCalled();
  });

  it('sits at the center of Beginnings for Genesis 1-11, ignoring any year', () => {
    render(<EraStrip book="Gen" chapter={3} translationId="nasb" year={null} yearPending={false} />);
    expect(screen.getByText('Beginnings')).toBeTruthy();
    expect(screen.getByTestId('era-marker').style.left).toBe('6.25%');
  });

  it('is hidden when undated outside Genesis 1-11', () => {
    const { container } = render(<EraStrip book="Ps" chapter={23} translationId="nasb" year={null} yearPending={false} />);
    expect(container.textContent).toBe('');
    expect(track).not.toHaveBeenCalled();
  });

  it('fires shown telemetry once per chapter', () => {
    const { rerender } = render(<EraStrip book="Gen" chapter={12} translationId="nasb" year={-1920} yearPending={false} />);
    rerender(<EraStrip book="Gen" chapter={12} translationId="nasb" year={-1920} yearPending={false} />);
    expect(track).toHaveBeenCalledWith('discovery_chip_shown', {
      feature: 'setting_timeline',
      dedupeKey: 'discovery_chip_shown:setting_timeline:Gen:12:nasb',
    });
  });
});
