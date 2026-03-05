/**
 * Analyze Tools Panel
 *
 * Panel for analysis phase tools: Theme, Conclusions, Overview, Chapter, Timeline.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { getPreferences } from '@/lib/database';
import { useBibleStore } from '@/stores/bibleStore';
import { ConclusionTracker } from '@/components/Observation/ConclusionTracker';
import { BookOverview } from '@/components/Summary/BookOverview';
import { ChapterAtAGlance } from '@/components/Summary/ChapterAtAGlance';
import { ThemeTracker } from '@/components/Summary/ThemeTracker';
import { Timeline } from '@/components/Summary/Timeline';
import { PlaceMap } from '@/components/Observation/PlaceMap';
import { usePlaceStore } from '@/stores/placeStore';
import { useStudyStore } from '@/stores/studyStore';
import { Checkbox } from '@/components/shared';
import type { Place, VerseRef } from '@/types';

export type AnalyzeTab = 'conclusions' | 'overview' | 'chapter' | 'themes' | 'timeline' | 'places-map';

interface AnalyzeToolsPanelProps {
  onClose: () => void;
  initialTab?: AnalyzeTab;
  selectedText?: string;
  verseRef?: VerseRef;
}

export function AnalyzeToolsPanel({
  onClose: _onClose,
  initialTab = 'chapter',
  selectedText,
  verseRef,
}: AnalyzeToolsPanelProps) {
  const [activeTab, setActiveTabRaw] = useState<AnalyzeTab>(initialTab);
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const setActiveTab = (tab: AnalyzeTab) => {
    setIsCreating(false);
    setActiveTabRaw(tab);
  };

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    getPreferences().then((prefs) => {
      setDisabledTools(prefs.disabledTools || []);
    });
  }, []);

  const allTabs: { id: AnalyzeTab; label: string; icon: string }[] = [
    { id: 'chapter', label: 'Chapter', icon: '📄' },
    { id: 'overview', label: 'Overview', icon: '📚' },
    { id: 'timeline', label: 'Timeline', icon: '📅' },
    { id: 'places-map', label: 'Places', icon: '🗺️' },
    { id: 'themes', label: 'Themes', icon: '🔍' },
    { id: 'conclusions', label: 'Conclusions', icon: '→' },
  ];

  const tabs = allTabs.filter(tab => !disabledTools.includes(tab.id));

  // If active tab got disabled, switch to first available
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some(t => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  const { currentBook, currentChapter, setLocation, setNavSelectedVerse, currentModuleId } = useBibleStore();
  const primaryModuleId = currentModuleId || '';
  const { places, loadPlaces, autoPopulateFromChapter } = usePlaceStore();
  const { activeStudyId } = useStudyStore();
  const [filterByChapter, setFilterByChapter] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const handleNavigateToVerse = (ref: VerseRef) => {
    if (ref.book !== currentBook || ref.chapter !== currentChapter) {
      setLocation(ref.book, ref.chapter);
      setTimeout(() => {
        setNavSelectedVerse(ref.verse);
        const el = document.querySelector(`[data-verse="${ref.verse}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => setNavSelectedVerse(null), 3000);
      }, 100);
    } else {
      setNavSelectedVerse(ref.verse);
      const el = document.querySelector(`[data-verse="${ref.verse}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setNavSelectedVerse(null), 3000);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative" role="dialog" aria-label="Analyze Tools" aria-modal="true">
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0 border-b border-scripture-border/30">
        <div role="tablist" aria-label="Analyze tools sections">
          <div className="flex gap-1 sm:gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                id={`analyze-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`analyze-tabpanel-${tab.id}`}
                title={tab.label}
                className={`
                  px-2 sm:px-3 py-1.5 rounded-lg text-sm font-ui font-medium transition-all whitespace-nowrap
                  flex items-center justify-center gap-1
                  ${activeTab === tab.id
                    ? 'bg-scripture-accent text-scripture-bg shadow-md'
                    : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'
                  }
                `}
              >
                <span className="text-base" aria-hidden="true">{tab.icon}</span>
                <span className={`text-xs ${activeTab === tab.id ? 'inline' : 'hidden sm:inline'}`}>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action bar */}
      {(activeTab === 'conclusions' || activeTab === 'places-map') && (
        <div className="flex items-center gap-3 px-4 py-2 flex-shrink-0 border-b border-scripture-border/30">
          {activeTab === 'conclusions' && (
            <button
              onClick={() => setIsCreating(true)}
              disabled={isCreating}
              className="px-3 py-1.5 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              + New Conclusion
            </button>
          )}
          <Checkbox
            label="Current Chapter Only"
            checked={filterByChapter}
            onChange={(e) => setFilterByChapter(e.target.checked)}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === 'conclusions' && (
          <div role="tabpanel" id="analyze-tabpanel-conclusions" aria-labelledby="analyze-tab-conclusions">
            <ConclusionTracker
              selectedText={selectedText}
              verseRef={verseRef}
              filterByChapter={filterByChapter}
              isCreating={isCreating}
              setIsCreating={setIsCreating}
              onNavigate={handleNavigateToVerse}
            />
          </div>
        )}
        {activeTab === 'overview' && (
          <div role="tabpanel" id="analyze-tabpanel-overview" aria-labelledby="analyze-tab-overview">
            <BookOverview onChapterClick={() => setActiveTab('chapter')} />
          </div>
        )}
        {activeTab === 'chapter' && (
          <div role="tabpanel" id="analyze-tabpanel-chapter" aria-labelledby="analyze-tab-chapter">
            <ChapterAtAGlance />
          </div>
        )}
        {activeTab === 'themes' && (
          <div role="tabpanel" id="analyze-tabpanel-themes" aria-labelledby="analyze-tab-themes">
            <ThemeTracker />
          </div>
        )}
        {activeTab === 'timeline' && (
          <div role="tabpanel" id="analyze-tabpanel-timeline" aria-labelledby="analyze-tab-timeline">
            <Timeline />
          </div>
        )}
        {activeTab === 'places-map' && (
          <PlacesMapPanel
            places={places}
            loadPlaces={loadPlaces}
            autoPopulateFromChapter={autoPopulateFromChapter}
            primaryModuleId={primaryModuleId}
            filterByChapter={filterByChapter}
            currentBook={currentBook}
            currentChapter={currentChapter}
            activeStudyId={activeStudyId}
          />
        )}
      </div>
    </div>
  );
}

/** Wrapper that filters places and provides a chapter toggle for the map */

interface PlacesMapPanelProps {
  places: Place[];
  loadPlaces: () => Promise<void>;
  autoPopulateFromChapter: (book: string, chapter: number, moduleId?: string) => Promise<number>;
  primaryModuleId: string;
  filterByChapter: boolean;
  currentBook: string | null;
  currentChapter: number | null;
  activeStudyId: string | null;
}

function PlacesMapPanel({
  places,
  loadPlaces,
  autoPopulateFromChapter,
  primaryModuleId,
  filterByChapter,
  currentBook,
  currentChapter,
  activeStudyId,
}: PlacesMapPanelProps) {
  const lastPopulatedChapter = useRef('');

  useEffect(() => {
    void loadPlaces();
  }, [loadPlaces]);

  useEffect(() => {
    if (!currentBook || !currentChapter || !primaryModuleId) return;
    const key = `${currentBook}:${currentChapter}:${primaryModuleId}`;
    if (lastPopulatedChapter.current === key) return;
    lastPopulatedChapter.current = key;
    void autoPopulateFromChapter(currentBook, currentChapter, primaryModuleId).then(count => {
      if (count > 0) void loadPlaces();
    });
  }, [currentBook, currentChapter, primaryModuleId, autoPopulateFromChapter, loadPlaces]);

  const filtered = useMemo(() => {
    let result = places;
    if (activeStudyId) {
      result = result.filter(p => !p.studyId || p.studyId === activeStudyId);
    }
    if (filterByChapter && currentBook && currentChapter) {
      result = result.filter(p => p.verseRef.book === currentBook && p.verseRef.chapter === currentChapter);
    }
    return result;
  }, [places, filterByChapter, currentBook, currentChapter, activeStudyId]);

  return (
    <div role="tabpanel" id="analyze-tabpanel-places-map" aria-labelledby="analyze-tab-places-map">
      <PlaceMap places={filtered} />
    </div>
  );
}
