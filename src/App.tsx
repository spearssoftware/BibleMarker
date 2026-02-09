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
import { isICloudAvailable } from '@/lib/platform';
import { initializeSync } from '@/lib/sync';

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

  // Load preferences and initialize stores on mount
  useEffect(() => {
    async function loadPrefs() {
      try {
        // Ensure database is initialized (schema migrations) before any queries
        await initDatabase();
        const prefs = await getPreferences();
        if (prefs.fontSize) {
          setFontSize(prefs.fontSize);
        }
        
        // Initialize debug flags cache so getDebugFlagsSync() works
        await getDebugFlags();
        
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
    
    // Initialize study, multi-translation, and list stores
    loadStudies();
    loadActiveView();
    loadLists();

    // Start auto-backup service
    autoBackupService.start();
    
    // Initialize iCloud sync on Apple platforms
    if (isICloudAvailable()) {
      initializeSync().catch(err => {
        console.error('[App] Failed to initialize iCloud sync:', err);
      });
    }

    // Cleanup: stop auto-backup service on unmount
    return () => {
      autoBackupService.stop();
    };
  }, [setFontSize, loadStudies, loadActiveView, loadLists]);

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

  // Load sample data and API configs on mount, initialize module ID if needed
  useEffect(() => {
    async function init() {
      try {
        // Load Bible API configurations (getBible, Biblia, ESV API, etc.)
        await loadApiConfigs();
        
        // Load sample data for backwards compatibility
        await loadSampleData();
        
        // Check if current module ID is valid, if not reset to default
        // Don't load chapter here - let the second useEffect handle it
        const { currentModuleId: existingModuleId } = useBibleStore.getState();
        const { activeView } = useMultiTranslationStore.getState();
        
        // Only set default if no translation is currently selected and no active view exists
        if ((!existingModuleId || existingModuleId.includes('undefined') || 
            existingModuleId.trim() === '') &&
            (!activeView || activeView.translationIds.length === 0)) {
          // Check for default translation preference
          const prefs = await getPreferences();
          const defaultTranslation = prefs.defaultTranslation;
          
          if (defaultTranslation) {
            // Use the default translation from preferences
            setCurrentModule(defaultTranslation);
            // Also add it to the multi-translation view
            const { addTranslation } = useMultiTranslationStore.getState();
            await addTranslation(defaultTranslation);
          } else {
            // Fall back to KJV if no default is set
            setCurrentModule('kjv');
            const { addTranslation } = useMultiTranslationStore.getState();
            await addTranslation('kjv');
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
