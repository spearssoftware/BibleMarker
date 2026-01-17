/**
 * Bible Study App
 * 
 * Main application component with Bible API support (getBible, Biblia, ESV).
 */

import { useEffect } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { NavigationBar, ChapterView } from '@/components/BibleReader';
import { Toolbar } from '@/components/MarkingToolbar';
import { loadSampleData } from '@/lib/sampleData';
import { getPreferences } from '@/lib/db';
import { loadApiConfigs } from '@/lib/bible-api';

export default function App() {
  const { setChapter, currentBook, currentChapter, currentModuleId, setLoading, setError } = useBibleStore();

  const { setCurrentModule } = useBibleStore();
  const { setFontSize } = useAnnotationStore();

  // Load preferences on mount
  useEffect(() => {
    async function loadPrefs() {
      try {
        const prefs = await getPreferences();
        if (prefs.fontSize) {
          setFontSize(prefs.fontSize);
        }
      } catch (err) {
        console.error('Error loading preferences:', err);
      }
    }
    loadPrefs();
  }, [setFontSize]);

  // Load sample data and API configs on mount
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        // Load Bible API configurations (getBible, Biblia, ESV API, etc.)
        await loadApiConfigs();
        
        // Load sample data for backwards compatibility
        await loadSampleData();
        
        // Check if current module ID is valid, if not reset to default
        const { currentModuleId: existingModuleId } = useBibleStore.getState();
        if (!existingModuleId || existingModuleId.includes('undefined') || existingModuleId.trim() === '') {
          console.log('[App] Invalid module ID detected, resetting to kjv:', existingModuleId);
          // Set the module ID so annotations work (use getBible translation)
          const initialModuleId = 'kjv';
          setCurrentModule(initialModuleId);
          // Load initial chapter
          const chapter = await loadChapter(initialModuleId, currentBook, currentChapter);
          setChapter(chapter);
        } else {
          // Module ID is valid, just load the chapter
          const chapter = await loadChapter(existingModuleId, currentBook, currentChapter);
          setChapter(chapter);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    }
    init();
  }, []);

  // Load chapter when location or module changes
  useEffect(() => {
    async function load() {
      if (!currentModuleId) {
        console.log('[App] No module ID, skipping load');
        return; // Don't load if no module selected
      }
      console.log('[App] Loading chapter:', { currentModuleId, currentBook, currentChapter });
      setLoading(true);
      // Clear chapter immediately to show loading state
      setChapter(null);
      try {
        const chapter = await loadChapter(currentModuleId, currentBook, currentChapter);
        console.log('[App] Chapter loaded:', { verseCount: chapter.verses.length, firstVerse: chapter.verses[0]?.text?.substring(0, 50) });
        setChapter(chapter);
      } catch (err) {
        console.error('[App] Error loading chapter:', err);
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    }
    load();
  }, [currentBook, currentChapter, currentModuleId, setChapter, setLoading, setError]);

  return (
    <div className="min-h-screen bg-scripture-bg text-scripture-text flex flex-col">
      {/* Top navigation */}
      <NavigationBar />

      {/* Main reading area */}
      <main className="flex-1 overflow-y-auto custom-scrollbar pb-32">
        <ChapterView />
      </main>

      {/* Bottom marking toolbar */}
      <Toolbar />
    </div>
  );
}

// Load chapter from cache or Bible API
async function loadChapter(moduleId: string, book: string, chapter: number) {
  const { db } = await import('@/lib/db');
  const { fetchChapter } = await import('@/lib/bible-api');
  
  // Check cache first
  const cacheKey = `${moduleId}:${book}:${chapter}`;
  const cached = await db.chapterCache.get(cacheKey);
  
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
