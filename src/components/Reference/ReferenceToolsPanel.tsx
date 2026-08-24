import { useState } from 'react';
import { useInductiveToolsVisible } from '@/stores/preferencesStore';
import type { ReferenceTab } from '@/stores/panelStore';
import { ChapterEntitiesTab } from './ChapterEntitiesTab';
import { PersonDetail } from './PersonDetail';
import { PlaceDetail } from './PlaceDetail';
import { EventDetail } from './EventDetail';
import { TopicDetail } from './TopicDetail';
import { CrossRefsTab } from './CrossRefsTab';
import { OriginalLanguageTab } from './OriginalLanguageTab';
import { StrongsTab } from './StrongsTab';
import { SearchTab } from './SearchTab';

interface ReferenceToolsPanelProps {
  onClose: () => void;
  initialTab?: ReferenceTab;
  entitySlug?: string;
  searchQuery?: string;
  strongsNumber?: string;
  verse?: number;
}

/**
 * Tabs available in discovery-first (default) mode. Chapter and Search are
 * pull-based lookups with no interpretive payload; Strong's, Hebrew/Greek and
 * Cross-Refs need the inductive toolkit (Cross-Refs is also the raw form of
 * the Echo Hints discovery feature, so it stays behind the toggle for now).
 */
const DEFAULT_MODE_TABS: ReferenceTab[] = ['chapter', 'search'];

const TABS: { id: ReferenceTab; label: string; icon: string }[] = [
  { id: 'chapter', label: 'Chapter', icon: '📖' },
  { id: 'search', label: 'Search', icon: '🔎' },
  { id: 'strongs', label: "Strong's", icon: '🔤' },
  { id: 'original-lang', label: 'Hebrew/Greek', icon: 'א' },
  { id: 'cross-refs', label: 'Cross-Refs', icon: '🔗' },
];

interface DetailView {
  type: string;
  slug: string;
}

export function ReferenceToolsPanel({ onClose: _onClose, initialTab = 'chapter', entitySlug, searchQuery, strongsNumber, verse }: ReferenceToolsPanelProps) {
  const inductiveToolsVisible = useInductiveToolsVisible();
  const visibleTabs = inductiveToolsVisible ? TABS : TABS.filter(t => DEFAULT_MODE_TABS.includes(t.id));

  const [activeTab, setActiveTab] = useState<ReferenceTab>(initialTab);
  const [prevInitialTab, setPrevInitialTab] = useState(initialTab);
  if (initialTab !== prevInitialTab) {
    setPrevInitialTab(initialTab);
    setActiveTab(initialTab);
  }

  // A hidden tab can still be requested (a deep link, or the toggle flipped
  // off while the panel was open) — fall back to the first visible one.
  const effectiveTab = visibleTabs.some(t => t.id === activeTab) ? activeTab : visibleTabs[0].id;

  // Seed the detail view from entitySlug so mounting with a slug works on mount;
  // the prevEntitySlug tracker below handles subsequent changes.
  const [detailView, setDetailView] = useState<DetailView | null>(
    entitySlug ? { type: 'search', slug: entitySlug } : null
  );
  const [prevEntitySlug, setPrevEntitySlug] = useState(entitySlug);
  if (entitySlug !== prevEntitySlug) {
    setPrevEntitySlug(entitySlug);
    if (entitySlug) {
      setDetailView({ type: 'search', slug: entitySlug });
    }
  }

  const navigateToDetail = (type: string, slug: string) => {
    setDetailView({ type, slug });
  };

  const navigateBack = () => {
    setDetailView(null);
  };

  const renderDetail = () => {
    if (!detailView) return null;

    switch (detailView.type) {
      case 'person':
        return <PersonDetail slug={detailView.slug} onNavigate={navigateToDetail} onBack={navigateBack} />;
      case 'place':
        return <PlaceDetail slug={detailView.slug} onNavigate={navigateToDetail} onBack={navigateBack} />;
      case 'event':
        return <EventDetail slug={detailView.slug} onNavigate={navigateToDetail} onBack={navigateBack} />;
      case 'topic':
        return <TopicDetail slug={detailView.slug} onNavigate={navigateToDetail} onBack={navigateBack} />;
      default:
        return (
          <div className="p-4">
            <button
              onClick={navigateBack}
              className="flex items-center gap-1 text-sm text-scripture-muted hover:text-scripture-text transition-colors mb-2"
            >
              ← Back
            </button>
            <p className="text-sm text-scripture-muted">No detail view for type: {detailView.type}</p>
          </div>
        );
    }
  };

  const renderTabContent = () => {
    switch (effectiveTab) {
      case 'chapter':
        return <ChapterEntitiesTab navigateToDetail={navigateToDetail} />;
      case 'search':
        return <SearchTab key={searchQuery} navigateToDetail={navigateToDetail} initialQuery={searchQuery} />;
      case 'cross-refs':
        return <CrossRefsTab key={verse} initialVerse={verse} />;
      case 'original-lang':
        return <OriginalLanguageTab key={verse} initialVerse={verse} />;
      case 'strongs':
        return <StrongsTab key={strongsNumber} initialNumber={strongsNumber} />;
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative" role="dialog" aria-label="Reference Tools" aria-modal="true">
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0 border-b border-scripture-border/30">
        <div role="tablist" aria-label="Reference tools sections" className="min-w-0">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setDetailView(null);
                }}
                role="tab"
                id={`reference-tab-${tab.id}`}
                aria-selected={effectiveTab === tab.id && !detailView}
                aria-controls={`reference-tabpanel-${tab.id}`}
                title={tab.label}
                className={`
                  px-2 sm:px-3 py-1.5 rounded-lg text-sm font-ui font-medium transition-all whitespace-nowrap
                  flex items-center justify-center gap-1
                  ${effectiveTab === tab.id && !detailView
                    ? 'bg-scripture-accent text-scripture-bg shadow-md'
                    : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'
                  }
                `}
              >
                <span className="text-base" aria-hidden="true">{tab.icon}</span>
                <span className={`text-xs ${effectiveTab === tab.id && !detailView ? 'inline' : 'hidden'}`}>
                  {tab.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
        {detailView ? (
          renderDetail()
        ) : (
          <div
            role="tabpanel"
            id={`reference-tabpanel-${effectiveTab}`}
            aria-labelledby={`reference-tab-${effectiveTab}`}
          >
            {renderTabContent()}
          </div>
        )}
      </div>
    </div>
  );
}
