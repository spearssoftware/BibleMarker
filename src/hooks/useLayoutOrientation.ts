import { useEffect } from 'react';
import { usePanelStore } from '@/stores/panelStore';

export function useLayoutOrientation() {
  const setOrientation = usePanelStore(state => state.setOrientation);
  const orientation = usePanelStore(state => state.orientation);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px) and (orientation: landscape)');

    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      const next = e.matches ? 'horizontal' : 'vertical';
      if (usePanelStore.getState().orientation !== next) {
        setOrientation(next);
      }
    };

    // Set initial value
    handler(mql);

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [setOrientation]);

  return orientation;
}
