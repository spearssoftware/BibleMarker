import { describe, it, expect, beforeEach } from 'vitest';
import { usePanelStore } from '../panelStore';

describe('panelStore returnPanel', () => {
  beforeEach(() => {
    usePanelStore.setState({ activePanel: null, returnPanel: null });
  });

  const returnPanel = () => usePanelStore.getState().returnPanel;

  it('is null by default', () => {
    expect(returnPanel()).toBeNull();
  });

  it('is set when another panel replaces Discover', () => {
    usePanelStore.getState().openPanel('discovery');
    usePanelStore.getState().openPanel('settings');

    expect(returnPanel()).toBe('discovery');
  });

  it('is cleared when Discover opens', () => {
    usePanelStore.setState({ activePanel: 'settings', returnPanel: 'discovery' });

    usePanelStore.getState().openPanel('discovery');

    expect(returnPanel()).toBeNull();
  });

  it('is cleared by closePanel', () => {
    usePanelStore.setState({ activePanel: 'settings', returnPanel: 'discovery' });

    usePanelStore.getState().closePanel();

    expect(returnPanel()).toBeNull();
  });

  it('survives one non-Discover panel replacing another', () => {
    usePanelStore.setState({ activePanel: 'settings', returnPanel: 'discovery' });

    usePanelStore.getState().openPanel('reference');

    expect(returnPanel()).toBe('discovery');
  });

  it('stays null when a panel replaces a non-Discover panel', () => {
    usePanelStore.getState().openPanel('settings');
    usePanelStore.getState().openPanel('reference');

    expect(returnPanel()).toBeNull();
  });

  it('is not persisted', () => {
    const options = usePanelStore.persist.getOptions();
    const persisted = options.partialize?.(usePanelStore.getState()) as Record<string, unknown>;

    expect(persisted).not.toHaveProperty('returnPanel');
  });
});
