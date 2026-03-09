/**
 * Setup for store tests — provides localStorage and window stubs
 * that zustand persist middleware requires.
 */

const store = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (_index: number) => null as string | null,
};

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

if (typeof globalThis.window === 'undefined') {
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
}
