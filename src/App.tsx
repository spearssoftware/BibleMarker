/**
 * Bible Study App
 * 
 * Main application component with SWORD module support.
 */

import { useEffect } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { NavigationBar, ChapterView } from '@/components/BibleReader';
import { Toolbar } from '@/components/MarkingToolbar';
import { loadSampleData } from '@/lib/sampleData';
import { getPreferences } from '@/lib/db';

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

  // Load sample data on mount
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
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

// Temporary chapter loader using sample data
async function loadChapter(book: string, chapter: number) {
  const { db } = await import('@/lib/db');
  const cacheKey = `WEB:${book}:${chapter}`;
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
  
  // Return empty chapter if no data
  return { book, chapter, verses: [] };
}
