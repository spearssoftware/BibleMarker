/**
 * BibleMarker
 * 
 * Main application component with Bible API support (getBible, Biblia, ESV).
 */

import { useEffect, useState } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useStudyStore } from '@/stores/studyStore';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { useListStore } from '@/stores/listStore';
import { NavigationBar } from '@/components/BibleReader';
import { MultiTranslationView } from '@/components/BibleReader/MultiTranslationView';
import { Toolbar } from '@/components/MarkingToolbar';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import { WelcomeScreen, OnboardingTour } from '@/components/Onboarding';
import { loadSampleData } from '@/lib/sampleData';
import { getPreferences, initDatabase } from '@/lib/database';
import { loadApiConfigs } from '@/lib/bible-api';
import { initTheme } from '@/lib/theme';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useVirtualKeyboard } from '@/hooks/useVirtualKeyboard';
import { autoBackupService } from '@/lib/autoBackup';
import { getDebugFlags } from '@/lib/debug';
import { initializeSync, shutdownSync } from '@/lib/sync';
import { checkForUpdateIfDue } from '@/lib/updateCheck';
import { UpdateBanner } from '@/components/shared';

export default function App() {
  const { setChapter, currentBook, currentChapter, currentModuleId, setLoading, setError } = useBibleStore();

  const { setCurrentModule } = useBibleStore();
  const { setFontSize } = useAnnotationStore();
  const { loadStudies } = useStudyStore();
  const { loadActiveView } = useMultiTranslationStore();
  const { loadLists } = useListStore();
  
  // Onboarding state
  const [showWelcome, setShowWelcome] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);

  // Update check: show banner when new version available (respects checkForUpdates pref, 24h throttle)
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; url: string } | null>(null);
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);

  // Initialize theme on mount (before other initialization)
  useEffect(() => {
    initTheme();
  }, []);

  // Set up keyboard shortcuts for navigation (arrow keys, J/K)
  useKeyboardShortcuts({
    enabled: true,
  });

  // Handle iOS virtual keyboard avoidance
  useVirtualKeyboard();

  // Critical path: DB init + preferences + active view (needed for first render)
  useEffect(() => {
    async function loadPrefs() {
      try {
        // Ensure database is initialized (schema migrations) before any queries
        await initDatabase();
        const prefs = await getPreferences();
        if (prefs.fontSize) {
          setFontSize(prefs.fontSize);
        }
        
        // Check onboarding state
        if (!prefs.onboarding?.hasSeenWelcome) {
          setShowWelcome(true);
        }
        setIsCheckingOnboarding(false);
      } catch (err) {
        console.error('Error loading preferences:', err);
        setIsCheckingOnboarding(false);
      }
    }
    loadPrefs();
    
    // Active view is needed for first render
    loadActiveView();
  }, [setFontSize, loadActiveView]);

  // Deferred initialization: non-critical work after first render
  useEffect(() => {
    const id = setTimeout(() => {
      loadStudies();
      loadLists();
      getDebugFlags();
      autoBackupService.start();

      initializeSync().catch(err => {
        console.error('[App] Failed to initialize sync:', err);
      });

      checkForUpdateIfDue().then(result => {
        if (result) {
          setUpdateAvailable({ version: result.version, url: result.url });
        }
      });
    }, 0);

    return () => {
      clearTimeout(id);
      autoBackupService.stop();
      shutdownSync().catch(() => {});
    };
  }, [loadStudies, loadLists]);

  // Listen for restart onboarding event
  useEffect(() => {
    const handleRestartOnboarding = async () => {
      setShowWelcome(true);
      setShowTour(false);
    };
    
    window.addEventListener('restartOnboarding', handleRestartOnboarding);
    return () => {
      window.removeEventListener('restartOnboarding', handleRestartOnboarding);
    };
  }, []);

  // When sync applies remote changes, refresh UI and re-load API configs
  // (API keys may have synced from another device but loadApiConfigs ran before sync completed)
  useEffect(() => {
    const handleSyncDataChanged = async (e: Event) => {
      const detail = (e as CustomEvent<{ applied: number; tables?: string[] }>).detail;
      const tables = detail?.tables ?? [];
      const prefsSynced = tables.includes('preferences');

      const { loadApiConfigs, clearTranslationsCache } = await import('@/lib/bible-api');
      await loadApiConfigs();
      if (prefsSynced) {
        await clearTranslationsCache();
      }
      window.dispatchEvent(new Event('translationsUpdated'));
      window.dispatchEvent(new CustomEvent('annotationsUpdated'));
      loadStudies();
      loadLists();
      loadActiveView();
    };
    window.addEventListener('syncDataChanged', handleSyncDataChanged);
    return () => window.removeEventListener('syncDataChanged', handleSyncDataChanged);
  }, [loadStudies, loadLists, loadActiveView]);

  // Load API configs + sample data in parallel, initialize module ID if needed
  useEffect(() => {
    async function init() {
      try {
        // Ensure DB is ready before API config / sample data access
        await initDatabase();
        
        // Load API configs and sample data in parallel (independent operations)
        await Promise.all([
          loadApiConfigs(),
          loadSampleData(),
        ]);
        
        // Check if current module ID is valid, if not reset to default
        // Don't load chapter here - let the second useEffect handle it
        const { currentModuleId: existingModuleId } = useBibleStore.getState();
        const { activeView } = useMultiTranslationStore.getState();
        
        const needsModule = !existingModuleId || existingModuleId.includes('undefined') || existingModuleId.trim() === '';
        const hasActiveTranslations = activeView && activeView.translationIds.length > 0;
        
        if (needsModule) {
          if (hasActiveTranslations) {
            // Active view has translations (e.g. synced from iCloud) but currentModuleId
            // is not set (fresh localStorage). Use the first translation from the view.
            setCurrentModule(activeView.translationIds[0]);
          } else {
            // No translation anywhere — set up a default
            const prefs = await getPreferences();
            const defaultTranslation = prefs.defaultTranslation;
            
            if (defaultTranslation) {
              setCurrentModule(defaultTranslation);
              const { addTranslation } = useMultiTranslationStore.getState();
              await addTranslation(defaultTranslation);
            } else {
              // Fall back to KJV if no default is set
              setCurrentModule('kjv');
              const { addTranslation } = useMultiTranslationStore.getState();
              await addTranslation('kjv');
            }
          }
        }
      } catch (err) {
        console.error('[App] Error during initialization:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize');
      }
    }
    init();
  }, [setCurrentModule, setError]);

  // Load chapter when location or module changes
  useEffect(() => {
    async function load() {
      if (!currentModuleId) {
        return; // Don't load if no module selected
      }
      setLoading(true);
      setError(null);
      // Clear chapter immediately to show loading state
      setChapter(null);
      try {
        const chapter = await loadChapter(currentModuleId, currentBook, currentChapter);
        setChapter(chapter);
      } catch (err) {
        console.error('[App] Error loading chapter:', err);
        setError(err instanceof Error ? err.message : 'Failed to load');
        setLoading(false);
      }
    }
    load();
  }, [currentBook, currentChapter, currentModuleId, setChapter, setLoading, setError]);

  return (
    <div className="min-h-screen bg-scripture-bg text-scripture-text flex flex-col">
      {/* Global error display */}
      <ErrorDisplay />

      {/* Update available banner */}
      {updateAvailable && !updateBannerDismissed && (
        <UpdateBanner
          version={updateAvailable.version}
          url={updateAvailable.url}
          onDismiss={() => setUpdateBannerDismissed(true)}
        />
      )}

      {/* Top navigation */}
      <NavigationBar />

      {/* Main reading area - always use MultiTranslationView */}
      <main className="flex-1 pb-32 pl-safe-left pr-safe-right" role="main" aria-label="Bible reading area">
        <MultiTranslationView />
      </main>

      {/* Bottom marking toolbar */}
      <Toolbar />
      
      {/* Onboarding */}
      {!isCheckingOnboarding && showWelcome && (
        <WelcomeScreen
          onComplete={() => setShowWelcome(false)}
          onStartTour={() => {
            setShowWelcome(false);
            // Small delay to allow welcome screen to close
            setTimeout(() => setShowTour(true), 300);
          }}
        />
      )}
      
      {showTour && (
        <OnboardingTour
          onComplete={() => setShowTour(false)}
        />
      )}
    </div>
  );
}

// Load chapter from cache or Bible API
async function loadChapter(moduleId: string, book: string, chapter: number) {
  const { getCachedChapter } = await import('@/lib/database');
  const { fetchChapter } = await import('@/lib/bible-api');
  
  // Check cache first
  const cached = await getCachedChapter(moduleId, book, chapter);
  
  if (cached) {
    return {
      book,
      chapter,
      verses: Object.entries(cached.verses).map(([num, text]) => ({
        ref: { book, chapter, verse: parseInt(num, 10) },
        text: text as string,
        html: text as string,
      })),
    };
  }
  
  // Fetch from Bible API (getBible, Biblia, or ESV)
  try {
    const chapterData = await fetchChapter(moduleId, book, chapter);
    return chapterData;
  } catch (error) {
    console.error(`Failed to load ${moduleId} ${book} ${chapter}:`, error);
    // Return empty chapter - UI will show verse numbers but no text
    return { book, chapter, verses: [] };
  }
}
