import { describe, it, expect, beforeEach } from 'vitest';
import './setup';
import { useChromeStore } from '../chromeStore';

const holds = () => Object.keys(useChromeStore.getState().holds);

beforeEach(() => {
  useChromeStore.setState({ scrollHidden: false, topInset: 0, holds: {} });
});

describe('useChromeStore holds', () => {
  it('is idempotent per key', () => {
    const { setHold } = useChromeStore.getState();
    setHold('nav', true);
    setHold('nav', true);
    expect(holds()).toEqual(['nav']);
    setHold('nav', false);
    expect(holds()).toEqual([]);
  });

  it('keeps other owners holding when one releases', () => {
    const { setHold } = useChromeStore.getState();
    setHold('nav', true);
    setHold('banner', true);
    setHold('nav', false);
    expect(holds()).toEqual(['banner']);
  });

  it('ignores releasing a hold that was never taken', () => {
    const before = useChromeStore.getState().holds;
    useChromeStore.getState().setHold('nav', false);
    expect(useChromeStore.getState().holds).toBe(before);
  });
});

describe('useChromeStore visibility', () => {
  it('reveal clears the scroll-hidden flag', () => {
    useChromeStore.getState().setScrollHidden(true);
    useChromeStore.getState().reveal();
    expect(useChromeStore.getState().scrollHidden).toBe(false);
  });

  it('stores the measured inset', () => {
    useChromeStore.getState().setTopInset(64);
    expect(useChromeStore.getState().topInset).toBe(64);
  });
});
