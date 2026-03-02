/**
 * Analyze Tools Panel
 *
 * Panel for analysis phase tools: Theme, Conclusions, Overview, Chapter, Timeline.
 */

import { useState, useEffect } from 'react';
import { getPreferences } from '@/lib/database';
import { useBibleStore } from '@/stores/bibleStore';
import { ConclusionTracker } from '@/components/Observation/ConclusionTracker';
import { BookOverview } from '@/components/Summary/BookOverview';
import { ChapterAtAGlance } from '@/components/Summary/ChapterAtAGlance';
import { Timeline } from '@/components/Summary/Timeline';
import type { VerseRef } from '@/types';

export type AnalyzeTab = 'conclusions' | 'overview' | 'chapter' | 'timeline';

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
  const [activeTab, setActiveTab] = useState<AnalyzeTab>(initialTab);
  const [disabledTools, setDisabledTools] = useState<string[]>([]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    getPreferences().then(prefs => {
      setDisabledTools(prefs.disabledTools || []);
    });
  }, []);

  const allTabs: { id: AnalyzeTab; label: string; icon: string }[] = [
    { id: 'chapter', label: 'Chapter', icon: '📄' },
    { id: 'conclusions', label: 'Conclusions', icon: '→' },
    { id: 'overview', label: 'Overview', icon: '📚' },
    { id: 'timeline', label: 'Timeline', icon: '📅' },
  ];

  const tabs = allTabs.filter(tab => !disabledTools.includes(tab.id));

  // If active tab got disabled, switch to first available
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some(t => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  const { currentBook, currentChapter, setLocation, setNavSelectedVerse } = useBibleStore();

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

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === 'conclusions' && (
          <div role="tabpanel" id="analyze-tabpanel-conclusions" aria-labelledby="analyze-tab-conclusions">
            <ConclusionTracker
              selectedText={selectedText}
              verseRef={verseRef}
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
        {activeTab === 'timeline' && (
          <div role="tabpanel" id="analyze-tabpanel-timeline" aria-labelledby="analyze-tab-timeline">
            <Timeline />
          </div>
        )}
      </div>
    </div>
  );
}
