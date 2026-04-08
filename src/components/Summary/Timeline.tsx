import { useMemo, useEffect, useRef } from 'react';
import { useTimeStore } from '@/stores/timeStore';
import { usePeopleStore } from '@/stores/peopleStore';
import { useStudyStore } from '@/stores/studyStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useChapterEntities, useGnosisEntity } from '@/hooks/useGnosis';
import { formatVerseRef, parseOsisRef } from '@/types';
import type { VerseRef, GnosisEvent, GnosisPerson } from '@/types';

interface TimelineEntry {
  type: 'time' | 'person' | 'event';
  id: string;
  label: string;
  yearLabel?: string;
  startNum: number;
  endNum: number;
  verseRef: VerseRef;
}

function toNum(year: number, era: 'BC' | 'AD'): number {
  return era === 'BC' ? -year : year;
}

function formatYearNum(num: number): string {
  if (num <= 0) return `${Math.abs(num) || 1} BC`;
  return `${num} AD`;
}

const ROW_HEIGHT = 32;
const ROW_GAP = 4;
const YEAR_COL_WIDTH = 110;

interface TimelineProps {
  filterByBook?: boolean;
}

export function Timeline({ filterByBook = true }: TimelineProps) {
  const { timeExpressions, loadTimeExpressions, autoPopulateFromChapter } = useTimeStore();
  const { people, loadPeople, autoPopulateFromChapter: autoPopulatePeople } = usePeopleStore();
  const { activeStudyId } = useStudyStore();
  const { currentBook, currentChapter, currentModuleId, navigateToVerse } = useBibleStore();
  const lastPopulatedChapter = useRef('');

  useEffect(() => {
    loadTimeExpressions();
    loadPeople();
  }, [loadTimeExpressions, loadPeople]);

  useEffect(() => {
    if (!currentBook || !currentChapter || !currentModuleId) return;
    const key = `${currentBook}:${currentChapter}:${currentModuleId}`;
    if (lastPopulatedChapter.current === key) return;
    lastPopulatedChapter.current = key;
    void Promise.all([
      autoPopulateFromChapter(currentBook, currentChapter, currentModuleId),
      autoPopulatePeople(currentBook, currentChapter, currentModuleId),
    ]).then(([timeCount, peopleCount]) => {
      if (timeCount > 0) void loadTimeExpressions();
      if (peopleCount > 0) void loadPeople();
    });
  }, [currentBook, currentChapter, currentModuleId, autoPopulateFromChapter, autoPopulatePeople, loadTimeExpressions, loadPeople]);

  // Fetch gnosis entities for the current chapter
  const { entities: chapterEntities } = useChapterEntities(currentBook, currentChapter);

  const eventSlugs = chapterEntities?.events ?? [];
  const { data: gnosisEvents } = useGnosisEntity(
    async (provider) => {
      if (eventSlugs.length === 0) return [] as GnosisEvent[];
      const results = await Promise.all(
        eventSlugs.map((slug) => provider.getEvent(slug).catch(() => null))
      );
      return results.filter((e): e is GnosisEvent => e !== null && e.startYear !== null);
    },
    [eventSlugs.join(',')]
  );

  const peopleSlugs = chapterEntities?.people ?? [];
  const { data: gnosisPeople } = useGnosisEntity(
    async (provider) => {
      if (peopleSlugs.length === 0) return [] as GnosisPerson[];
      const results = await Promise.all(
        peopleSlugs.map((slug) => provider.getPerson(slug).catch(() => null))
      );
      return results.filter((p): p is GnosisPerson =>
        p !== null && (p.birthYear !== null || p.deathYear !== null || p.earliestYearMentioned !== null)
      );
    },
    [peopleSlugs.join(',')]
  );

  // Fetch the historical year for the current chapter
  const { data: chapterYear } = useGnosisEntity(
    (provider) => currentBook && currentChapter
      ? provider.getChapterYear(currentBook, currentChapter)
      : Promise.resolve(null),
    [currentBook, currentChapter]
  );

  const handleNavigateToVerse = (verseRef: VerseRef) => {
    window.dispatchEvent(new CustomEvent('toolbar-overlay-minimize'));
    navigateToVerse(verseRef.book, verseRef.chapter, verseRef.verse, true);
  };

  const entries = useMemo(() => {
    const matchesStudy = (studyId: string | undefined) =>
      !activeStudyId || !studyId || studyId === activeStudyId;
    const matchesBook = (book: string) => !currentBook || !filterByBook || book === currentBook;

    const result: TimelineEntry[] = [];

    // User time expressions
    for (const t of timeExpressions) {
      if (t.year == null || !t.yearEra || !matchesStudy(t.studyId) || !matchesBook(t.verseRef.book)) continue;
      const num = toNum(t.year, t.yearEra);
      result.push({
        type: 'time', id: t.id,
        label: `${t.verseRef.book} ${t.verseRef.chapter}:${t.verseRef.verse} — ${t.expression}`,
        startNum: num, endNum: num, verseRef: t.verseRef,
      });
    }

    // User people
    const seenPeople = new Set<string>();
    for (const p of people) {
      if (!matchesStudy(p.studyId) || !matchesBook(p.verseRef.book)) continue;
      if (!((p.yearStart != null && p.yearStartEra) || (p.yearEnd != null && p.yearEndEra))) continue;
      const groupKey = p.presetId || `manual:${p.name.toLowerCase().trim()}`;
      if (seenPeople.has(groupKey)) continue;
      seenPeople.add(groupKey);
      const hasStart = p.yearStart != null && p.yearStartEra;
      const hasEnd = p.yearEnd != null && p.yearEndEra;
      const s = hasStart ? toNum(p.yearStart!, p.yearStartEra!) : toNum(p.yearEnd!, p.yearEndEra!);
      const e = hasEnd ? toNum(p.yearEnd!, p.yearEndEra!) : s;
      result.push({
        type: 'person', id: p.id, label: p.name,
        startNum: Math.min(s, e), endNum: Math.max(s, e), verseRef: p.verseRef,
      });
    }

    // Gnosis events
    const chapterPrefix = `${currentBook}.${currentChapter}.`;
    for (const e of gnosisEvents ?? []) {
      if (e.startYear == null) continue;
      const chapterVerse = e.verses.find(v => v.startsWith(chapterPrefix));
      const parsed = chapterVerse ? parseOsisRef(chapterVerse) : null;
      const verseRef: VerseRef = parsed
        ? { book: parsed.book, chapter: parsed.chapter, verse: parsed.verse ?? 1 }
        : { book: currentBook, chapter: currentChapter, verse: 1 };
      result.push({
        type: 'event', id: e.slug, label: e.title,
        yearLabel: e.startYearDisplay ?? undefined,
        startNum: e.startYear, endNum: e.startYear, verseRef,
      });
    }

    // Gnosis people (dedup against user people)
    const userPersonNames = new Set(result.filter(r => r.type === 'person').map(r => r.label.toLowerCase().trim()));
    for (const p of gnosisPeople ?? []) {
      if (userPersonNames.has(p.name.toLowerCase().trim())) continue;
      const s = p.birthYear ?? p.earliestYearMentioned ?? p.deathYear ?? p.latestYearMentioned!;
      const e = p.deathYear ?? p.latestYearMentioned ?? s;
      const chapterVerse = p.verses.find(v => v.startsWith(chapterPrefix));
      const parsed = chapterVerse ? parseOsisRef(chapterVerse) : null;
      const verseRef: VerseRef = parsed
        ? { book: parsed.book, chapter: parsed.chapter, verse: parsed.verse ?? 1 }
        : { book: currentBook, chapter: currentChapter, verse: 1 };
      const yearLabel = [p.birthYearDisplay, p.deathYearDisplay].filter(Boolean).join(' — ') || undefined;
      result.push({
        type: 'person', id: `gnosis-${p.slug}`, label: p.name,
        yearLabel, startNum: Math.min(s, e), endNum: Math.max(s, e), verseRef,
      });
    }

    // Compute focus window using IQR on all year values to exclude outlier eras
    const allYears = result.flatMap(e => [e.startNum, e.endNum]).sort((a, b) => a - b);
    const q1 = allYears[Math.floor(allYears.length * 0.25)];
    const q3 = allYears[Math.floor(allYears.length * 0.75)];
    const iqr = Math.max(q3 - q1, 10);
    const focusMin = q1 - iqr * 1.5;
    const focusMax = q3 + iqr * 1.5;

    // Drop entries that don't overlap the focus window at all
    const filtered = result.filter(e => e.endNum >= focusMin && e.startNum <= focusMax);

    // Sort by start year, then by duration (longer bars first)
    filtered.sort((a, b) => a.startNum - b.startNum || (b.endNum - b.startNum) - (a.endNum - a.startNum));

    return filtered;
  }, [timeExpressions, people, gnosisEvents, gnosisPeople, activeStudyId, currentBook, currentChapter, filterByBook]);

  // Compute the horizontal scale focused on the majority cluster
  const { minYear, maxYear, yearToPercent } = useMemo(() => {
    if (entries.length === 0) return { minYear: 0, maxYear: 0, yearToPercent: () => 0 };

    // If we have a chapter year, center the scale around it
    // Include entries whose ranges overlap a window around the chapter year
    const allNums = entries.flatMap(e => [e.startNum, e.endNum]);
    let min: number;
    let max: number;

    if (chapterYear) {
      // Build scale from entries that are "near" the chapter year
      const cy = chapterYear.year;
      const nearby = entries.filter(e => {
        const dist = Math.min(Math.abs(e.startNum - cy), Math.abs(e.endNum - cy));
        return dist < 200 || (e.startNum <= cy && e.endNum >= cy);
      });
      const nearNums = nearby.length > 0
        ? nearby.flatMap(e => [e.startNum, e.endNum])
        : [cy];
      min = Math.min(...nearNums);
      max = Math.max(...nearNums);
    } else {
      // Fallback: IQR-based
      const sorted = [...allNums].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = Math.max(q3 - q1, 10);
      min = Math.max(Math.min(...allNums), q1 - iqr * 0.5);
      max = Math.min(Math.max(...allNums), q3 + iqr * 0.5);
    }

    const range = Math.max(max - min, 1);
    const pad = range * 0.15;
    const pMin = min - pad;
    const pMax = max + pad;
    const pRange = pMax - pMin;
    return {
      minYear: min,
      maxYear: max,
      yearToPercent: (year: number) => ((year - pMin) / pRange) * 100,
    };
  }, [entries, chapterYear]);

  // Year axis ticks
  const ticks = useMemo(() => {
    if (entries.length === 0) return [];
    const range = Math.max(maxYear - minYear, 1);
    const intervals = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
    let interval = 1000;
    for (const iv of intervals) {
      if (range / iv <= 8) { interval = iv; break; }
    }
    const first = Math.ceil(minYear / interval) * interval;
    const last = Math.floor(maxYear / interval) * interval;
    const result: { num: number; label: string; pct: number }[] = [];
    for (let n = first; n <= last; n += interval) {
      result.push({ num: n, label: formatYearNum(n), pct: yearToPercent(n) });
    }
    return result;
  }, [entries, minYear, maxYear, yearToPercent]);

  const totalHeight = entries.length * (ROW_HEIGHT + ROW_GAP);

  return (
    <div>
      {entries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-scripture-muted text-sm mb-2">No timeline entries for this chapter.</p>
          <p className="text-scripture-muted text-xs">
            Historical events from the reference library and user-added time expressions will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Chapter date header */}
          {chapterYear && (
            <p className="text-xs text-scripture-muted px-1">
              {currentBook} {currentChapter} — <span className="font-medium text-scripture-text">{chapterYear.yearDisplay}</span>
            </p>
          )}

          {/* Horizontal year axis */}
          <div className="relative h-6" style={{ marginLeft: YEAR_COL_WIDTH }}>
            {ticks.map((tick) => (
              <div
                key={tick.num}
                className="absolute text-[10px] text-scripture-muted -translate-x-1/2 select-none"
                style={{ left: `${tick.pct}%` }}
              >
                {tick.label}
              </div>
            ))}
          </div>

          {/* Gantt rows */}
          <div className="relative" style={{ height: totalHeight }}>
            {/* Grid lines */}
            <div className="absolute inset-0" style={{ left: YEAR_COL_WIDTH }}>
              {ticks.map((tick) => (
                <div
                  key={tick.num}
                  className="absolute top-0 bottom-0 w-px bg-scripture-border/20"
                  style={{ left: `${tick.pct}%` }}
                />
              ))}
            </div>

            {/* Chapter year marker line */}
            {chapterYear && (
              <div className="absolute inset-0" style={{ left: YEAR_COL_WIDTH }}>
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-scripture-accent/40"
                  style={{ left: `${yearToPercent(chapterYear.year)}%` }}
                />
              </div>
            )}

            {/* Rows */}
            {entries.map((entry, idx) => {
              const y = idx * (ROW_HEIGHT + ROW_GAP);
              const rawLeftPct = yearToPercent(entry.startNum);
              const rawRightPct = yearToPercent(entry.endNum);
              const leftPct = Math.max(rawLeftPct, 0);
              const rightPct = Math.min(rawRightPct, 100);
              const isRange = entry.startNum !== entry.endNum;
              const yearLabel = entry.yearLabel || (
                formatYearNum(entry.startNum) +
                (isRange ? ` — ${formatYearNum(entry.endNum)}` : '')
              );
              const tooltip = `${entry.label}\n${yearLabel}\n${formatVerseRef(entry.verseRef.book, entry.verseRef.chapter, entry.verseRef.verse)}`;

              const barColorClasses = entry.type === 'event'
                ? 'bg-scripture-warning/30 hover:bg-scripture-warning/40 border-scripture-warning/60'
                : entry.type === 'person'
                  ? 'bg-scripture-accent/70 hover:bg-scripture-accent border-scripture-accent'
                  : 'bg-scripture-elevated hover:bg-scripture-border border-scripture-border/40';

              const dotColorClasses = entry.type === 'event'
                ? 'bg-scripture-warning/60 border-scripture-warning'
                : entry.type === 'person'
                  ? 'bg-scripture-accent border-scripture-accent'
                  : 'bg-scripture-border border-scripture-border';

              return (
                <div key={`${entry.type}-${entry.id}`} className="absolute left-0 right-0" style={{ top: y, height: ROW_HEIGHT }}>
                  {/* Label */}
                  <div
                    className="absolute top-0 bottom-0 flex items-center pr-2 text-[11px] text-scripture-text font-medium truncate"
                    style={{ width: YEAR_COL_WIDTH }}
                    title={entry.label}
                  >
                    <span className="truncate">{entry.label}</span>
                  </div>

                  {/* Bar or dot */}
                  <div className="absolute top-0 bottom-0" style={{ left: YEAR_COL_WIDTH, right: 0 }}>
                    {isRange ? (
                      <button
                        onClick={() => handleNavigateToVerse(entry.verseRef)}
                        className={`absolute top-0.5 bottom-0.5 rounded-md border transition-colors cursor-pointer overflow-hidden flex items-center px-2 text-white ${barColorClasses}`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${Math.max(rightPct - leftPct, 2)}%`,
                        }}
                        title={tooltip}
                      >
                        <span className="text-[10px] font-medium truncate">
                          {yearLabel}
                        </span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleNavigateToVerse(entry.verseRef)}
                        className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-80"
                        style={{ left: `${leftPct}%` }}
                        title={tooltip}
                      >
                        <div className={`w-2.5 h-2.5 rounded-full border shrink-0 ${dotColorClasses}`} />
                        <span className="text-[10px] text-scripture-muted whitespace-nowrap">
                          {formatYearNum(entry.startNum)}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
