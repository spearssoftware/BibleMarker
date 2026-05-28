/**
 * Tests for passage-capture.
 *
 * The DOM-capture path (captureChapterHtml / openHtmlInBrowser) depends on
 * live browser APIs (getComputedStyle, Tauri plugins) and is exercised
 * manually in the running app. We cover the pure helper here.
 */

import { describe, expect, it } from 'vitest';
import { getTranslationAttribution } from './passage-capture';
import type { ApiTranslation } from '@/lib/bible-api';

const ESV: ApiTranslation = {
  id: 'ESV',
  name: 'English Standard Version',
  abbreviation: 'ESV',
  language: 'en',
  provider: 'esv',
};

const NASB: ApiTranslation = {
  id: 'sword-NASB',
  name: 'New American Standard Bible 2020',
  abbreviation: 'NASB',
  language: 'en',
  provider: 'sword',
};

const KJV: ApiTranslation = {
  id: 'sword-KJV',
  name: 'King James Version',
  abbreviation: 'KJV',
  language: 'en',
  provider: 'sword',
};

describe('getTranslationAttribution', () => {
  it('returns the ESV copyright for the ESV translation', () => {
    expect(getTranslationAttribution(ESV)).toMatch(/Crossway/);
  });

  it('returns the NASB Lockman copyright for NASB', () => {
    expect(getTranslationAttribution(NASB)).toMatch(/Lockman/);
  });

  it('falls back to a short "public domain" line for modules with no copyright', () => {
    expect(getTranslationAttribution(KJV)).toMatch(/public domain/);
  });
});
