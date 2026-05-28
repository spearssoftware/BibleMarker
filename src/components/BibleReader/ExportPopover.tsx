/**
 * Export Popover
 *
 * Opened from the share/export button in the navigation bar. Lets the user
 * pick a verse range within the active chapter, then saves a PDF of the
 * passage via Tauri's native save dialog and auto-opens it in the system
 * default PDF viewer.
 *
 * One chapter cap, copyright in the popover and on every PDF page footer.
 */

import { useEffect, useState } from 'react';
import { ModalBackdrop, Button, Select, Checkbox } from '@/components/shared';
import { useModal } from '@/hooks/useModal';
import { Z_INDEX } from '@/lib/modalConstants';
import { getBookById } from '@/types';
import type { Annotation, ChapterTitle, Note, SectionHeading, Verse } from '@/types';
import type { ApiTranslation } from '@/lib/bible-api';
import {
  getChapterAnnotations,
  getChapterHeadings,
  getChapterNotes,
  getChapterTitle,
} from '@/lib/database';
import { useStudyStore } from '@/stores/studyStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useKeywordExclusionStore } from '@/stores/keywordExclusionStore';
import {
  getTranslationAttribution,
  openSavedPdf,
  savePassagePdf,
} from '@/lib/passage-pdf';

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
  const { activeStudyId } = useStudyStore();
  const presets = useMarkingPresetStore((s) => s.presets);
  const exclusions = useKeywordExclusionStore((s) => s.exclusions);

  const firstVerse = verses[0]?.ref.verse ?? 1;
  const lastVerse = verses[verses.length - 1]?.ref.verse ?? firstVerse;

  const [wholeChapter, setWholeChapter] = useState(true);
  const [startVerse, setStartVerse] = useState(firstVerse);
  const [endVerse, setEndVerse] = useState(lastVerse);
  const [action, setAction] = useState<ActionState>({ status: 'idle' });

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [headings, setHeadings] = useState<SectionHeading[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [chapterTitle, setChapterTitle] = useState<ChapterTitle | null>(null);

  const { handleBackdropClick } = useModal({
    isOpen: true,
    onClose,
    lockScroll: false,
    handleEscape: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ann, hd, nt, ct] = await Promise.all([
          getChapterAnnotations(translation.id, book, chapter),
          getChapterHeadings(translation.id, book, chapter, activeStudyId),
          getChapterNotes(translation.id, book, chapter),
          getChapterTitle(translation.id, book, chapter, activeStudyId),
        ]);
        if (cancelled) return;
        setAnnotations(ann);
        setHeadings(hd);
        setNotes(nt);
        setChapterTitle(ct ?? null);
      } catch (err) {
        if (cancelled) return;
        console.error('[ExportPopover] failed to load chapter metadata', err);
        setAction({ status: 'error', message: 'Could not load chapter data.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [translation.id, book, chapter, activeStudyId]);

  const verseOptions = verses.map((v) => ({ value: String(v.ref.verse), label: String(v.ref.verse) }));

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

  const handleSave = async () => {
    setAction({ status: 'busy' });
    try {
      const result = await savePassagePdf({
        translation,
        book,
        chapter,
        verses,
        annotations,
        notes,
        sectionHeadings: headings,
        chapterTitle,
        verseRange: wholeChapter ? undefined : { start: startVerse, end: endVerse },
        presets,
        exclusions,
        activeStudyId,
      });
      if ('cancelled' in result) {
        setAction({ status: 'idle' });
        return;
      }
      setAction({ status: 'success', message: 'Saved — opening…' });
      try {
        await openSavedPdf(result.path);
        // On iOS the open call may succeed silently without launching a
        // viewer; show the path so the user knows where the file lives.
        setAction({ status: 'success', message: `Saved to ${result.path}` });
      } catch (openErr) {
        console.error('[ExportPopover] open after save failed', openErr);
        setAction({ status: 'success', message: `Saved to ${result.path}` });
      }
    } catch (err) {
      console.error('[ExportPopover] save failed', err);
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
              ? err.message
              : JSON.stringify(err);
      setAction({ status: 'error', message: msg || 'Could not save the PDF.' });
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
            Saves a PDF of the passage with your marks, headings, and notes.
            Opens in Preview so you can print, attach to email, or copy text into Word.
          </p>

          <Button variant="primary" onClick={handleSave} disabled={busy} fullWidth>
            {busy ? 'Saving…' : 'Save as PDF'}
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
