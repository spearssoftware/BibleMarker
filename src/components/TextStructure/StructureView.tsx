/**
 * Structure View
 *
 * Lists all structures for the current chapter and provides a button
 * to create new ones. Renders StructureEditor for each structure.
 */

import { useEffect, useState, useCallback } from 'react';
import { useTextStructureStore } from '@/stores/textStructureStore';
import { generateStructure } from '@/lib/conjunction-parser';
import { Button } from '@/components/shared';
import { StructureEditor } from './StructureEditor';
import { VerseRangePicker } from './VerseRangePicker';
import type { Verse } from '@/types';

interface StructureViewProps {
  moduleId: string;
  book: string;
  chapter: number;
  /** All verses for this chapter (used for auto-suggest on creation) */
  verses: Verse[];
}

export function StructureView({ moduleId, book, chapter, verses }: StructureViewProps) {
  const {
    structures,
    loadStructures,
    getStructuresForChapter,
    createStructure,
    updateStructure,
    deleteStructure,
  } = useTextStructureStore();

  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    loadStructures();
    // loadStructures is a stable Zustand action
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chapterStructures = getStructuresForChapter(moduleId, book, chapter);
  const occupiedRanges = chapterStructures.map(s => ({ startVerse: s.startVerse, endVerse: s.endVerse }));

  const handleCreate = useCallback(async (startVerse: number, endVerse: number) => {
    setShowPicker(false);
    const rangeVerses = verses.filter(v => v.ref.verse >= startVerse && v.ref.verse <= endVerse);
    const lines = generateStructure(
      rangeVerses.map(v => ({ verse: v.ref.verse, text: v.text }))
    );
    await createStructure({ moduleId, book, chapter, startVerse, endVerse, lines });
  }, [verses, moduleId, book, chapter, createStructure]);

  const handleReset = useCallback(async (structureId: string) => {
    const structure = structures.find(s => s.id === structureId);
    if (!structure) return;
    const rangeVerses = verses.filter(
      v => v.ref.verse >= structure.startVerse && v.ref.verse <= structure.endVerse
    );
    const lines = generateStructure(
      rangeVerses.map(v => ({ verse: v.ref.verse, text: v.text }))
    );
    await updateStructure({ ...structure, lines });
  }, [structures, verses, updateStructure]);

  return (
    <div className="px-4 py-4 max-w-3xl mx-auto">
      {chapterStructures.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <p className="text-scripture-muted text-sm">No structures yet for this chapter.</p>
          <Button variant="primary" onClick={() => setShowPicker(true)}>Create Structure</Button>
        </div>
      ) : (
        <>
          {[...chapterStructures]
            .sort((a, b) => a.startVerse - b.startVerse)
            .map(structure => (
              <StructureEditor
                key={structure.id}
                structure={structure}
                onUpdate={updateStructure}
                onDelete={() => deleteStructure(structure.id)}
                onReset={() => handleReset(structure.id)}
              />
            ))}
          <div className="flex justify-center mt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowPicker(true)}>
              + New Structure
            </Button>
          </div>
        </>
      )}

      {showPicker && (
        <VerseRangePicker
          book={book}
          chapter={chapter}
          occupiedRanges={occupiedRanges}
          onConfirm={handleCreate}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
