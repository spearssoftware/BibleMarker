import { usePanelStore, type PanelType } from '@/stores/panelStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { KeyWordManager } from '@/components/KeyWords';
import { ObservationToolsPanel } from '@/components/Observation';
import { AnalyzeToolsPanel } from '@/components/Analyze';
import { ReferenceToolsPanel } from '@/components/Reference';
import type { VerseRef } from '@/types';

const PANEL_TITLES: Record<PanelType, string> = {
  keywords: 'Mark',
  observe: 'Observe',
  analyze: 'Analyze',
  reference: 'Reference',
};

export function PanelContainer() {
  const {
    activePanel,
    isPinned,
    isCollapsed,
    orientation,
    keywordInitialWord,
    observeInitialTab,
    observeInitialListId,
    observeVerseRef,
    observeAutoCreate,
    analyzeInitialTab,
    analyzeThemeSearchTerm,
    referenceInitialTab,
    referenceEntitySlug,
    panelSelectedText,
    panelVerseRef,
    setPinned,
    setCollapsed,
    closePanel,
    notifyActionComplete,
  } = usePanelStore();

  const { selection, clearSelection } = useAnnotationStore();

  if (!activePanel) return null;

  const selectedText = selection?.text ?? panelSelectedText;
  const verseRef: VerseRef | undefined = selection
    ? { book: selection.book, chapter: selection.chapter, verse: selection.startVerse }
    : panelVerseRef;

  const isHorizontal = orientation === 'horizontal';
  const title = PANEL_TITLES[activePanel];

  const handleClose = () => {
    clearSelection();
    closePanel();
  };

  const handleKeywordPresetCreated = async () => {
    clearSelection();
    notifyActionComplete();
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-scripture-surface">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-scripture-surface border-b border-scripture-border/30">
        <span className="text-sm font-medium text-scripture-text">{title}</span>
        <div className="flex items-center gap-0.5">
          {/* Pin toggle */}
          <button
            onClick={() => setPinned(!isPinned)}
            className={`p-1.5 rounded transition-colors hover:bg-scripture-elevated/50 ${
              isPinned ? 'text-scripture-accent' : 'text-scripture-muted hover:text-scripture-text'
            }`}
            aria-label={isPinned ? 'Unpin panel' : 'Pin panel'}
            title={isPinned ? 'Unpin panel' : 'Pin panel'}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/>
            </svg>
          </button>

          {/* Collapse (only when pinned) */}
          {isPinned && (
            <button
              onClick={() => setCollapsed(!isCollapsed)}
              className="p-1.5 rounded text-scripture-muted hover:text-scripture-text hover:bg-scripture-elevated/50 transition-colors"
              aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
              title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {isHorizontal ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
                </svg>
              )}
            </button>
          )}

          {/* Close */}
          <button
            onClick={handleClose}
            className="p-1.5 rounded text-scripture-muted hover:text-scripture-text hover:bg-scripture-elevated/50 transition-colors"
            aria-label="Close panel"
            title="Close panel"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Panel body — panels handle their own internal scrolling */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activePanel === 'keywords' && (
          <KeyWordManager
            onClose={handleClose}
            initialWord={keywordInitialWord}
            onPresetCreated={handleKeywordPresetCreated}
          />
        )}
        {activePanel === 'observe' && (
          <ObservationToolsPanel
            onClose={handleClose}
            initialTab={observeInitialTab}
            selectedText={selectedText}
            verseRef={verseRef ?? observeVerseRef}
            initialListId={observeInitialListId}
            autoCreate={observeAutoCreate}
          />
        )}
        {activePanel === 'analyze' && (
          <AnalyzeToolsPanel
            onClose={handleClose}
            initialTab={analyzeInitialTab}
            selectedText={selectedText}
            verseRef={verseRef}
            themeSearchTerm={analyzeThemeSearchTerm}
          />
        )}
        {activePanel === 'reference' && (
          <ReferenceToolsPanel
            onClose={handleClose}
            initialTab={referenceInitialTab}
            entitySlug={referenceEntitySlug}
          />
        )}
      </div>
    </div>
  );
}
