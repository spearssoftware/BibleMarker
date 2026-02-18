/**
 * Data Validation Utilities
 * 
 * Provides schema validation for all data types before saving to IndexedDB.
 * Prevents corrupted data and provides graceful error handling.
 */

import type { Annotation, TextAnnotation, SymbolAnnotation, SectionHeading, ChapterTitle, Note } from '@/types/annotation';
import type { MarkingPreset } from '@/types/keyWord';
import type { Study } from '@/types/study';
import type { MultiTranslationView } from '@/types/multiTranslation';
import type { ObservationList } from '@/types/list';
import type { FiveWAndHEntry } from '@/types/observation';
import type { Place } from '@/types/place';
import type { Person } from '@/types/person';
import type { InterpretationEntry } from '@/types/interpretation';
import type { ApplicationEntry } from '@/types/application';
import type { VerseRef } from '@/types/bible';
import { HIGHLIGHT_COLORS, SYMBOLS } from '@/types/annotation';

/** Validation error with details */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public value?: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate a verse reference
 */
function validateVerseRef(ref: unknown): ref is VerseRef {
  if (!ref || typeof ref !== 'object') {
    throw new ValidationError('Verse reference must be an object', 'ref', ref);
  }
  const r = ref as VerseRef;
  if (typeof r.book !== 'string' || r.book.trim() === '') {
    throw new ValidationError('Verse reference must have a valid book', 'ref.book', r.book);
  }
  if (typeof r.chapter !== 'number' || r.chapter < 1) {
    throw new ValidationError('Verse reference must have a valid chapter (>= 1)', 'ref.chapter', r.chapter);
  }
  if (typeof r.verse !== 'number' || r.verse < 1) {
    throw new ValidationError('Verse reference must have a valid verse (>= 1)', 'ref.verse', r.verse);
  }
  return true;
}

/**
 * Validate a date (can be Date object or ISO string)
 */
function validateDate(date: unknown, fieldName: string): Date {
  if (date instanceof Date) {
    if (isNaN(date.getTime())) {
      throw new ValidationError(`${fieldName} must be a valid date`, fieldName, date);
    }
    return date;
  }
  if (typeof date === 'string') {
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      throw new ValidationError(`${fieldName} must be a valid date string`, fieldName, date);
    }
    return parsed;
  }
  throw new ValidationError(`${fieldName} must be a Date or ISO string`, fieldName, date);
}

/**
 * Validate an annotation
 */
export function validateAnnotation(annotation: unknown): Annotation {
  if (!annotation || typeof annotation !== 'object') {
    throw new ValidationError('Annotation must be an object', 'annotation', annotation);
  }
  const a = annotation as Record<string, unknown>;

  // Required fields
  if (typeof a.id !== 'string' || (a.id as string).trim() === '') {
    throw new ValidationError('Annotation must have a valid id', 'id', a.id);
  }
  if (typeof a.moduleId !== 'string' || (a.moduleId as string).trim() === '') {
    throw new ValidationError('Annotation must have a valid moduleId', 'moduleId', a.moduleId);
  }
  if (!['highlight', 'textColor', 'underline', 'symbol'].includes(a.type as string)) {
    throw new ValidationError('Annotation must have a valid type', 'type', a.type);
  }

  // Validate dates
  validateDate(a.createdAt, 'createdAt');
  validateDate(a.updatedAt, 'updatedAt');

  // Type-specific validation
  if (a.type === 'symbol') {
    const symAnn = annotation as SymbolAnnotation;
    validateVerseRef(symAnn.ref);
    if (!symAnn.symbol || !(symAnn.symbol in SYMBOLS)) {
      throw new ValidationError('Symbol annotation must have a valid symbol', 'symbol', symAnn.symbol);
    }
    if (!['before', 'after', 'center'].includes(symAnn.position)) {
      throw new ValidationError('Symbol annotation must have a valid position', 'position', symAnn.position);
    }
    if (symAnn.color && !(symAnn.color in HIGHLIGHT_COLORS)) {
      throw new ValidationError('Symbol annotation must have a valid color if provided', 'color', symAnn.color);
    }
  } else {
    const textAnn = annotation as TextAnnotation;
    validateVerseRef(textAnn.startRef);
    validateVerseRef(textAnn.endRef);
    if (!(textAnn.color in HIGHLIGHT_COLORS)) {
      throw new ValidationError('Text annotation must have a valid color', 'color', textAnn.color);
    }
    if (textAnn.type === 'underline' && textAnn.underlineStyle) {
      if (!['solid', 'dashed', 'dotted', 'double', 'wavy'].includes(textAnn.underlineStyle)) {
        throw new ValidationError('Underline annotation must have a valid underline style', 'underlineStyle', textAnn.underlineStyle);
      }
    }
  }

  return annotation as Annotation;
}

/**
 * Validate a section heading
 */
export function validateSectionHeading(heading: unknown): SectionHeading {
  if (!heading || typeof heading !== 'object') {
    throw new ValidationError('Section heading must be an object', 'heading', heading);
  }
  const h = heading as SectionHeading;
  if (typeof h.id !== 'string' || h.id.trim() === '') {
    throw new ValidationError('Section heading must have a valid id', 'id', h.id);
  }
  // moduleId is optional (deprecated - section headings are now translation-agnostic)
  // Keep it for backward compatibility but don't require it
  if (typeof h.title !== 'string' || h.title.trim() === '') {
    throw new ValidationError('Section heading must have a valid title', 'title', h.title);
  }
  validateVerseRef(h.beforeRef);
  if (h.coversUntil) {
    validateVerseRef(h.coversUntil);
  }
  validateDate(h.createdAt, 'createdAt');
  validateDate(h.updatedAt, 'updatedAt');
  return h;
}

/**
 * Validate a chapter title
 */
export function validateChapterTitle(title: unknown): ChapterTitle {
  if (!title || typeof title !== 'object') {
    throw new ValidationError('Chapter title must be an object', 'title', title);
  }
  const t = title as ChapterTitle;
  if (typeof t.id !== 'string' || t.id.trim() === '') {
    throw new ValidationError('Chapter title must have a valid id', 'id', t.id);
  }
  // moduleId is optional (deprecated - chapter titles are now translation-agnostic)
  // Keep it for backward compatibility but don't require it
  if (typeof t.book !== 'string' || t.book.trim() === '') {
    throw new ValidationError('Chapter title must have a valid book', 'book', t.book);
  }
  if (typeof t.chapter !== 'number' || t.chapter < 1) {
    throw new ValidationError('Chapter title must have a valid chapter (>= 1)', 'chapter', t.chapter);
  }
  if (typeof t.title !== 'string' || t.title.trim() === '') {
    throw new ValidationError('Chapter title must have a valid title', 'title', t.title);
  }
  validateDate(t.createdAt, 'createdAt');
  validateDate(t.updatedAt, 'updatedAt');
  return t;
}

/**
 * Validate a note
 */
export function validateNote(note: unknown): Note {
  if (!note || typeof note !== 'object') {
    throw new ValidationError('Note must be an object', 'note', note);
  }
  const n = note as Note;
  if (typeof n.id !== 'string' || n.id.trim() === '') {
    throw new ValidationError('Note must have a valid id', 'id', n.id);
  }
  if (typeof n.moduleId !== 'string' || n.moduleId.trim() === '') {
    throw new ValidationError('Note must have a valid moduleId', 'moduleId', n.moduleId);
  }
  if (typeof n.content !== 'string') {
    throw new ValidationError('Note must have content', 'content', n.content);
  }
  validateVerseRef(n.ref);
  if (n.range) {
    validateVerseRef(n.range.start);
    validateVerseRef(n.range.end);
  }
  validateDate(n.createdAt, 'createdAt');
  validateDate(n.updatedAt, 'updatedAt');
  return n;
}

/**
 * Validate a marking preset
 */
export function validateMarkingPreset(preset: unknown): MarkingPreset {
  if (!preset || typeof preset !== 'object') {
    throw new ValidationError('Marking preset must be an object', 'preset', preset);
  }
  const p = preset as MarkingPreset;
  if (typeof p.id !== 'string' || p.id.trim() === '') {
    throw new ValidationError('Marking preset must have a valid id', 'id', p.id);
  }
  // Must have at least symbol or highlight
  if (!p.symbol && !p.highlight) {
    throw new ValidationError('Marking preset must have at least symbol or highlight', 'preset', preset);
  }
  if (p.symbol && !(p.symbol in SYMBOLS)) {
    throw new ValidationError('Marking preset must have a valid symbol if provided', 'symbol', p.symbol);
  }
  if (p.highlight) {
    if (typeof p.highlight !== 'object') {
      throw new ValidationError('Marking preset highlight must be an object', 'highlight', p.highlight);
    }
    if (!['highlight', 'textColor', 'underline'].includes(p.highlight.style)) {
      throw new ValidationError('Marking preset highlight must have a valid style', 'highlight.style', p.highlight.style);
    }
    if (!(p.highlight.color in HIGHLIGHT_COLORS)) {
      throw new ValidationError('Marking preset highlight must have a valid color', 'highlight.color', p.highlight.color);
    }
  }
  if (!Array.isArray(p.variants)) {
    throw new ValidationError('Marking preset must have variants array', 'variants', p.variants);
  }
  if (typeof p.autoSuggest !== 'boolean') {
    throw new ValidationError('Marking preset must have autoSuggest boolean', 'autoSuggest', p.autoSuggest);
  }
  if (typeof p.usageCount !== 'number' || p.usageCount < 0) {
    throw new ValidationError('Marking preset must have a valid usageCount (>= 0)', 'usageCount', p.usageCount);
  }
  // Validate scope constraints
  if (p.chapterScope !== undefined && !p.bookScope) {
    throw new ValidationError('Marking preset chapterScope requires bookScope', 'chapterScope', p.chapterScope);
  }
  validateDate(p.createdAt, 'createdAt');
  validateDate(p.updatedAt, 'updatedAt');
  return p;
}

/**
 * Validate a study
 */
export function validateStudy(study: unknown): Study {
  if (!study || typeof study !== 'object') {
    throw new ValidationError('Study must be an object', 'study', study);
  }
  const s = study as Study;
  if (typeof s.id !== 'string' || s.id.trim() === '') {
    throw new ValidationError('Study must have a valid id', 'id', s.id);
  }
  if (typeof s.name !== 'string' || s.name.trim() === '') {
    throw new ValidationError('Study must have a valid name', 'name', s.name);
  }
  if (typeof s.isActive !== 'boolean') {
    throw new ValidationError('Study must have isActive boolean', 'isActive', s.isActive);
  }
  validateDate(s.createdAt, 'createdAt');
  validateDate(s.updatedAt, 'updatedAt');
  return s;
}

/**
 * Validate a multi-translation view
 */
export function validateMultiTranslationView(view: unknown): MultiTranslationView {
  if (!view || typeof view !== 'object') {
    throw new ValidationError('Multi-translation view must be an object', 'view', view);
  }
  const v = view as MultiTranslationView & { primaryTranslationId?: string };
  if (typeof v.id !== 'string' || v.id.trim() === '') {
    throw new ValidationError('Multi-translation view must have a valid id', 'id', v.id);
  }
  if (!Array.isArray(v.translationIds)) {
    throw new ValidationError('Multi-translation view must have translationIds array', 'translationIds', v.translationIds);
  }
  if (v.translationIds.length > 0 && v.translationIds.length > 3) {
    throw new ValidationError('Multi-translation view must have at most 3 translation IDs', 'translationIds', v.translationIds);
  }
  if (typeof v.syncScrolling !== 'boolean') {
    throw new ValidationError('Multi-translation view must have syncScrolling boolean', 'syncScrolling', v.syncScrolling);
  }
  const { primaryTranslationId: _primaryTranslationId, ...validatedView } = v;
  return validatedView as MultiTranslationView;
}

/**
 * Validate an observation list
 */
export function validateObservationList(list: unknown): ObservationList {
  if (!list || typeof list !== 'object') {
    throw new ValidationError('Observation list must be an object', 'list', list);
  }
  const l = list as ObservationList;
  if (typeof l.id !== 'string' || l.id.trim() === '') {
    throw new ValidationError('Observation list must have a valid id', 'id', l.id);
  }
  if (typeof l.title !== 'string' || l.title.trim() === '') {
    throw new ValidationError('Observation list must have a valid title', 'title', l.title);
  }
  if (typeof l.keyWordId !== 'string' || l.keyWordId.trim() === '') {
    throw new ValidationError('Observation list must have a valid keyWordId', 'keyWordId', l.keyWordId);
  }
  if (!Array.isArray(l.items)) {
    throw new ValidationError('Observation list must have items array', 'items', l.items);
  }
  // Validate items
  for (const item of l.items) {
    if (!item || typeof item !== 'object') {
      throw new ValidationError('Observation list item must be an object', 'item', item);
    }
    const i = item as { id: string; content: string; verseRef: VerseRef; createdAt?: unknown; updatedAt?: unknown };
    if (typeof i.id !== 'string' || i.id.trim() === '') {
      throw new ValidationError('Observation list item must have a valid id', 'item.id', i.id);
    }
    if (typeof i.content !== 'string' || i.content.trim() === '') {
      throw new ValidationError('Observation list item must have valid content', 'item.content', i.content);
    }
    validateVerseRef(i.verseRef);
    if (i.createdAt) validateDate(i.createdAt, 'item.createdAt');
    if (i.updatedAt) validateDate(i.updatedAt, 'item.updatedAt');
  }

  validateDate(l.createdAt, 'createdAt');
  validateDate(l.updatedAt, 'updatedAt');
  return l;
}

/**
 * Validate a 5W+H entry
 */
export function validateFiveWAndH(entry: unknown): FiveWAndHEntry {
  if (!entry || typeof entry !== 'object') {
    throw new ValidationError('5W+H entry must be an object', 'entry', entry);
  }
  const e = entry as FiveWAndHEntry;
  if (typeof e.id !== 'string' || e.id.trim() === '') {
    throw new ValidationError('5W+H entry must have a valid id', 'id', e.id);
  }
  validateVerseRef(e.verseRef);
  if (e.who !== undefined && typeof e.who !== 'string') {
    throw new ValidationError('5W+H entry who must be a string if provided', 'who', e.who);
  }
  if (e.what !== undefined && typeof e.what !== 'string') {
    throw new ValidationError('5W+H entry what must be a string if provided', 'what', e.what);
  }
  if (e.when !== undefined && typeof e.when !== 'string') {
    throw new ValidationError('5W+H entry when must be a string if provided', 'when', e.when);
  }
  if (e.where !== undefined && typeof e.where !== 'string') {
    throw new ValidationError('5W+H entry where must be a string if provided', 'where', e.where);
  }
  if (e.why !== undefined && typeof e.why !== 'string') {
    throw new ValidationError('5W+H entry why must be a string if provided', 'why', e.why);
  }
  if (e.how !== undefined && typeof e.how !== 'string') {
    throw new ValidationError('5W+H entry how must be a string if provided', 'how', e.how);
  }
  if (e.notes !== undefined && typeof e.notes !== 'string') {
    throw new ValidationError('5W+H entry notes must be a string if provided', 'notes', e.notes);
  }
  if (e.linkedPresetIds !== undefined) {
    if (!Array.isArray(e.linkedPresetIds)) {
      throw new ValidationError('5W+H entry linkedPresetIds must be an array if provided', 'linkedPresetIds', e.linkedPresetIds);
    }
    for (const presetId of e.linkedPresetIds) {
      if (typeof presetId !== 'string' || presetId.trim() === '') {
        throw new ValidationError('5W+H entry linkedPresetIds must contain valid string IDs', 'linkedPresetIds', e.linkedPresetIds);
      }
    }
  }
  const hasContent = e.who?.trim() || e.what?.trim() || e.when?.trim() || e.where?.trim() || e.why?.trim() || e.how?.trim() || e.notes?.trim();
  if (!hasContent) {
    throw new ValidationError('5W+H entry must have at least one field with content', 'entry', e);
  }
  validateDate(e.createdAt, 'createdAt');
  validateDate(e.updatedAt, 'updatedAt');
  return e;
}

/**
 * Validate an interpretation entry
 */
export function validateInterpretation(entry: unknown): InterpretationEntry {
  if (!entry || typeof entry !== 'object') {
    throw new ValidationError('Interpretation entry must be an object', 'entry', entry);
  }
  const e = entry as InterpretationEntry;
  if (typeof e.id !== 'string' || e.id.trim() === '') {
    throw new ValidationError('Interpretation entry must have a valid id', 'id', e.id);
  }
  validateVerseRef(e.verseRef);
  if (e.endVerseRef !== undefined) {
    validateVerseRef(e.endVerseRef);
    if (e.endVerseRef.book !== e.verseRef.book || e.endVerseRef.chapter !== e.verseRef.chapter || e.endVerseRef.verse < e.verseRef.verse) {
      throw new ValidationError('Interpretation entry endVerseRef must be after or equal to verseRef', 'endVerseRef', e.endVerseRef);
    }
  }
  const optionalStringFields = ['meaning', 'authorIntent', 'keyThemes', 'context', 'implications', 'crossReferences', 'questions', 'insights'] as const;
  const eRecord = e as unknown as Record<string, unknown>;
  for (const field of optionalStringFields) {
    const val = eRecord[field];
    if (val !== undefined && typeof val !== 'string') {
      throw new ValidationError(`Interpretation entry ${field} must be a string if provided`, field, val);
    }
  }
  if (e.linkedPresetIds !== undefined) {
    if (!Array.isArray(e.linkedPresetIds)) {
      throw new ValidationError('Interpretation entry linkedPresetIds must be an array if provided', 'linkedPresetIds', e.linkedPresetIds);
    }
    for (const presetId of e.linkedPresetIds) {
      if (typeof presetId !== 'string' || presetId.trim() === '') {
        throw new ValidationError('Interpretation entry linkedPresetIds must contain valid string IDs', 'linkedPresetIds', e.linkedPresetIds);
      }
    }
  }
  if (e.studyId !== undefined && (typeof e.studyId !== 'string' || e.studyId.trim() === '')) {
    throw new ValidationError('Interpretation entry studyId must be a valid string if provided', 'studyId', e.studyId);
  }
  const hasContent = e.meaning?.trim() || e.authorIntent?.trim() || e.keyThemes?.trim() || e.context?.trim() || e.implications?.trim() || e.crossReferences?.trim() || e.questions?.trim() || e.insights?.trim();
  if (!hasContent) {
    throw new ValidationError('Interpretation entry must have at least one field with content', 'entry', e);
  }
  validateDate(e.createdAt, 'createdAt');
  validateDate(e.updatedAt, 'updatedAt');
  return e;
}

/**
 * Validate an application entry
 */
export function validateApplication(entry: unknown): ApplicationEntry {
  if (!entry || typeof entry !== 'object') {
    throw new ValidationError('Application entry must be an object', 'entry', entry);
  }
  const e = entry as ApplicationEntry;
  if (typeof e.id !== 'string' || e.id.trim() === '') {
    throw new ValidationError('Application entry must have a valid id', 'id', e.id);
  }
  validateVerseRef(e.verseRef);
  // All fields are optional, but if present, must be strings
  if (e.teaching !== undefined && typeof e.teaching !== 'string') {
    throw new ValidationError('Application entry teaching must be a string if provided', 'teaching', e.teaching);
  }
  if (e.reproof !== undefined && typeof e.reproof !== 'string') {
    throw new ValidationError('Application entry reproof must be a string if provided', 'reproof', e.reproof);
  }
  if (e.correction !== undefined && typeof e.correction !== 'string') {
    throw new ValidationError('Application entry correction must be a string if provided', 'correction', e.correction);
  }
  if (e.training !== undefined && typeof e.training !== 'string') {
    throw new ValidationError('Application entry training must be a string if provided', 'training', e.training);
  }
  if (e.notes !== undefined && typeof e.notes !== 'string') {
    throw new ValidationError('Application entry notes must be a string if provided', 'notes', e.notes);
  }
  // Validate linkedPresetIds if provided
  if (e.linkedPresetIds !== undefined) {
    if (!Array.isArray(e.linkedPresetIds)) {
      throw new ValidationError('Application entry linkedPresetIds must be an array if provided', 'linkedPresetIds', e.linkedPresetIds);
    }
    for (const presetId of e.linkedPresetIds) {
      if (typeof presetId !== 'string' || presetId.trim() === '') {
        throw new ValidationError('Application entry linkedPresetIds must contain valid string IDs', 'linkedPresetIds', e.linkedPresetIds);
      }
    }
  }
  // At least one field should have content (teaching, reproof, correction, training, or notes)
  const hasContent = e.teaching?.trim() ||
                     e.reproof?.trim() ||
                     e.correction?.trim() ||
                     e.training?.trim() ||
                     e.notes?.trim();
  if (!hasContent) {
    throw new ValidationError('Application entry must have at least one field with content', 'entry', entry);
  }
  validateDate(e.createdAt, 'createdAt');
  validateDate(e.updatedAt, 'updatedAt');
  return e;
}

/**
 * Validate a place entry
 */
export function validatePlace(place: unknown): Place {
  if (!place || typeof place !== 'object') {
    throw new ValidationError('Place must be an object', 'place', place);
  }
  const p = place as Place;
  if (typeof p.id !== 'string' || p.id.trim() === '') {
    throw new ValidationError('Place must have a valid id', 'id', p.id);
  }
  if (typeof p.name !== 'string' || p.name.trim() === '') {
    throw new ValidationError('Place must have a valid name', 'name', p.name);
  }
  validateVerseRef(p.verseRef);
  if (p.notes !== undefined && typeof p.notes !== 'string') {
    throw new ValidationError('Place notes must be a string if provided', 'notes', p.notes);
  }
  if (p.presetId !== undefined && typeof p.presetId !== 'string') {
    throw new ValidationError('Place presetId must be a string if provided', 'presetId', p.presetId);
  }
  if (p.annotationId !== undefined && typeof p.annotationId !== 'string') {
    throw new ValidationError('Place annotationId must be a string if provided', 'annotationId', p.annotationId);
  }
  validateDate(p.createdAt, 'createdAt');
  validateDate(p.updatedAt, 'updatedAt');
  return p;
}

/**
 * Validate a person entry
 */
export function validatePerson(person: unknown): Person {
  if (!person || typeof person !== 'object') {
    throw new ValidationError('Person must be an object', 'person', person);
  }
  const p = person as Person;
  if (typeof p.id !== 'string' || p.id.trim() === '') {
    throw new ValidationError('Person must have a valid id', 'id', p.id);
  }
  if (typeof p.name !== 'string' || p.name.trim() === '') {
    throw new ValidationError('Person must have a valid name', 'name', p.name);
  }
  validateVerseRef(p.verseRef);
  if (p.notes !== undefined && typeof p.notes !== 'string') {
    throw new ValidationError('Person notes must be a string if provided', 'notes', p.notes);
  }
  if (p.presetId !== undefined && typeof p.presetId !== 'string') {
    throw new ValidationError('Person presetId must be a string if provided', 'presetId', p.presetId);
  }
  if (p.annotationId !== undefined && typeof p.annotationId !== 'string') {
    throw new ValidationError('Person annotationId must be a string if provided', 'annotationId', p.annotationId);
  }
  validateDate(p.createdAt, 'createdAt');
  validateDate(p.updatedAt, 'updatedAt');
  return p;
}

/**
 * Validate and sanitize data, converting date strings to Date objects
 */
export function sanitizeData<T>(data: unknown, validator: (data: unknown) => T): T {
  try {
    // Convert date strings to Date objects if needed
    if (data && typeof data === 'object') {
      const sanitized: Record<string, unknown> = { ...(data as Record<string, unknown>) };
      for (const [key, value] of Object.entries(sanitized)) {
        if ((key === 'createdAt' || key === 'updatedAt' || key === 'timestamp' || key === 'cachedAt')) {
          if (typeof value === 'string') {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              sanitized[key] = date;
            } else {
              console.warn(`Invalid date string for ${key}: ${value}`);
            }
          } else if (typeof value === 'number') {
            // Handle timestamp numbers
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              sanitized[key] = date;
            } else {
              console.warn(`Invalid timestamp for ${key}: ${value}`);
            }
          }
          // If value is already a Date object, keep it as is
        }
      }
      return validator(sanitized);
    }
    return validator(data);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate an array of items, returning valid items and errors
 */
export function validateArray<T>(
  items: unknown[],
  validator: (item: unknown) => T,
  itemName: string = 'item'
): { valid: T[]; errors: ValidationError[] } {
  const valid: T[] = [];
  const errors: ValidationError[] = [];

  for (let i = 0; i < items.length; i++) {
    try {
      const item = sanitizeData(items[i], validator);
      valid.push(item);
    } catch (error) {
      if (error instanceof ValidationError) {
        errors.push(new ValidationError(`${itemName} at index ${i}: ${error.message}`, error.field, error.value));
      } else {
        errors.push(new ValidationError(`${itemName} at index ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    }
  }

  return { valid, errors };
}
