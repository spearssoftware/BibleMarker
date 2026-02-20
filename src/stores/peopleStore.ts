/**
 * People State Store
 *
 * Manages people and characters - creating/editing people, etc.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Person } from '@/types';
import { getAllPeople as dbGetAllPeople, savePerson as dbSavePerson, deletePerson as dbDeletePerson, getMarkingPreset } from '@/lib/database';
import type { VerseRef } from '@/types';
import { validatePerson, sanitizeData, ValidationError } from '@/lib/validation';
import { getAnnotationsBySymbolsWithPreset, getAnnotationText, getAnnotationVerseRef } from '@/lib/annotationQueries';
import { getSymbolsForTracker } from '@/lib/observationSymbols';

interface PeopleState {
  people: Person[];
  loadPeople: () => Promise<void>;
  createPerson: (name: string, verseRef: VerseRef, notes?: string, presetId?: string, annotationId?: string, studyId?: string) => Promise<Person>;
  updatePerson: (person: Person) => Promise<void>;
  deletePerson: (personId: string) => Promise<void>;
  getPerson: (personId: string) => Person | null;
  getPeopleByVerse: (verseRef: VerseRef) => Person[];
  getPeopleByBook: (book: string) => Person[];
  autoImportFromAnnotations: () => Promise<number>;
  autoPopulateFromChapter: (book: string, chapter: number, moduleId?: string) => Promise<number>;
  removeDuplicates: () => Promise<number>;
}

export const usePeopleStore = create<PeopleState>()(
  persist(
    (set, get) => ({
      people: [],

      loadPeople: async () => {
        const all = await dbGetAllPeople();
        set({ people: all });
      },

      createPerson: async (name, verseRef, notes, presetId, annotationId, studyId) => {
        const all = await dbGetAllPeople();
        const existing = all.find(p => {
          if (annotationId && p.annotationId === annotationId) return true;
          if (presetId && p.presetId === presetId &&
              p.verseRef.book === verseRef.book &&
              p.verseRef.chapter === verseRef.chapter &&
              p.verseRef.verse === verseRef.verse) return true;
          if (name.trim().toLowerCase() === p.name.trim().toLowerCase() &&
              p.verseRef.book === verseRef.book &&
              p.verseRef.chapter === verseRef.chapter &&
              p.verseRef.verse === verseRef.verse) return true;
          return false;
        });
        if (existing) return existing;

        const newPerson: Person = {
          id: crypto.randomUUID(),
          name: name.trim(),
          verseRef,
          notes: notes?.trim() || undefined,
          presetId,
          annotationId,
          studyId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        try {
          const validated = sanitizeData(newPerson, validatePerson);
          await dbSavePerson(validated);
          set({ people: [...all, validated] });
          return validated;
        } catch (error) {
          if (error instanceof ValidationError) {
            console.error('[createPerson] Validation error:', error.message, error.field, error.value);
            throw new Error(`Invalid person data: ${error.message}`);
          }
          throw error;
        }
      },

      updatePerson: async (person) => {
        try {
          const updated = {
            ...person,
            name: person.name.trim(),
            notes: person.notes?.trim() || undefined,
            updatedAt: new Date(),
          };
          const validated = sanitizeData(updated, validatePerson);
          await dbSavePerson(validated);
          const { people } = get();
          set({ people: people.map(p => p.id === person.id ? validated : p) });
        } catch (error) {
          if (error instanceof ValidationError) {
            console.error('[updatePerson] Validation error:', error.message, error.field, error.value);
            throw new Error(`Invalid person data: ${error.message}`);
          }
          throw error;
        }
      },

      deletePerson: async (personId) => {
        await dbDeletePerson(personId);
        const { people } = get();
        set({ people: people.filter(p => p.id !== personId) });
      },

      getPerson: (personId) => {
        const { people } = get();
        return people.find(p => p.id === personId) || null;
      },

      getPeopleByVerse: (verseRef) => {
        const { people } = get();
        return people.filter(p =>
          p.verseRef.book === verseRef.book &&
          p.verseRef.chapter === verseRef.chapter &&
          p.verseRef.verse === verseRef.verse
        );
      },

      getPeopleByBook: (book) => {
        const { people } = get();
        return people.filter(p => p.verseRef.book === book);
      },

      autoImportFromAnnotations: async () => {
        const peopleSymbols = getSymbolsForTracker('people');
        const annotations = await getAnnotationsBySymbolsWithPreset(peopleSymbols);
        const { people } = get();
        const existingIds = new Set(people.map(p => p.annotationId).filter((id): id is string => id !== undefined));
        let imported = 0;
        for (const ann of annotations) {
          if (!ann.id || existingIds.has(ann.id)) continue;
          let name = getAnnotationText(ann);
          if (ann.presetId) {
            const preset = await getMarkingPreset(ann.presetId);
            if (preset?.word) name = preset.word;
          }
          if (!name?.trim()) name = 'Person';
          const verseRef = getAnnotationVerseRef(ann);
          const existing = people.find(p =>
            p.name === name!.trim() &&
            p.verseRef.book === verseRef.book &&
            p.verseRef.chapter === verseRef.chapter &&
            p.verseRef.verse === verseRef.verse
          );
          if (existing) {
            if (!existing.annotationId && ann.id) {
              await get().updatePerson({
                ...existing,
                annotationId: ann.id,
                presetId: ann.presetId,
              });
            }
            continue;
          }
          const newPerson: Person = {
            id: crypto.randomUUID(),
            name: name.trim(),
            verseRef,
            presetId: ann.presetId,
            annotationId: ann.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          try {
            const validated = sanitizeData(newPerson, validatePerson);
            await dbSavePerson(validated);
            set({ people: [...people, validated] });
            imported++;
          } catch (error) {
            console.error('[autoImportFromAnnotations] Failed to import person:', error);
          }
        }
        return imported;
      },

      autoPopulateFromChapter: async (book, chapter, moduleId) => {
        const { people, createPerson } = get();
        const { useStudyStore } = await import('@/stores/studyStore');
        const activeStudyId = useStudyStore.getState().activeStudyId ?? undefined;
        const { getCachedChapter } = await import('@/lib/database');
        const chapterCache = await getCachedChapter(moduleId || '', book, chapter);
        if (!chapterCache?.verses) return 0;
        const { useMarkingPresetStore } = await import('@/stores/markingPresetStore');
        const { presets } = useMarkingPresetStore.getState();
        const peoplePresets = presets.filter(p =>
          p.word &&
          p.category === 'people' &&
          (p.highlight || p.symbol)
        );
        let total = 0;
        for (const [verseNum, verseText] of Object.entries(chapterCache.verses)) {
          const text = verseText as string;
          const verseNumInt = parseInt(verseNum, 10);
          if (isNaN(verseNumInt) || verseNumInt <= 0) continue;
          const verseRef = { book, chapter, verse: verseNumInt };
          for (const preset of peoplePresets) {
            if (preset.bookScope && preset.bookScope !== book) continue;
            if (preset.chapterScope !== undefined && preset.chapterScope !== chapter) continue;
            if (preset.moduleScope && preset.moduleScope !== moduleId) continue;
            const { findKeywordMatches } = await import('@/lib/keywordMatching');
            const matches = findKeywordMatches(text, verseRef, [preset], moduleId);
            if (matches.length === 0) continue;
            const existing = people.find(p =>
              p.presetId === preset.id &&
              p.verseRef.book === verseRef.book &&
              p.verseRef.chapter === verseRef.chapter &&
              p.verseRef.verse === verseRef.verse
            );
            if (!existing) {
              try {
                await createPerson(
                  preset.word || 'Person',
                  verseRef,
                  undefined,
                  preset.id,
                  undefined,
                  activeStudyId
                );
                total++;
              } catch (error) {
                console.error('[autoPopulateFromChapter] Failed to add person:', error);
              }
            }
          }
        }
        return total;
      },

      removeDuplicates: async () => {
        const all = await dbGetAllPeople();
        const seen = new Map<string, Person>();
        const duplicateIds: string[] = [];
        for (const p of all) {
          const annotationPart = p.annotationId ? `:${p.annotationId}` : '';
          const key = `${p.name.toLowerCase().trim()}:${p.verseRef.book}:${p.verseRef.chapter}:${p.verseRef.verse}${annotationPart}`;
          if (seen.has(key)) duplicateIds.push(p.id);
          else seen.set(key, p);
        }
        if (duplicateIds.length > 0) {
          await Promise.all(duplicateIds.map(id => dbDeletePerson(id)));
          const cleaned = await dbGetAllPeople();
          set({ people: cleaned });
        }
        return duplicateIds.length;
      },
    }),
    { name: 'people-store', partialize: (_state) => ({}) }
  )
);
