import { useCallback, useEffect, useState } from 'react';
import { isOnline, watchOnlineStatus } from '@/lib/offline';
import { isTileError } from '@/lib/map/mapStyle';

const LOAD_TIMEOUT_MS = 10_000;

/**
 * Tracks whether the basemap can be shown. Unavailable when offline, when the
 * tile source errors, or when the map never fires `onLoad` within 10 s. Coming
 * back online gives the map a fresh attempt.
 */
export function useMapAvailability() {
  const [online, setOnline] = useState(isOnline);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(
    () =>
      watchOnlineStatus(nowOnline => {
        setOnline(nowOnline);
        if (!nowOnline) return;
        setFailed(false);
        setLoaded(false);
        setAttempt(a => a + 1);
      }),
    [],
  );

  useEffect(() => {
    if (!online || loaded) return;
    const timer = setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [online, loaded, attempt]);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback((e: { error: { message?: string; url?: string } }) => {
    if (isTileError(e)) setFailed(true);
  }, []);

  return { available: online && !failed, onLoad: handleLoad, onError: handleError };
}
