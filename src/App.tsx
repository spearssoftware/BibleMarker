/**
 * BibleMarker
 *
 * Main application component with SWORD modules and ESV API support.
 */

import { useEffect, useState } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useStudyStore } from '@/stores/studyStore';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { useListStore } from '@/stores/listStore';
import { useKeywordExclusionStore } from '@/stores/keywordExclusionStore';
import { NavigationBar } from '@/components/BibleReader';
import { MultiTranslationView } from '@/components/BibleReader/MultiTranslationView';
import { Toolbar } from '@/components/MarkingToolbar';
import { SplitLayout, PanelContainer } from '@/components/SplitLayout';
import { useLayoutOrientation } from '@/hooks/useLayoutOrientation';
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
import { useUndoToastStore } from '@/stores/undoToastStore';
import { UndoToast } from '@/components/shared';
import { initializeSync, shutdownSync } from '@/lib/sync';
import { checkForUpdateIfDue, fetchWhatsNew, fetchWhatsNewForced } from '@/lib/updateCheck';
import { isCapacitor } from '@/lib/platform';
import { UpdateBanner, WhatsNewModal } from '@/components/shared';

function GlobalUndoToast() {
  const { message, onUndo, dismiss } = useUndoToastStore();
  if (!message || !onUndo) return null;
  return (
    <UndoToast
      message={message}
      onUndo={() => { onUndo(); dismiss(); }}
      onDismiss={dismiss}
    />
  );
}

export default function App() {
  const { setChapter, currentBook, currentChapter, currentModuleId, setLoading, setError } = useBibleStore();

  const { setCurrentModule } = useBibleStore();
  const { setFontSize } = useAnnotationStore();
  const { loadStudies } = useStudyStore();
  const { loadActiveView } = useMultiTranslationStore();
  const { loadLists } = useListStore();
  const { loadExclusions } = useKeywordExclusionStore();
  
  // Onboarding state
  const [showWelcome, setShowWelcome] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);

  // Update check: show banner when new version available (respects checkForUpdates pref, 24h throttle)
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; url: string } | null>(null);
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);

  // What's New popup: shown once after updating to a new version
  const [whatsNew, setWhatsNew] = useState<{ version: string; notes: string[] } | null>(null);

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

  // Detect layout orientation for split-view panel
  useLayoutOrientation();

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
        // Load exclusions after DB is ready (needs v6 schema)
        loadExclusions();
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

      if (!isCapacitor()) {
        checkForUpdateIfDue().then(result => {
          if (result) {
            setUpdateAvailable({ version: result.version, url: result.url });
          }
        });
      }

      fetchWhatsNew().then(result => {
        if (result) setWhatsNew(result);
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

    const handleShowWhatsNew = async () => {
      const result = await fetchWhatsNewForced();
      if (result) setWhatsNew(result);
    };

    window.addEventListener('restartOnboarding', handleRestartOnboarding);
    window.addEventListener('showWhatsNew', handleShowWhatsNew);
    return () => {
      window.removeEventListener('restartOnboarding', handleRestartOnboarding);
      window.removeEventListener('showWhatsNew', handleShowWhatsNew);
    };
  }, []);

  // When sync applies remote changes, refresh UI and re-load API configs
  // (API keys may have synced from another device but loadApiConfigs ran before sync completed)
  useEffect(() => {
    const handleSyncDataChanged = async () => {
      const { loadApiConfigs } = await import('@/lib/bible-api');
      await loadApiConfigs();
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

        // Initialize gnosis in local mode if no API key was configured
        const { isGnosisAvailable, initGnosis } = await import('@/lib/gnosis');
        if (!isGnosisAvailable()) {
          await initGnosis({ mode: 'local' }).catch(err => {
            console.warn('[App] Gnosis local init failed (expected in dev):', err);
          });
        }
        
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
              // Use first installed SWORD module, or sword-KJV as fallback
              const { getAllTranslations: getAll } = await import('@/lib/bible-api');
              const available = await getAll();
              const firstSword = available.find(t => t.provider === 'sword');
              const fallback = firstSword?.id || 'sword-KJV';
              setCurrentModule(fallback);
              const { addTranslation } = useMultiTranslationStore.getState();
              await addTranslation(fallback);
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

      {/* Top navigation */}
      <NavigationBar />

      {/* Update available banner (below nav to avoid iOS status bar overlap) */}
      {updateAvailable && !updateBannerDismissed && (
        <UpdateBanner
          version={updateAvailable.version}
          url={updateAvailable.url}
          onDismiss={() => setUpdateBannerDismissed(true)}
        />
      )}

      {/* Main reading area with split panel */}
      <SplitLayout panel={<PanelContainer />}>
        <MultiTranslationView />
      </SplitLayout>

      {/* Bottom tab bar */}
      <Toolbar />

      {/* Undo toast */}
      <GlobalUndoToast />

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

      {whatsNew && !showWelcome && !showTour && (
        <WhatsNewModal
          version={whatsNew.version}
          notes={whatsNew.notes}
          onDismiss={() => setWhatsNew(null)}
        />
      )}
    </div>
  );
}

const FALLBACK_TRANSLATION = 'sword-KJV';

// Load chapter from SWORD module or ESV API
async function loadChapter(moduleId: string, book: string, chapter: number) {
  const { fetchChapter } = await import('@/lib/bible-api');

  try {
    const chapterData = await fetchChapter(moduleId, book, chapter);
    return chapterData;
  } catch (error) {
    console.error(`Failed to load ${moduleId} ${book} ${chapter}:`, error);

    // Try fallback (SWORD KJV if downloaded)
    if (moduleId !== FALLBACK_TRANSLATION) {
      try {
        const { isModuleDownloaded } = await import('@/lib/bible-api/sword');
        if (await isModuleDownloaded(FALLBACK_TRANSLATION)) {
          const fallback = await fetchChapter(FALLBACK_TRANSLATION, book, chapter);
          console.warn(`[App] Using ${FALLBACK_TRANSLATION} fallback for ${moduleId} ${book} ${chapter}`);
          return fallback;
        }
      } catch {
        // Fallback also failed
      }
    }

    return { book, chapter, verses: [] };
  }
}
