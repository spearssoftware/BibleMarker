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
import type { VerseRef } from '@/types/bible';
import { HIGHLIGHT_COLORS, SYMBOLS } from '@/types/annotation';

/** Validation error with details */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public value?: any
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate a verse reference
 */
function validateVerseRef(ref: any): ref is VerseRef {
  if (!ref || typeof ref !== 'object') {
    throw new ValidationError('Verse reference must be an object', 'ref', ref);
  }
  if (typeof ref.book !== 'string' || ref.book.trim() === '') {
    throw new ValidationError('Verse reference must have a valid book', 'ref.book', ref.book);
  }
  if (typeof ref.chapter !== 'number' || ref.chapter < 1) {
    throw new ValidationError('Verse reference must have a valid chapter (>= 1)', 'ref.chapter', ref.chapter);
  }
  if (typeof ref.verse !== 'number' || ref.verse < 1) {
    throw new ValidationError('Verse reference must have a valid verse (>= 1)', 'ref.verse', ref.verse);
  }
  return true;
}

/**
 * Validate a date (can be Date object or ISO string)
 */
function validateDate(date: any, fieldName: string): Date {
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
export function validateAnnotation(annotation: any): Annotation {
  if (!annotation || typeof annotation !== 'object') {
    throw new ValidationError('Annotation must be an object', 'annotation', annotation);
  }

  // Required fields
  if (typeof annotation.id !== 'string' || annotation.id.trim() === '') {
    throw new ValidationError('Annotation must have a valid id', 'id', annotation.id);
  }
  if (typeof annotation.moduleId !== 'string' || annotation.moduleId.trim() === '') {
    throw new ValidationError('Annotation must have a valid moduleId', 'moduleId', annotation.moduleId);
  }
  if (!['highlight', 'textColor', 'underline', 'symbol'].includes(annotation.type)) {
    throw new ValidationError('Annotation must have a valid type', 'type', annotation.type);
  }

  // Validate dates
  validateDate(annotation.createdAt, 'createdAt');
  validateDate(annotation.updatedAt, 'updatedAt');

  // Type-specific validation
  if (annotation.type === 'symbol') {
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
export function validateSectionHeading(heading: any): SectionHeading {
  if (!heading || typeof heading !== 'object') {
    throw new ValidationError('Section heading must be an object', 'heading', heading);
  }

  if (typeof heading.id !== 'string' || heading.id.trim() === '') {
    throw new ValidationError('Section heading must have a valid id', 'id', heading.id);
  }
  if (typeof heading.moduleId !== 'string' || heading.moduleId.trim() === '') {
    throw new ValidationError('Section heading must have a valid moduleId', 'moduleId', heading.moduleId);
  }
  if (typeof heading.title !== 'string' || heading.title.trim() === '') {
    throw new ValidationError('Section heading must have a valid title', 'title', heading.title);
  }

  validateVerseRef(heading.beforeRef);
  if (heading.coversUntil) {
    validateVerseRef(heading.coversUntil);
  }

  validateDate(heading.createdAt, 'createdAt');
  validateDate(heading.updatedAt, 'updatedAt');

  return heading as SectionHeading;
}

/**
 * Validate a chapter title
 */
export function validateChapterTitle(title: any): ChapterTitle {
  if (!title || typeof title !== 'object') {
    throw new ValidationError('Chapter title must be an object', 'title', title);
  }

  if (typeof title.id !== 'string' || title.id.trim() === '') {
    throw new ValidationError('Chapter title must have a valid id', 'id', title.id);
  }
  if (typeof title.moduleId !== 'string' || title.moduleId.trim() === '') {
    throw new ValidationError('Chapter title must have a valid moduleId', 'moduleId', title.moduleId);
  }
  if (typeof title.book !== 'string' || title.book.trim() === '') {
    throw new ValidationError('Chapter title must have a valid book', 'book', title.book);
  }
  if (typeof title.chapter !== 'number' || title.chapter < 1) {
    throw new ValidationError('Chapter title must have a valid chapter (>= 1)', 'chapter', title.chapter);
  }
  if (typeof title.title !== 'string' || title.title.trim() === '') {
    throw new ValidationError('Chapter title must have a valid title', 'title', title.title);
  }

  validateDate(title.createdAt, 'createdAt');
  validateDate(title.updatedAt, 'updatedAt');

  return title as ChapterTitle;
}

/**
 * Validate a note
 */
export function validateNote(note: any): Note {
  if (!note || typeof note !== 'object') {
    throw new ValidationError('Note must be an object', 'note', note);
  }

  if (typeof note.id !== 'string' || note.id.trim() === '') {
    throw new ValidationError('Note must have a valid id', 'id', note.id);
  }
  if (typeof note.moduleId !== 'string' || note.moduleId.trim() === '') {
    throw new ValidationError('Note must have a valid moduleId', 'moduleId', note.moduleId);
  }
  if (typeof note.content !== 'string') {
    throw new ValidationError('Note must have content', 'content', note.content);
  }

  validateVerseRef(note.ref);
  if (note.range) {
    validateVerseRef(note.range.start);
    validateVerseRef(note.range.end);
  }

  validateDate(note.createdAt, 'createdAt');
  validateDate(note.updatedAt, 'updatedAt');

  return note as Note;
}

/**
 * Validate a marking preset
 */
export function validateMarkingPreset(preset: any): MarkingPreset {
  if (!preset || typeof preset !== 'object') {
    throw new ValidationError('Marking preset must be an object', 'preset', preset);
  }

  if (typeof preset.id !== 'string' || preset.id.trim() === '') {
    throw new ValidationError('Marking preset must have a valid id', 'id', preset.id);
  }

  // Must have at least symbol or highlight
  if (!preset.symbol && !preset.highlight) {
    throw new ValidationError('Marking preset must have at least symbol or highlight', 'preset', preset);
  }

  if (preset.symbol && !(preset.symbol in SYMBOLS)) {
    throw new ValidationError('Marking preset must have a valid symbol if provided', 'symbol', preset.symbol);
  }

  if (preset.highlight) {
    if (typeof preset.highlight !== 'object') {
      throw new ValidationError('Marking preset highlight must be an object', 'highlight', preset.highlight);
    }
    if (!['highlight', 'textColor', 'underline'].includes(preset.highlight.style)) {
      throw new ValidationError('Marking preset highlight must have a valid style', 'highlight.style', preset.highlight.style);
    }
    if (!(preset.highlight.color in HIGHLIGHT_COLORS)) {
      throw new ValidationError('Marking preset highlight must have a valid color', 'highlight.color', preset.highlight.color);
    }
  }

  if (!Array.isArray(preset.variants)) {
    throw new ValidationError('Marking preset must have variants array', 'variants', preset.variants);
  }

  if (typeof preset.autoSuggest !== 'boolean') {
    throw new ValidationError('Marking preset must have autoSuggest boolean', 'autoSuggest', preset.autoSuggest);
  }

  if (typeof preset.usageCount !== 'number' || preset.usageCount < 0) {
    throw new ValidationError('Marking preset must have a valid usageCount (>= 0)', 'usageCount', preset.usageCount);
  }

  // Validate scope constraints
  if (preset.chapterScope !== undefined && !preset.bookScope) {
    throw new ValidationError('Marking preset chapterScope requires bookScope', 'chapterScope', preset.chapterScope);
  }

  validateDate(preset.createdAt, 'createdAt');
  validateDate(preset.updatedAt, 'updatedAt');

  return preset as MarkingPreset;
}

/**
 * Validate a study
 */
export function validateStudy(study: any): Study {
  if (!study || typeof study !== 'object') {
    throw new ValidationError('Study must be an object', 'study', study);
  }

  if (typeof study.id !== 'string' || study.id.trim() === '') {
    throw new ValidationError('Study must have a valid id', 'id', study.id);
  }
  if (typeof study.name !== 'string' || study.name.trim() === '') {
    throw new ValidationError('Study must have a valid name', 'name', study.name);
  }
  if (typeof study.isActive !== 'boolean') {
    throw new ValidationError('Study must have isActive boolean', 'isActive', study.isActive);
  }

  validateDate(study.createdAt, 'createdAt');
  validateDate(study.updatedAt, 'updatedAt');

  return study as Study;
}

/**
 * Validate a multi-translation view
 */
export function validateMultiTranslationView(view: any): MultiTranslationView {
  if (!view || typeof view !== 'object') {
    throw new ValidationError('Multi-translation view must be an object', 'view', view);
  }

  if (typeof view.id !== 'string' || view.id.trim() === '') {
    throw new ValidationError('Multi-translation view must have a valid id', 'id', view.id);
  }
  if (!Array.isArray(view.translationIds)) {
    throw new ValidationError('Multi-translation view must have translationIds array', 'translationIds', view.translationIds);
  }
  if (view.translationIds.length === 0 || view.translationIds.length > 3) {
    throw new ValidationError('Multi-translation view must have 1-3 translation IDs', 'translationIds', view.translationIds);
  }
  if (typeof view.primaryTranslationId !== 'string' || view.primaryTranslationId.trim() === '') {
    throw new ValidationError('Multi-translation view must have a valid primaryTranslationId', 'primaryTranslationId', view.primaryTranslationId);
  }
  if (!view.translationIds.includes(view.primaryTranslationId)) {
    throw new ValidationError('Multi-translation view primaryTranslationId must be in translationIds', 'primaryTranslationId', view.primaryTranslationId);
  }
  if (typeof view.syncScrolling !== 'boolean') {
    throw new ValidationError('Multi-translation view must have syncScrolling boolean', 'syncScrolling', view.syncScrolling);
  }

  return view as MultiTranslationView;
}

/**
 * Validate an observation list
 */
export function validateObservationList(list: any): ObservationList {
  if (!list || typeof list !== 'object') {
    throw new ValidationError('Observation list must be an object', 'list', list);
  }

  if (typeof list.id !== 'string' || list.id.trim() === '') {
    throw new ValidationError('Observation list must have a valid id', 'id', list.id);
  }
  if (typeof list.title !== 'string' || list.title.trim() === '') {
    throw new ValidationError('Observation list must have a valid title', 'title', list.title);
  }
  if (typeof list.keyWordId !== 'string' || list.keyWordId.trim() === '') {
    throw new ValidationError('Observation list must have a valid keyWordId', 'keyWordId', list.keyWordId);
  }
  if (!Array.isArray(list.items)) {
    throw new ValidationError('Observation list must have items array', 'items', list.items);
  }

  // Validate items
  for (const item of list.items) {
    if (!item || typeof item !== 'object') {
      throw new ValidationError('Observation list item must be an object', 'item', item);
    }
    if (typeof item.id !== 'string' || item.id.trim() === '') {
      throw new ValidationError('Observation list item must have a valid id', 'item.id', item.id);
    }
    if (typeof item.content !== 'string' || item.content.trim() === '') {
      throw new ValidationError('Observation list item must have valid content', 'item.content', item.content);
    }
    validateVerseRef(item.verseRef);
    if (item.createdAt) validateDate(item.createdAt, 'item.createdAt');
    if (item.updatedAt) validateDate(item.updatedAt, 'item.updatedAt');
  }

  validateDate(list.createdAt, 'createdAt');
  validateDate(list.updatedAt, 'updatedAt');

  return list as ObservationList;
}

/**
 * Validate and sanitize data, converting date strings to Date objects
 */
export function sanitizeData<T>(data: any, validator: (data: any) => T): T {
  try {
    // Convert date strings to Date objects if needed
    if (data && typeof data === 'object') {
      const sanitized = { ...data };
      for (const [key, value] of Object.entries(sanitized)) {
        if ((key === 'createdAt' || key === 'updatedAt' || key === 'timestamp' || key === 'cachedAt') && typeof value === 'string') {
          sanitized[key] = new Date(value);
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
  items: any[],
  validator: (item: any) => T,
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
