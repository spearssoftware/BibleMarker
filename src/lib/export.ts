/**
 * Study Export Utility
 * 
 * Exports all study data (observations, interpretations, applications) as Markdown.
 * Organizes data by book and chapter for easy reading.
 */

import { db } from './db';
import type { FiveWAndHEntry } from '@/types/observation';
import type { Contrast } from '@/types/contrast';
import type { TimeExpression } from '@/types/timeExpression';
import type { Place } from '@/types/place';
import type { Conclusion } from '@/types/conclusion';
import type { ObservationList } from '@/types/list';
import type { InterpretationEntry } from '@/types/interpretation';
import type { ApplicationEntry } from '@/types/application';
import type { VerseRef } from '@/types/bible';
import { formatVerseRef, getBookById } from '@/types/bible';
import { isTauri } from './platform';

/**
 * Group entries by book and chapter
 */
interface GroupedEntries {
  [book: string]: {
    [chapter: number]: {
      fiveWAndH: FiveWAndHEntry[];
      contrasts: Contrast[];
      timeExpressions: TimeExpression[];
      places: Place[];
      conclusions: Conclusion[];
      interpretations: InterpretationEntry[];
      applications: ApplicationEntry[];
    };
  };
}

/**
 * Format a verse reference range
 */
function formatVerseRange(verseRef: VerseRef, endVerseRef?: VerseRef): string {
  const base = formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse);
  if (endVerseRef && (
    endVerseRef.book !== verseRef.book ||
    endVerseRef.chapter !== verseRef.chapter ||
    endVerseRef.verse !== verseRef.verse
  )) {
    const end = formatVerseRef(endVerseRef.book, endVerseRef.chapter, endVerseRef.verse);
    return `${base} - ${end}`;
  }
  return base;
}

/**
 * Group entries by book and chapter
 */
function groupEntries(
  fiveWAndH: FiveWAndHEntry[],
  contrasts: Contrast[],
  timeExpressions: TimeExpression[],
  places: Place[],
  conclusions: Conclusion[],
  interpretations: InterpretationEntry[],
  applications: ApplicationEntry[]
): GroupedEntries {
  const grouped: GroupedEntries = {};

  type GroupedEntry = FiveWAndHEntry | Contrast | TimeExpression | Place | Conclusion | InterpretationEntry | ApplicationEntry;
  const addEntry = (book: string, chapter: number, type: keyof GroupedEntries[string][number], entry: GroupedEntry) => {
    if (!grouped[book]) {
      grouped[book] = {};
    }
    if (!grouped[book][chapter]) {
      grouped[book][chapter] = {
        fiveWAndH: [],
        contrasts: [],
        timeExpressions: [],
        places: [],
        conclusions: [],
        interpretations: [],
        applications: [],
      };
    }
    (grouped[book][chapter][type] as GroupedEntry[]).push(entry);
  };

  // Group 5W+H entries
  fiveWAndH.forEach(entry => {
    addEntry(entry.verseRef.book, entry.verseRef.chapter, 'fiveWAndH', entry);
  });

  // Group contrasts
  contrasts.forEach(entry => {
    addEntry(entry.verseRef.book, entry.verseRef.chapter, 'contrasts', entry);
  });

  // Group time expressions
  timeExpressions.forEach(entry => {
    addEntry(entry.verseRef.book, entry.verseRef.chapter, 'timeExpressions', entry);
  });

  // Group places
  places.forEach(entry => {
    addEntry(entry.verseRef.book, entry.verseRef.chapter, 'places', entry);
  });

  // Group conclusions
  conclusions.forEach(entry => {
    addEntry(entry.verseRef.book, entry.verseRef.chapter, 'conclusions', entry);
  });

  // Group interpretations
  interpretations.forEach(entry => {
    addEntry(entry.verseRef.book, entry.verseRef.chapter, 'interpretations', entry);
  });

  // Group applications
  applications.forEach(entry => {
    addEntry(entry.verseRef.book, entry.verseRef.chapter, 'applications', entry);
  });

  return grouped;
}

/**
 * Format 5W+H entry as Markdown
 */
function formatFiveWAndH(entry: FiveWAndHEntry): string {
  const ref = formatVerseRef(entry.verseRef.book, entry.verseRef.chapter, entry.verseRef.verse);
  const lines: string[] = [`**${ref}**`];
  
  if (entry.who) lines.push(`- **Who:** ${entry.who}`);
  if (entry.what) lines.push(`- **What:** ${entry.what}`);
  if (entry.when) lines.push(`- **When:** ${entry.when}`);
  if (entry.where) lines.push(`- **Where:** ${entry.where}`);
  if (entry.why) lines.push(`- **Why:** ${entry.why}`);
  if (entry.how) lines.push(`- **How:** ${entry.how}`);
  if (entry.notes) lines.push(`- **Notes:** ${entry.notes}`);
  
  return lines.join('\n');
}

/**
 * Format contrast entry as Markdown
 */
function formatContrast(entry: Contrast): string {
  const ref = formatVerseRef(entry.verseRef.book, entry.verseRef.chapter, entry.verseRef.verse);
  const lines: string[] = [`**${ref}**`];
  lines.push(`- ${entry.itemA} ⇔ ${entry.itemB}`);
  if (entry.notes) lines.push(`- **Notes:** ${entry.notes}`);
  return lines.join('\n');
}

/**
 * Format time expression entry as Markdown
 */
function formatTimeExpression(entry: TimeExpression): string {
  const ref = formatVerseRef(entry.verseRef.book, entry.verseRef.chapter, entry.verseRef.verse);
  const lines: string[] = [`**${ref}**`];
  lines.push(`- ${entry.expression}`);
  if (entry.timeOrder !== undefined) lines.push(`- **Order:** ${entry.timeOrder}`);
  if (entry.notes) lines.push(`- **Notes:** ${entry.notes}`);
  return lines.join('\n');
}

/**
 * Format place entry as Markdown
 */
function formatPlace(entry: Place): string {
  const ref = formatVerseRef(entry.verseRef.book, entry.verseRef.chapter, entry.verseRef.verse);
  const lines: string[] = [`**${ref}**`];
  lines.push(`- **${entry.name}**`);
  if (entry.notes) lines.push(`- **Notes:** ${entry.notes}`);
  return lines.join('\n');
}

/**
 * Format conclusion entry as Markdown
 */
function formatConclusion(entry: Conclusion): string {
  const ref = formatVerseRef(entry.verseRef.book, entry.verseRef.chapter, entry.verseRef.verse);
  const lines: string[] = [`**${ref}**`];
  lines.push(`- **${entry.term}**`);
  if (entry.flowOrder !== undefined) lines.push(`- **Flow Order:** ${entry.flowOrder}`);
  if (entry.notes) lines.push(`- **Notes:** ${entry.notes}`);
  return lines.join('\n');
}

/**
 * Format interpretation entry as Markdown
 */
function formatInterpretation(entry: InterpretationEntry): string {
  const ref = formatVerseRange(entry.verseRef, entry.endVerseRef);
  const lines: string[] = [`**${ref}**`];
  
  if (entry.meaning) lines.push(`- **Meaning:** ${entry.meaning}`);
  if (entry.authorIntent) lines.push(`- **Author's Intent:** ${entry.authorIntent}`);
  if (entry.keyThemes) lines.push(`- **Key Themes:** ${entry.keyThemes}`);
  if (entry.context) lines.push(`- **Context:** ${entry.context}`);
  if (entry.implications) lines.push(`- **Implications:** ${entry.implications}`);
  if (entry.crossReferences) lines.push(`- **Cross References:** ${entry.crossReferences}`);
  if (entry.questions) lines.push(`- **Questions:** ${entry.questions}`);
  if (entry.insights) lines.push(`- **Insights:** ${entry.insights}`);
  
  return lines.join('\n');
}

/**
 * Format application entry as Markdown
 */
function formatApplication(entry: ApplicationEntry): string {
  const ref = formatVerseRef(entry.verseRef.book, entry.verseRef.chapter, entry.verseRef.verse);
  const lines: string[] = [`**${ref}**`];
  
  if (entry.teaching) lines.push(`- **Teaching:** ${entry.teaching}`);
  if (entry.reproof) lines.push(`- **Reproof:** ${entry.reproof}`);
  if (entry.correction) lines.push(`- **Correction:** ${entry.correction}`);
  if (entry.training) lines.push(`- **Training in Righteousness:** ${entry.training}`);
  if (entry.notes) lines.push(`- **Notes:** ${entry.notes}`);
  
  return lines.join('\n');
}

/**
 * Format observation list as Markdown
 */
function formatObservationList(list: ObservationList): string {
  const lines: string[] = [`## ${list.title}`];
  if (list.scope) {
    const scopeParts: string[] = [];
    if (list.scope.book) {
      const bookName = getBookById(list.scope.book)?.name || list.scope.book;
      scopeParts.push(bookName);
    }
    if (list.scope.chapters && list.scope.chapters.length > 0) {
      scopeParts.push(`Chapters: ${list.scope.chapters.join(', ')}`);
    }
    if (scopeParts.length > 0) {
      lines.push(`*Scope: ${scopeParts.join(', ')}*`);
    }
  }
  
  if (list.items.length === 0) {
    lines.push('*No items yet.*');
  } else {
    list.items.forEach(item => {
      const ref = formatVerseRef(item.verseRef.book, item.verseRef.chapter, item.verseRef.verse);
      lines.push(`- **${ref}:** ${item.content}`);
    });
  }
  
  return lines.join('\n');
}

/**
 * Generate Markdown export from all study data
 */
export async function exportStudyDataAsMarkdown(): Promise<string> {
  // Load all data
  const [
    fiveWAndH,
    contrasts,
    timeExpressions,
    places,
    conclusions,
    observationLists,
    interpretations,
    applications,
  ] = await Promise.all([
    db.fiveWAndH.toArray(),
    db.contrasts.toArray(),
    db.timeExpressions.toArray(),
    db.places.toArray(),
    db.conclusions.toArray(),
    db.observationLists.toArray(),
    db.interpretations.toArray(),
    db.applications.toArray(),
  ]);

  // Group entries by book and chapter
  const grouped = groupEntries(
    fiveWAndH,
    contrasts,
    timeExpressions,
    places,
    conclusions,
    interpretations,
    applications
  );

  // Generate Markdown
  const lines: string[] = [];
  
  // Header
  lines.push('# Bible Study Export');
  lines.push('');
  lines.push(`*Generated on ${new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}*`);
  lines.push('');
  
  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **5W+H Entries:** ${fiveWAndH.length}`);
  lines.push(`- **Contrasts:** ${contrasts.length}`);
  lines.push(`- **Time Expressions:** ${timeExpressions.length}`);
  lines.push(`- **Places:** ${places.length}`);
  lines.push(`- **Conclusions:** ${conclusions.length}`);
  lines.push(`- **Observation Lists:** ${observationLists.length}`);
  lines.push(`- **Interpretations:** ${interpretations.length}`);
  lines.push(`- **Applications:** ${applications.length}`);
  lines.push('');

  // Observation Lists (separate section)
  if (observationLists.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('# Observation Lists');
    lines.push('');
    observationLists.forEach(list => {
      lines.push(formatObservationList(list));
      lines.push('');
    });
  }

  // Grouped entries by book/chapter
  if (Object.keys(grouped).length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('# Study Data by Book and Chapter');
    lines.push('');

    // Sort books by canonical order
    const { BIBLE_BOOKS } = await import('@/types/bible');
    const bookOrder = new Map(BIBLE_BOOKS.map((book, index) => [book.id, index]));
    const sortedBooks = Object.keys(grouped).sort((a, b) => {
      const orderA = bookOrder.get(a) ?? 999;
      const orderB = bookOrder.get(b) ?? 999;
      return orderA - orderB;
    });

    for (const book of sortedBooks) {
      const bookInfo = getBookById(book);
      const bookName = bookInfo?.name || book;
      lines.push(`## ${bookName}`);
      lines.push('');

      const chapters = Object.keys(grouped[book])
        .map(Number)
        .sort((a, b) => a - b);

      for (const chapter of chapters) {
        const data = grouped[book][chapter];
        lines.push(`### ${bookName} ${chapter}`);
        lines.push('');

        // 5W+H
        if (data.fiveWAndH.length > 0) {
          lines.push('#### 5 W\'s and H');
          lines.push('');
          data.fiveWAndH.forEach(entry => {
            lines.push(formatFiveWAndH(entry));
            lines.push('');
          });
        }

        // Contrasts
        if (data.contrasts.length > 0) {
          lines.push('#### Contrasts and Comparisons');
          lines.push('');
          data.contrasts.forEach(entry => {
            lines.push(formatContrast(entry));
            lines.push('');
          });
        }

        // Time Expressions
        if (data.timeExpressions.length > 0) {
          lines.push('#### Time Expressions');
          lines.push('');
          data.timeExpressions.forEach(entry => {
            lines.push(formatTimeExpression(entry));
            lines.push('');
          });
        }

        // Places
        if (data.places.length > 0) {
          lines.push('#### Geographic Locations');
          lines.push('');
          data.places.forEach(entry => {
            lines.push(formatPlace(entry));
            lines.push('');
          });
        }

        // Conclusions
        if (data.conclusions.length > 0) {
          lines.push('#### Conclusion Terms');
          lines.push('');
          data.conclusions.forEach(entry => {
            lines.push(formatConclusion(entry));
            lines.push('');
          });
        }

        // Interpretations
        if (data.interpretations.length > 0) {
          lines.push('#### Interpretation');
          lines.push('');
          data.interpretations.forEach(entry => {
            lines.push(formatInterpretation(entry));
            lines.push('');
          });
        }

        // Applications
        if (data.applications.length > 0) {
          lines.push('#### Application');
          lines.push('');
          data.applications.forEach(entry => {
            lines.push(formatApplication(entry));
            lines.push('');
          });
        }

        lines.push('---');
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

/**
 * Export study data as Markdown file
 */
export async function exportStudyData(): Promise<void> {
  try {
    const markdown = await exportStudyDataAsMarkdown();
    const blob = new Blob([markdown], { type: 'text/markdown' });
    
    // Generate filename
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const filename = `BibleMarker-Study-Export-${year}-${month}-${day}-${hours}${minutes}.md`;

    // Tauri: Use native file dialog
    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const filePath = await save({
          defaultPath: filename,
          filters: [{
            name: 'Markdown',
            extensions: ['md'],
          }],
        });

        if (filePath) {
          const { writeTextFile } = await import('@tauri-apps/plugin-fs');
          await writeTextFile(filePath, markdown);
          return;
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Export cancelled') {
          throw error;
        }
        throw new Error(`Failed to save export: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // File System Access API (browser)
    if ('showSaveFilePicker' in window) {
      try {
        const fileHandle = await (window as Window & { showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker!({
          suggestedName: filename,
          types: [{
            description: 'Markdown',
            accept: { 'text/markdown': ['.md'] },
          }],
        });

        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Export cancelled');
        }
        console.warn('File System Access API failed, falling back to download:', error);
      }
    }

    // Fallback to browser download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Export cancelled' || error.message === 'Export cancelled')) {
      return; // User cancelled, don't show error
    }
    throw new Error(`Failed to export study data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
