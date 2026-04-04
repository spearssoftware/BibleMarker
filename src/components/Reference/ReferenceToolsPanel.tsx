import { useState, useEffect } from 'react';
import type { ReferenceTab } from '@/stores/panelStore';
import { ChapterEntitiesTab } from './ChapterEntitiesTab';
import { PeopleTab } from './PeopleTab';
import { PersonDetail } from './PersonDetail';
import { PlacesTab } from './PlacesTab';
import { PlaceDetail } from './PlaceDetail';
import { EventsTab } from './EventsTab';
import { EventDetail } from './EventDetail';
import { TopicsTab } from './TopicsTab';
import { TopicDetail } from './TopicDetail';
import { StrongsTab } from './StrongsTab';
import { DictionaryTab } from './DictionaryTab';
import { SearchTab } from './SearchTab';

interface ReferenceToolsPanelProps {
  onClose: () => void;
  initialTab?: ReferenceTab;
  entitySlug?: string;
}

const TABS: { id: ReferenceTab; label: string; icon: string }[] = [
  { id: 'chapter', label: 'Chapter', icon: '📖' },
  { id: 'people', label: 'People', icon: '👤' },
  { id: 'places', label: 'Places', icon: '📍' },
  { id: 'events', label: 'Events', icon: '📅' },
  { id: 'topics', label: 'Topics', icon: '💡' },
  { id: 'strongs', label: "Strong's", icon: '🔤' },
  { id: 'dictionary', label: 'Dictionary', icon: '📕' },
  { id: 'search', label: 'Search', icon: '🔎' },
];

interface DetailView {
  type: string;
  slug: string;
}

export function ReferenceToolsPanel({ onClose: _onClose, initialTab = 'chapter', entitySlug }: ReferenceToolsPanelProps) {
  const [activeTab, setActiveTab] = useState<ReferenceTab>(initialTab);
  const [detailView, setDetailView] = useState<DetailView | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (entitySlug) {
      setDetailView({ type: 'person', slug: entitySlug });
    }
  }, [entitySlug]);

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
    switch (activeTab) {
      case 'chapter':
        return <ChapterEntitiesTab navigateToDetail={navigateToDetail} />;
      case 'people':
        return <PeopleTab navigateToDetail={navigateToDetail} />;
      case 'places':
        return <PlacesTab navigateToDetail={navigateToDetail} />;
      case 'events':
        return <EventsTab navigateToDetail={navigateToDetail} />;
      case 'topics':
        return <TopicsTab navigateToDetail={navigateToDetail} />;
      case 'strongs':
        return <StrongsTab />;
      case 'dictionary':
        return <DictionaryTab />;
      case 'search':
        return <SearchTab navigateToDetail={navigateToDetail} />;
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative" role="dialog" aria-label="Reference Tools" aria-modal="true">
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0 border-b border-scripture-border/30">
        <div role="tablist" aria-label="Reference tools sections" className="min-w-0">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setDetailView(null);
                }}
                role="tab"
                id={`reference-tab-${tab.id}`}
                aria-selected={activeTab === tab.id && !detailView}
                aria-controls={`reference-tabpanel-${tab.id}`}
                title={tab.label}
                className={`
                  px-2 sm:px-3 py-1.5 rounded-lg text-sm font-ui font-medium transition-all whitespace-nowrap
                  flex items-center justify-center gap-1
                  ${activeTab === tab.id && !detailView
                    ? 'bg-scripture-accent text-scripture-bg shadow-md'
                    : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'
                  }
                `}
              >
                <span className="text-base" aria-hidden="true">{tab.icon}</span>
                <span className={`text-xs ${activeTab === tab.id && !detailView ? 'inline' : 'hidden'}`}>
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
            id={`reference-tabpanel-${activeTab}`}
            aria-labelledby={`reference-tab-${activeTab}`}
          >
            {renderTabContent()}
          </div>
        )}
      </div>
    </div>
  );
}
