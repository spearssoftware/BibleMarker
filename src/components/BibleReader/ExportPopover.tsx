/**
 * Export Popover
 *
 * Opened from the share/export button in the navigation bar. Lets the user
 * export the chapter passage (optionally a verse range) and/or the active
 * study's observation report as PDFs, via Tauri's native save dialog, then
 * auto-opens each in the system default PDF viewer.
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
  buildPassagePdf,
  getTranslationAttribution,
  openSavedPdf,
  passageFilename,
  type BuildPassagePdfInput,
} from '@/lib/passage-pdf';
import { buildStudyObservationPdf, observationFilename } from '@/lib/observation-pdf';
import { savePdfsToDirectory } from '@/lib/pdf/save';

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
  const activeStudy = useStudyStore((s) => s.studies.find((st) => st.id === s.activeStudyId) ?? null);
  const presets = useMarkingPresetStore((s) => s.presets);
  const exclusions = useKeywordExclusionStore((s) => s.exclusions);

  const firstVerse = verses[0]?.ref.verse ?? 1;
  const lastVerse = verses[verses.length - 1]?.ref.verse ?? firstVerse;

  // What to export: the chapter passage and/or the active study's observation
  // report. The study option only appears when a study is active.
  const [includeChapter, setIncludeChapter] = useState(true);
  const [includeStudy, setIncludeStudy] = useState(false);

  const [wholeChapter, setWholeChapter] = useState(true);
  const [startVerse, setStartVerse] = useState(firstVerse);
  const [endVerse, setEndVerse] = useState(lastVerse);
  const [action, setAction] = useState<ActionState>({ status: 'idle' });

  const nothingSelected = !includeChapter && !(includeStudy && activeStudy);

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
      // Load each piece independently so one failing query (e.g. headings or
      // title) can't blank out the others — notably notes, which would
      // otherwise silently drop from the export.
      const [ann, hd, nt, ct] = await Promise.allSettled([
        getChapterAnnotations(translation.id, book, chapter),
        getChapterHeadings(translation.id, book, chapter, activeStudyId),
        getChapterNotes(translation.id, book, chapter),
        getChapterTitle(translation.id, book, chapter, activeStudyId),
      ]);
      if (cancelled) return;

      if (ann.status === 'fulfilled') setAnnotations(ann.value);
      if (hd.status === 'fulfilled') setHeadings(hd.value);
      if (nt.status === 'fulfilled') setNotes(nt.value);
      if (ct.status === 'fulfilled') setChapterTitle(ct.value ?? null);

      const failed = [ann, hd, nt, ct].filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        for (const r of failed) console.error('[ExportPopover] chapter data load failed', (r as PromiseRejectedResult).reason);
        setAction({ status: 'error', message: 'Some chapter data could not be loaded.' });
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
    if (nothingSelected) return;
    setAction({ status: 'busy' });
    try {
      // Build every requested PDF first, then write them all to one chosen
      // folder so the user picks a destination only once.
      const files: Array<{ bytes: Uint8Array; filename: string }> = [];

      if (includeChapter) {
        const input: BuildPassagePdfInput = {
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
        };
        files.push({ bytes: await buildPassagePdf(input), filename: passageFilename(input) });
      }

      if (includeStudy && activeStudy) {
        files.push({ bytes: await buildStudyObservationPdf(activeStudy), filename: observationFilename(activeStudy) });
      }

      const result = await savePdfsToDirectory(files);
      if ('cancelled' in result) {
        setAction({ status: 'idle' });
        return;
      }

      setAction({ status: 'success', message: 'Saved — opening…' });
      for (const path of result.paths) {
        // On iOS the open call may succeed silently without launching a viewer.
        await openSavedPdf(path).catch((openErr) =>
          console.error('[ExportPopover] open after save failed', openErr));
      }
      setAction({
        status: 'success',
        message: result.paths.length > 1
          ? `Saved ${result.paths.length} PDFs to that folder`
          : `Saved to ${result.paths[0]}`,
      });
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
            label={`This chapter (${bookName} ${chapter})`}
            checked={includeChapter}
            onChange={(e) => setIncludeChapter(e.target.checked)}
          />

          {includeChapter && (
            <div className="ml-7 space-y-3">
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
            </div>
          )}

          {activeStudy && (
            <Checkbox
              label={`${activeStudy.name} study observations`}
              checked={includeStudy}
              onChange={(e) => setIncludeStudy(e.target.checked)}
            />
          )}

          <p className="text-xs text-scripture-muted leading-relaxed">
            The chapter PDF includes your marks, headings, and notes.
            {activeStudy && ' The study report lists your keywords, places, people, and more.'}
            {' '}You’ll pick a folder to save into (Downloads by default), then it opens in Preview.
          </p>

          <Button variant="primary" onClick={handleSave} disabled={busy || nothingSelected} fullWidth>
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
