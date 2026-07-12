import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore, toast } from './toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('adds a toast with a variant and unique id', () => {
    useToastStore.getState().show('hello', 'info');
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ message: 'hello', variant: 'info' });
    expect(toasts[0].id).toBeTruthy();
  });

  it('queues multiple toasts with distinct ids', () => {
    toast.error('a');
    toast.success('b');
    const { toasts } = useToastStore.getState();
    expect(toasts.map((t) => t.variant)).toEqual(['error', 'success']);
    expect(toasts[0].id).not.toBe(toasts[1].id);
  });

  it('dismiss removes only the matching toast', () => {
    toast.info('a');
    toast.info('b');
    const first = useToastStore.getState().toasts[0].id;
    useToastStore.getState().dismiss(first);
    const remaining = useToastStore.getState().toasts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].message).toBe('b');
  });

  it('helper maps to the correct variants', () => {
    toast.error('e');
    toast.success('s');
    toast.info('i');
    expect(useToastStore.getState().toasts.map((t) => t.variant)).toEqual([
      'error', 'success', 'info',
    ]);
  });
});
