/**
 * Search Component
 * 
 * Search bar and results display for searching Bible text, notes, and annotations.
 */

import { useState, useEffect, useRef } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { searchAll, type SearchResult, type SearchScope } from '@/lib/search';
import { getBookById } from '@/types/bible';
import { useModal } from '@/hooks/useModal';
import { ModalBackdrop } from '@/components/shared';
import { Z_INDEX } from '@/lib/modalConstants';

interface SearchProps {
  onClose: () => void;
  onNavigate: (book: string, chapter: number, verse?: number) => void;
}

export function Search({ onClose, onNavigate }: SearchProps) {
  const { currentModuleId } = useBibleStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [scope, setScope] = useState<SearchScope>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Search when query or scope changes
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (query.trim()) {
        setIsSearching(true);
        try {
          const searchResults = await searchAll(query, scope, currentModuleId || undefined, 100);
          setResults(searchResults);
          setSelectedIndex(0);
        } catch (error) {
          console.error('Search error:', error);
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setResults([]);
      }
    }, 300); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [query, scope, currentModuleId]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        scrollToSelected();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        scrollToSelected();
      } else if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault();
        handleSelectResult(results[selectedIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSelectResult/scrollToSelected stable; key handler only needs results/selectedIndex
  }, [results, selectedIndex, onClose]);

  const { handleBackdropClick } = useModal({
    isOpen: true,
    onClose,
    lockScroll: true,
    handleEscape: true,
    initialFocusRef: inputRef,
  });

  const scrollToSelected = () => {
    const selectedElement = resultsRef.current?.querySelector(`[data-result-index="${selectedIndex}"]`);
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    onNavigate(result.book, result.chapter, result.verse);
    onClose();
  };

  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;
    
    const normalizedQuery = query.toLowerCase();
    const lowerText = text.toLowerCase();
    const index = lowerText.indexOf(normalizedQuery);
    
    if (index === -1) return text;
    
    return (
      <>
        {text.substring(0, index)}
        <mark className="bg-scripture-warningBg/60 text-scripture-text font-semibold">
          {text.substring(index, index + query.length)}
        </mark>
        {text.substring(index + query.length)}
      </>
    );
  };

  const getResultIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'verse':
        return '📖';
      case 'note':
        return '📝';
      default:
        return '🔍';
    }
  };

  return (
    <>
      {/* Backdrop */}
      <ModalBackdrop onClick={handleBackdropClick} zIndex={Z_INDEX.BACKDROP} />
      
      {/* Search Panel */}
      <div 
        className="fixed top-16 left-1/2
                    w-full max-w-2xl max-h-[80vh] overflow-hidden"
        style={{
          transform: 'translateX(-50%)',
          animation: 'searchScaleIn 0.2s ease-out',
          zIndex: Z_INDEX.MODAL,
        }}
        role="dialog"
                aria-label="Search Bible and notes"
        aria-modal="true"
      >
        <div className="bg-scripture-surface rounded-2xl shadow-2xl overflow-hidden mx-2 my-2">
        {/* Header */}
        <div className="p-4 border-b border-scripture-border/50">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
                <label htmlFor="search-input" className="sr-only">
                Search Bible, notes, or enter verse reference
              </label>
              <input
                id="search-input"
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Bible, notes... or enter verse reference (e.g., John 3:16)"
                className="w-full px-4 py-2.5 pl-10 rounded-xl bg-scripture-bg border border-scripture-border/50
                         text-scripture-text placeholder-scripture-muted focus:outline-none focus:ring-2
                         focus:ring-scripture-accent focus:border-transparent"
                aria-label="Search input"
              />
              <svg 
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-scripture-muted"
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-scripture-elevated transition-colors text-scripture-muted hover:text-scripture-text"
              aria-label="Close search"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scope selector */}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-scripture-muted font-ui">Search in:</span>
            {(['all', 'bible', 'notes'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-3 py-1 text-xs font-ui rounded-lg transition-colors
                          ${scope === s
                            ? 'bg-scripture-accent text-scripture-bg'
                            : 'bg-scripture-surface/80 text-scripture-text hover:bg-scripture-surface border border-scripture-border/50'}`}
                aria-label={`Search in ${s === 'all' ? 'all' : s}`}
                aria-pressed={scope === s}
              >
                {s === 'all' ? 'All' : s === 'bible' ? 'Bible' : 'Notes'}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div 
          ref={resultsRef}
          className="overflow-y-auto max-h-[calc(80vh-140px)] custom-scrollbar"
        >
          {isSearching ? (
            <div className="p-8 flex flex-col items-center justify-center gap-3">
              <div className="w-6 h-6 border-2 border-scripture-border border-t-scripture-accent rounded-full animate-spin"></div>
              <div className="text-scripture-muted text-sm">Searching...</div>
            </div>
          ) : results.length === 0 && query.trim() ? (
            <div className="p-8 text-center text-scripture-muted text-sm">
              No results found
            </div>
          ) : results.length > 0 ? (
            <div className="p-4 space-y-2">
              <div className="text-xs text-scripture-muted font-ui mb-2 px-2">
                {results.length} result{results.length !== 1 ? 's' : ''} found
              </div>
              {results.map((result, index) => {
                const bookInfo = getBookById(result.book);
                const isSelected = index === selectedIndex;
                
                return (
                  <button
                    key={`${result.type}-${result.book}-${result.chapter}-${result.verse}-${index}`}
                    data-result-index={index}
                    onClick={() => handleSelectResult(result)}
                    className={`w-full text-left p-3 rounded-lg border transition-all duration-200
                              ${isSelected
                                ? 'bg-scripture-accent/20 border-scripture-accent shadow-md'
                                : 'bg-scripture-surface/80 border-scripture-border/50 hover:bg-scripture-surface hover:shadow-sm'}`}
                    aria-label={`${bookInfo?.name || result.book} ${result.chapter}:${result.verse} - ${result.type}`}
                    aria-selected={isSelected}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg flex-shrink-0">{getResultIcon(result.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-scripture-text text-sm">
                            {bookInfo?.name || result.book} {result.chapter}:{result.verse}
                          </span>
                          <span className="text-xs text-scripture-muted uppercase">
                            {result.type}
                          </span>
                        </div>
                        <p className="text-sm text-scripture-text leading-relaxed line-clamp-2">
                          {result.context 
                            ? highlightText(result.context, query)
                            : highlightText(result.text, query)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-scripture-muted text-sm">
              Start typing to search...
            </div>
          )}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-scripture-border/50 text-xs text-scripture-muted font-ui text-center">
            Use ↑↓ to navigate, Enter to select, Esc to close
          </div>
        )}
        </div>
      </div>
    </>
  );
}
