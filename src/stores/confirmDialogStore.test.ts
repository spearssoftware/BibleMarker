import { describe, it, expect, beforeEach } from 'vitest';
import { useConfirmDialogStore, confirmDialog } from './confirmDialogStore';

describe('confirmDialogStore', () => {
  beforeEach(() => {
    useConfirmDialogStore.setState({ current: null });
  });

  it('opening sets the current dialog with its options', () => {
    void confirmDialog({ title: 'T', message: 'M', confirmLabel: 'Go' });
    const { current } = useConfirmDialogStore.getState();
    expect(current).toMatchObject({ title: 'T', message: 'M', confirmLabel: 'Go' });
  });

  it('resolves true and clears when confirmed', async () => {
    const promise = confirmDialog({ title: 'T', message: 'M' });
    useConfirmDialogStore.getState().resolve(true);
    await expect(promise).resolves.toBe(true);
    expect(useConfirmDialogStore.getState().current).toBeNull();
  });

  it('resolves false and clears when cancelled', async () => {
    const promise = confirmDialog({ title: 'T', message: 'M' });
    useConfirmDialogStore.getState().resolve(false);
    await expect(promise).resolves.toBe(false);
    expect(useConfirmDialogStore.getState().current).toBeNull();
  });

  it('cancels a pending dialog if a new one opens (no hung promise)', async () => {
    const first = confirmDialog({ title: 'first', message: 'M' });
    const second = confirmDialog({ title: 'second', message: 'M' });
    // The first promise resolves false so it never hangs.
    await expect(first).resolves.toBe(false);
    expect(useConfirmDialogStore.getState().current).toMatchObject({ title: 'second' });
    useConfirmDialogStore.getState().resolve(true);
    await expect(second).resolves.toBe(true);
  });
});
