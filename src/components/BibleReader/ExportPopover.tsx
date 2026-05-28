/**
 * Export Popover
 *
 * Opened from the share/export button in the navigation bar. Lets the user
 * pick a verse range within the active chapter, then opens the rendered
 * passage in the system browser — where Print, Save-as-PDF, and copy-to-
 * Word all work reliably. Tauri's WKWebView does none of those well, so
 * we hand the work to the OS's default browser instead.
 *
 * Hard-capped at one chapter for licensing reasons.
 */

import { useState } from 'react';
import { ModalBackdrop, Button, Select, Checkbox } from '@/components/shared';
import { useModal } from '@/hooks/useModal';
import { Z_INDEX } from '@/lib/modalConstants';
import { getBookById } from '@/types';
import type { Verse } from '@/types';
import type { ApiTranslation } from '@/lib/bible-api';
import {
  captureChapterHtml,
  getTranslationAttribution,
  openHtmlInBrowser,
} from '@/lib/passage-capture';

interface ExportPopoverProps {
  translation: ApiTranslation;
  book: string;
  chapter: number;
  verses: Verse[];
  onClose: () => void;
}

type ActionState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'error'; message: string }
  | { status: 'success'; message: string };

export function ExportPopover({ translation, book, chapter, verses, onClose }: ExportPopoverProps) {
  const firstVerse = verses[0]?.ref.verse ?? 1;
  const lastVerse = verses[verses.length - 1]?.ref.verse ?? firstVerse;

  const [wholeChapter, setWholeChapter] = useState(true);
  const [startVerse, setStartVerse] = useState(firstVerse);
  const [endVerse, setEndVerse] = useState(lastVerse);
  const [action, setAction] = useState<ActionState>({ status: 'idle' });

  const { handleBackdropClick } = useModal({
    isOpen: true,
    onClose,
    lockScroll: false,
    handleEscape: true,
  });

  const verseOptions = verses.map((v) => ({
    value: String(v.ref.verse),
    label: String(v.ref.verse),
  }));

  const onStartChange = (val: string) => {
    const n = Number(val);
    setStartVerse(n);
    if (n > endVerse) setEndVerse(n);
  };
  const onEndChange = (val: string) => {
    const n = Number(val);
    setEndVerse(n);
    if (n < startVerse) setStartVerse(n);
  };

  const handleOpen = async () => {
    setAction({ status: 'busy' });
    try {
      const verseRange = wholeChapter ? undefined : { start: startVerse, end: endVerse };
      const { html, pageTitle } = captureChapterHtml({
        translation,
        book,
        chapter,
        verseRange,
      });
      await openHtmlInBrowser(html, pageTitle);
      setAction({ status: 'success', message: 'Opened in your browser. Print, Save as PDF, or copy from there.' });
    } catch (err) {
      console.error('[ExportPopover] open failed', err);
      const msg = err instanceof Error ? err.message : 'Could not open the page.';
      setAction({ status: 'error', message: msg });
    }
  };

  const bookName = getBookById(book)?.name ?? book;
  const attribution = getTranslationAttribution(translation);
  const busy = action.status === 'busy';

  return (
    <>
      <ModalBackdrop onClick={handleBackdropClick} zIndex={Z_INDEX.BACKDROP} />

      <div
        className="fixed top-[60px] left-4 right-4 sm:left-auto sm:right-4 sm:w-[22rem]
                   bg-scripture-surface rounded-2xl shadow-modal dark:shadow-modal-dark animate-slide-down
                   max-h-[80vh] overflow-y-auto custom-scrollbar mt-safe-top"
        style={{ zIndex: Z_INDEX.MODAL }}
        role="dialog"
        aria-modal="true"
        aria-label="Export page"
      >
        <div className="flex items-center justify-between p-4 border-b border-scripture-border/30">
          <h2 className="text-lg font-semibold text-scripture-text">Export {bookName} {chapter}</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-full hover:bg-scripture-elevated transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-scripture-muted" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          <Checkbox
            label="Whole chapter"
            checked={wholeChapter}
            onChange={(e) => setWholeChapter(e.target.checked)}
          />

          {!wholeChapter && (
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="From verse"
                options={verseOptions}
                value={String(startVerse)}
                onChange={(e) => onStartChange(e.target.value)}
              />
              <Select
                label="To verse"
                options={verseOptions}
                value={String(endVerse)}
                onChange={(e) => onEndChange(e.target.value)}
              />
            </div>
          )}

          <p className="text-xs text-scripture-muted leading-relaxed">
            Opens the page in your default browser. From there you can Print,
            Save as PDF, or select-all and paste into Word, Pages, or Google Docs.
          </p>

          <Button variant="primary" onClick={handleOpen} disabled={busy} fullWidth>
            {busy ? 'Opening…' : 'Open in browser'}
          </Button>

          {action.status === 'success' && (
            <p className="text-xs text-scripture-success" role="status">{action.message}</p>
          )}
          {action.status === 'error' && (
            <p className="text-xs text-scripture-error" role="alert">{action.message}</p>
          )}

          <div className="pt-3 border-t border-scripture-border/30">
            <p className="text-[11px] text-scripture-muted leading-relaxed">{attribution}</p>
          </div>
        </div>
      </div>
    </>
  );
}
