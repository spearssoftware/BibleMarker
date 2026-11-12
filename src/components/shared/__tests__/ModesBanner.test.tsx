/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ModesBanner } from '../ModesBanner';
import { useAppModeStore } from '@/stores/appModeStore';

describe('ModesBanner', () => {
  beforeEach(() => {
    useAppModeStore.setState({ mode: 'study', modesBannerPending: true });
  });

  afterEach(cleanup);

  it('names the current mode', () => {
    render(<ModesBanner onDismiss={vi.fn()} />);

    expect(
      screen.getByText(
        "BibleMarker now has three modes. You're in Study. Switch any time from the top bar."
      )
    ).toBeTruthy();
  });

  it('calls onDismiss from the dismiss button', () => {
    const onDismiss = vi.fn();
    render(<ModesBanner onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
