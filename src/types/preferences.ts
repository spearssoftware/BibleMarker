/**
 * User Preferences & Related Types
 *
 * Previously defined in db.ts, moved here so they're independent of the database layer.
 */

import type { MarkingPreferences } from './annotation';

/** API configuration for Bible APIs */
export interface ApiConfigRecord {
  provider: 'esv' | 'sword';
  apiKey?: string;
  username?: string;
  password?: string;
  baseUrl?: string;
  enabled: boolean;
}

/** Onboarding state */
export interface OnboardingState {
  hasSeenWelcome: boolean;
  hasCompletedTour: boolean;
  dismissedTooltips: string[];
}

/** Auto-backup configuration */
export interface AutoBackupConfig {
  enabled: boolean;
  intervalMinutes: number;
  maxBackups: number;
}

/** User preferences */
export interface UserPreferences {
  id: string;                    // 'main' for singleton
  currentModuleId?: string;
  currentBook?: string;
  currentChapter?: number;
  marking: MarkingPreferences;
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  scriptureFont?: 'crimson-pro' | 'lora' | 'merriweather' | 'literata';
  theme: 'dark' | 'light' | 'auto';
  highContrast?: boolean;
  apiConfigs?: ApiConfigRecord[];
  favoriteTranslations?: string[];
  recentTranslations?: string[];
  recentBooks?: string[];
  defaultTranslation?: string;
  apiResourcesEnabled?: boolean;
  translationLanguageFilter?: string[];
  onboarding?: OnboardingState;
  autoBackup?: AutoBackupConfig;
  /** When false, app will not check GitHub for new releases (default true) */
  checkForUpdates?: boolean;
  /** Update channel: 'stable' (default) or 'beta' for early access */
  updateChannel?: 'stable' | 'beta';
  /** ISO date string of last update check (used to throttle to once per 24h) */
  lastUpdateCheck?: string;
  /** Last app version the user has seen the What's New popup for */
  lastSeenVersion?: string;
  debug?: {
    keywordMatching?: boolean;
    verseText?: boolean;
  };
}

/** Cached chapter text for fast access */
export interface ChapterCache {
  id: string;                    // moduleId:book:chapter
  moduleId: string;
  book: string;
  chapter: number;
  verses: Record<number, string>;
  cachedAt: Date;
}

/** Cached translation list */
export interface TranslationCache {
  id: string;
  translations: unknown[];
  cachedAt: Date;
}

/** Reading history entry */
export interface ReadingHistory {
  id: string;
  moduleId: string;
  book: string;
  chapter: number;
  timestamp: Date;
}

/** ESV API rate limit state (persisted for compliance) */
export interface EsvRateLimitState {
  id: 'esv';
  requestTimestamps: number[];
}
