/**
 * Bible Study App
 * 
 * Main application component with SWORD module and Bible API support.
 */

import { useEffect } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { NavigationBar, ChapterView } from '@/components/BibleReader';
import { Toolbar } from '@/components/MarkingToolbar';
import { loadSampleData } from '@/lib/sampleData';
import { getPreferences } from '@/lib/db';
import { installBundledModules } from '@/lib/sword/bundledModules';
import { loadApiConfigs } from '@/lib/bible-api';

export default function App() {
  const { setChapter, currentBook, currentChapter, setLoading, setError } = useBibleStore();

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

  // Load sample data, bundled modules, and API configs on mount
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        // Load Bible API configurations (Biblia, ESV API, etc.)
        await loadApiConfigs();
        
        // Install bundled modules (WEB, KJV, ASV) - these are public domain
        // They're stored in public/modules/ and included in the app bundle
        // For desktop/iOS apps, this avoids CORS issues and works offline
        await installBundledModules();
        
        // Load sample data for backwards compatibility
        await loadSampleData();
        
        // Set the module ID so annotations work
        setCurrentModule('WEB');
        // Load initial chapter
        const chapter = await loadChapter(currentBook, currentChapter);
        setChapter(chapter);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    }
    init();
  }, []);

  // Load chapter when location changes
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const chapter = await loadChapter(currentBook, currentChapter);
        setChapter(chapter);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    }
    load();
  }, [currentBook, currentChapter, setChapter, setLoading, setError]);

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

// Load chapter from cache, Bible API, or SWORD module
async function loadChapter(book: string, chapter: number) {
  const { db } = await import('@/lib/db');
  const { useBibleStore } = await import('@/stores/bibleStore');
  const { readChapter } = await import('@/lib/sword/moduleReader');
  const { fetchChapter } = await import('@/lib/bible-api');
  
  // Get current module ID from store
  const moduleId = useBibleStore.getState().currentModuleId || 'WEB';
  
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
  
  // Check if this is an API-based translation (NASB, ESV, etc.)
  const isApiTranslation = moduleId.startsWith('eng-') || 
    ['NASB', 'ESV', 'NIV', 'NKJV'].includes(moduleId);
  
  if (isApiTranslation) {
    try {
      // Try to fetch from Bible API
      const chapterData = await fetchChapter(moduleId, book, chapter);
      return chapterData;
    } catch (error) {
      console.warn(`Bible API failed for ${moduleId}, trying SWORD fallback:`, error);
      // Fall through to SWORD module
    }
  }
  
  // Try to read from SWORD module
  try {
    const chapterData = await readChapter(moduleId, book, chapter);
    
    // Only cache if we got actual content
    if (chapterData.verses.some(v => v.text.trim())) {
      await db.chapterCache.put({
        id: cacheKey,
        moduleId,
        book,
        chapter,
        verses: Object.fromEntries(
          chapterData.verses.map(v => [v.ref.verse.toString(), v.text])
        ),
        cachedAt: new Date(),
      });
    }
    
    return chapterData;
  } catch (error) {
    // If module reading fails, check if module is installed
    const module = await db.modules.get(moduleId);
    if (!module || module.status !== 'installed') {
      // Module not installed - return empty with clear message
      console.warn(`Module ${moduleId} not installed or not ready`);
    } else {
      // Module is installed but chapter not available
      console.warn(`Failed to load ${moduleId} ${book} ${chapter}:`, error);
    }
    
    // Return empty chapter - UI will show verse numbers but no text
    return { book, chapter, verses: [] };
  }
}
