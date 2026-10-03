/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ChapterMap } from '../ChapterMap';
import { ChapterMapModal } from '../ChapterMapModal';
import { usePlaceStore } from '@/stores/placeStore';
import type { ChapterPlace } from '@/types';

vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: { children?: ReactNode }) => <div data-testid="map">{children}</div>,
  Marker: ({ children, onClick }: { children?: ReactNode; onClick?: (e: unknown) => void }) => (
    <div data-testid="marker" onClick={() => onClick?.({ originalEvent: { stopPropagation() {} } })}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('maplibre-gl', () => ({ addProtocol: vi.fn() }));
vi.mock('pmtiles', () => ({ Protocol: class { tile = vi.fn(); } }));
vi.mock('@protomaps/basemaps', () => ({ layers: () => [], namedFlavor: () => ({}) }));

let online = true;
let statusListener: ((isOnline: boolean) => void) | null = null;
vi.mock('@/lib/offline', () => ({
  isOnline: () => online,
  watchOnlineStatus: (cb: (isOnline: boolean) => void) => {
    statusListener = cb;
    return () => { statusListener = null; };
  },
}));

const navigateToVerse = vi.fn();
vi.mock('@/stores/bibleStore', () => ({
  useBibleStore: (selector: (s: { navigateToVerse: typeof navigateToVerse }) => unknown) =>
    selector({ navigateToVerse }),
}));

const PLACES: ChapterPlace[] = [
  { slug: 'haran', name: 'Haran', latitude: 36.86, longitude: 39.03, verses: [4, 5] },
  { slug: 'shechem', name: 'Shechem', latitude: 32.21, longitude: 35.28, verses: [6, 8] },
];

beforeEach(() => {
  online = true;
  navigateToVerse.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ChapterMap', () => {
  it('renders one marker per place', () => {
    render(<ChapterMap places={PLACES} book="Genesis" chapter={12} />);
    expect(screen.getAllByTestId('marker')).toHaveLength(2);
  });

  it('renders nothing when there are no places', () => {
    const { container } = render(<ChapterMap places={[]} book="Psalms" chapter={23} />);
    expect(container.childElementCount).toBe(0);
  });

  it('shows verses after a marker tap and navigates on verse tap', () => {
    const onMarkerTap = vi.fn();
    render(<ChapterMap places={PLACES} book="Genesis" chapter={12} onMarkerTap={onMarkerTap} />);
    expect(screen.queryByText('Shechem')).toBeNull();

    fireEvent.click(screen.getAllByTestId('marker')[1]);
    expect(onMarkerTap).toHaveBeenCalledWith(PLACES[1]);
    expect(screen.getByText('Shechem')).toBeTruthy();
    expect(screen.getByText('Verses')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '8' }));
    expect(navigateToVerse).toHaveBeenCalledWith('Genesis', 12, 8, true);
  });

  it('calls onOpenFullMap', () => {
    const onOpenFullMap = vi.fn();
    render(<ChapterMap places={PLACES} book="Genesis" chapter={12} onOpenFullMap={onOpenFullMap} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open full map' }));
    expect(onOpenFullMap).toHaveBeenCalled();
  });

  it('falls back to a place list when offline', () => {
    online = false;
    render(<ChapterMap places={PLACES} book="Genesis" chapter={12} />);
    expect(screen.queryByTestId('map')).toBeNull();
    expect(screen.getByText('Map needs an internet connection.')).toBeTruthy();
    expect(screen.getByText('Haran')).toBeTruthy();
  });

  it('falls back when going offline after mount', () => {
    render(<ChapterMap places={PLACES} book="Genesis" chapter={12} />);
    act(() => statusListener?.(false));
    expect(screen.getByText('Map needs an internet connection.')).toBeTruthy();
  });

  it('falls back when the map never loads within 10 s', () => {
    vi.useFakeTimers();
    render(<ChapterMap places={PLACES} book="Genesis" chapter={12} />);
    expect(screen.getByTestId('map')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText('Map needs an internet connection.')).toBeTruthy();
  });
});

describe('ChapterMapModal', () => {
  it('renders the map and makes no placeStore writes', () => {
    const listener = vi.fn();
    const unsubscribe = usePlaceStore.subscribe(listener);
    render(<ChapterMapModal isOpen onClose={() => {}} places={PLACES} />);
    expect(screen.getAllByTestId('marker')).toHaveLength(2);
    fireEvent.click(screen.getAllByTestId('marker')[0]);
    expect(screen.getByText('Haran')).toBeTruthy();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('shows the offline fallback', () => {
    online = false;
    render(<ChapterMapModal isOpen onClose={() => {}} places={PLACES} />);
    expect(screen.getByText('Map needs an internet connection.')).toBeTruthy();
  });
});
