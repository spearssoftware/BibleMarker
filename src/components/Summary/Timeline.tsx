import { useMemo, useEffect, useRef } from 'react';
import { useTimeStore } from '@/stores/timeStore';
import { usePeopleStore } from '@/stores/peopleStore';
import { useStudyStore } from '@/stores/studyStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useChapterEntities, useGnosisEntity } from '@/hooks/useGnosis';
import { formatVerseRef, parseOsisRef } from '@/types';
import type { VerseRef, GnosisEvent, GnosisPerson } from '@/types';

interface SwimLaneEntry {
  type: 'time' | 'person' | 'event';
  id: string;
  label: string;
  yearLabel?: string;
  startNum: number;
  endNum: number;
  verseRef: VerseRef;
  lane: number;
}

function toNum(year: number, era: 'BC' | 'AD'): number {
  return era === 'BC' ? -year : year;
}

function formatYearNum(num: number): string {
  if (num <= 0) return `${Math.abs(num) || 1} BC`;
  return `${num} AD`;
}

function getNiceInterval(range: number): number {
  const intervals = [5, 10, 25, 50, 100, 250, 500, 1000];
  for (const iv of intervals) {
    if (range / iv <= 12) return iv;
  }
  return 1000;
}

function assignLanes(entries: Omit<SwimLaneEntry, 'lane'>[]): SwimLaneEntry[] {
  const sorted = [...entries].sort((a, b) => a.startNum - b.startNum);
  const laneEnds: number[] = [];

  return sorted.map(entry => {
    // Use strict < so point-in-time entries at the same year get separate lanes
    let lane = laneEnds.findIndex(end => end < entry.startNum);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(entry.endNum);
    } else {
      laneEnds[lane] = entry.endNum;
    }
    return { ...entry, lane };
  });
}

const SLOT_PX = 56;       // pixels per unique data-year slot
const MIN_BAR_PX = 24;
const AXIS_WIDTH = 64;
const MIN_LANE_WIDTH = 80;

interface TimelineProps {
  filterByBook?: boolean;
}

export function Timeline({ filterByBook = true }: TimelineProps) {
  const { timeExpressions, loadTimeExpressions, autoPopulateFromChapter } = useTimeStore();
  const { people, loadPeople, autoPopulateFromChapter: autoPopulatePeople } = usePeopleStore();
  const { activeStudyId } = useStudyStore();
  const { currentBook, currentChapter, currentModuleId, setLocation, setNavSelectedVerse } = useBibleStore();
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
      // Only include people who have some year data
      return results.filter((p): p is GnosisPerson =>
        p !== null && (p.birthYear !== null || p.deathYear !== null || p.earliestYearMentioned !== null)
      );
    },
    [peopleSlugs.join(',')]
  );

  const handleNavigateToVerse = (verseRef: VerseRef) => {
    const highlight = (verse: number) => {
      window.dispatchEvent(new CustomEvent('toolbar-overlay-minimize'));
      setNavSelectedVerse(verse);
      setTimeout(() => setNavSelectedVerse(null), 3000);
      setTimeout(() => {
        const el = document.querySelector(`[data-verse="${verse}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    };

    if (verseRef.book !== currentBook || verseRef.chapter !== currentChapter) {
      setLocation(verseRef.book, verseRef.chapter);
      setTimeout(() => highlight(verseRef.verse), 300);
    } else {
      highlight(verseRef.verse);
    }
  };

  const { lanedEntries, ticks, chartHeight, yearToPixel, numLanes, timeLaneCount } = useMemo(() => {
    const noopScale = (_: number) => 0;
    const empty = { lanedEntries: [] as SwimLaneEntry[], ticks: [] as { num: number; label: string }[], chartHeight: 0, yearToPixel: noopScale, numLanes: 0, timeLaneCount: 0 };

    const matchesStudy = (studyId: string | undefined) =>
      !activeStudyId || !studyId || studyId === activeStudyId;
    const matchesBook = (book: string) => !currentBook || !filterByBook || book === currentBook;

    const rawTimeEntries = timeExpressions
      .filter(t => t.year != null && t.yearEra && matchesStudy(t.studyId) && matchesBook(t.verseRef.book))
      .map(t => {
        const num = toNum(t.year!, t.yearEra!);
        return { type: 'time' as const, id: t.id, label: `${t.verseRef.book} ${t.verseRef.chapter} (${t.expression})`, startNum: num, endNum: num, verseRef: t.verseRef };
      });

    const seenPeople = new Set<string>();
    const rawPersonEntries = people
      .filter(p => (p.yearStart != null || p.yearEnd != null) && matchesStudy(p.studyId) && matchesBook(p.verseRef.book))
      .filter(p => (p.yearStart != null && p.yearStartEra) || (p.yearEnd != null && p.yearEndEra))
      .filter(p => {
        const groupKey = p.presetId || `manual:${p.name.toLowerCase().trim()}`;
        if (seenPeople.has(groupKey)) return false;
        seenPeople.add(groupKey);
        return true;
      })
      .map(p => {
        const hasStart = p.yearStart != null && p.yearStartEra;
        const hasEnd = p.yearEnd != null && p.yearEndEra;
        const s = hasStart ? toNum(p.yearStart!, p.yearStartEra!) : toNum(p.yearEnd!, p.yearEndEra!);
        const e = hasEnd ? toNum(p.yearEnd!, p.yearEndEra!) : s;
        return { type: 'person' as const, id: p.id, label: p.name, startNum: Math.min(s, e), endNum: Math.max(s, e), verseRef: p.verseRef };
      });

    // Gnosis events — already have startYear as signed integer
    const rawEventEntries = (gnosisEvents ?? [])
      .filter(e => e.startYear !== null)
      .map(e => {
        const firstVerse = e.verses[0] ? parseOsisRef(e.verses[0]) : null;
        const verseRef: VerseRef = firstVerse
          ? { book: firstVerse.book, chapter: firstVerse.chapter, verse: firstVerse.verse ?? 1 }
          : { book: currentBook, chapter: currentChapter, verse: 1 };
        return {
          type: 'event' as const,
          id: e.slug,
          label: e.title,
          yearLabel: e.startYearDisplay ?? undefined,
          startNum: e.startYear!,
          endNum: e.startYear!,
          verseRef,
        };
      });

    // Gnosis people — use birth/death years, fall back to earliest/latest mentioned
    const userPersonNames = new Set(rawPersonEntries.map(p => p.label.toLowerCase().trim()));
    const rawGnosisPersonEntries = (gnosisPeople ?? [])
      .filter(p => !userPersonNames.has(p.name.toLowerCase().trim()))
      .map(p => {
        const s = p.birthYear ?? p.earliestYearMentioned ?? p.deathYear ?? p.latestYearMentioned!;
        const e = p.deathYear ?? p.latestYearMentioned ?? s;
        const firstVerse = p.verses[0] ? parseOsisRef(p.verses[0]) : null;
        const verseRef: VerseRef = firstVerse
          ? { book: firstVerse.book, chapter: firstVerse.chapter, verse: firstVerse.verse ?? 1 }
          : { book: currentBook, chapter: currentChapter, verse: 1 };
        const yearLabel = [p.birthYearDisplay, p.deathYearDisplay].filter(Boolean).join(' — ') || undefined;
        return {
          type: 'person' as const,
          id: `gnosis-${p.slug}`,
          label: p.name,
          yearLabel,
          startNum: Math.min(s, e),
          endNum: Math.max(s, e),
          verseRef,
        };
      });

    const allPersonEntries = [...rawPersonEntries, ...rawGnosisPersonEntries];

    if (rawTimeEntries.length === 0 && allPersonEntries.length === 0 && rawEventEntries.length === 0) return empty;

    // Build ordinal scale: each unique data year gets one SLOT_PX slot.
    // Years that fall between data points (e.g. axis ticks) are interpolated.
    const allNums = [...rawTimeEntries, ...allPersonEntries, ...rawEventEntries].flatMap(e => [e.startNum, e.endNum]);
    const rawMin = Math.min(...allNums);
    const rawMax = Math.max(...allNums);
    const range = Math.max(rawMax - rawMin, 1);
    const interval = getNiceInterval(range);

    // Anchor years = data years + padding slots on each end
    const dataYearSet = new Set(allNums);
    const sortedAnchors = [...dataYearSet].sort((a, b) => a - b);
    const paddedAnchors = [rawMin - interval, ...sortedAnchors, rawMax + interval];
    const anchorIndex = new Map(paddedAnchors.map((y, i) => [y, i]));

    const toPixel = (year: number): number => {
      const exact = anchorIndex.get(year);
      if (exact !== undefined) return exact * SLOT_PX;
      // linear interpolation between surrounding anchors
      let lo = 0;
      for (let i = 0; i < paddedAnchors.length - 1; i++) {
        if (paddedAnchors[i] <= year) lo = i;
        else break;
      }
      const hi = Math.min(lo + 1, paddedAnchors.length - 1);
      if (lo === hi) return lo * SLOT_PX;
      const t = (year - paddedAnchors[lo]) / (paddedAnchors[hi] - paddedAnchors[lo]);
      return (lo + t) * SLOT_PX;
    };

    const chartH = (paddedAnchors.length - 1) * SLOT_PX;

    const lanedTime = assignLanes(rawTimeEntries);
    const numTimeLanes = lanedTime.length > 0 ? Math.max(...lanedTime.map(e => e.lane + 1)) : 0;

    const rawLanedEvents = assignLanes(rawEventEntries);
    const numEventLanes = rawLanedEvents.length > 0 ? Math.max(...rawLanedEvents.map(e => e.lane + 1)) : 0;
    const lanedEvents = rawLanedEvents.map(e => ({ ...e, lane: e.lane + numTimeLanes }));

    const rawLanedPeople = assignLanes(allPersonEntries);
    const numPeopleLanes = rawLanedPeople.length > 0 ? Math.max(...rawLanedPeople.map(e => e.lane + 1)) : 0;
    const lanedPeople = rawLanedPeople.map(e => ({ ...e, lane: e.lane + numTimeLanes + numEventLanes }));

    const laned = [...lanedTime, ...lanedEvents, ...lanedPeople];
    const nLanes = Math.max(1, numTimeLanes + numEventLanes + numPeopleLanes);

    const firstTick = Math.ceil(rawMin / interval) * interval;
    const lastTick = Math.floor(rawMax / interval) * interval;
    const allTicks: { num: number; label: string }[] = [];
    for (let n = firstTick; n <= lastTick; n += interval) {
      allTicks.push({ num: n, label: formatYearNum(n) });
    }
    // Add data-point ticks for events and people so their years show on the axis
    const tickNums = new Set(allTicks.map(t => t.num));
    for (const entry of [...rawEventEntries, ...allPersonEntries]) {
      if (!tickNums.has(entry.startNum)) {
        allTicks.push({ num: entry.startNum, label: formatYearNum(entry.startNum) });
        tickNums.add(entry.startNum);
      }
    }
    allTicks.sort((a, b) => a.num - b.num);

    // Filter ticks that are too close together in pixel space
    const MIN_TICK_GAP = 40;
    const tickList: { num: number; label: string }[] = [];
    let lastTickPx = -Infinity;
    for (const tick of allTicks) {
      const px = toPixel(tick.num);
      if (px - lastTickPx >= MIN_TICK_GAP) {
        tickList.push(tick);
        lastTickPx = px;
      }
    }

    return { lanedEntries: laned, ticks: tickList, chartHeight: chartH, yearToPixel: toPixel, numLanes: nLanes, timeLaneCount: numTimeLanes };
  }, [timeExpressions, people, gnosisEvents, gnosisPeople, activeStudyId, currentBook, currentChapter, filterByBook]);

  const getTop = yearToPixel;

  return (
    <div>
      {lanedEntries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-scripture-muted text-sm mb-2">No timeline entries for this chapter.</p>
          <p className="text-scripture-muted text-xs">
            Historical events from the reference library and user-added time expressions will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto custom-scrollbar">
          <div
            className="relative"
            style={{ height: chartHeight, minWidth: AXIS_WIDTH + numLanes * MIN_LANE_WIDTH }}
          >
            {/* Year axis tick labels */}
            {ticks.map((tick) => (
              <div
                key={tick.num}
                className="absolute text-[10px] text-scripture-muted text-right pr-2 leading-none -translate-y-1/2 select-none"
                style={{ top: getTop(tick.num), left: 0, width: AXIS_WIDTH }}
              >
                {tick.label}
              </div>
            ))}

            {/* Vertical axis line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-scripture-border/40"
              style={{ left: AXIS_WIDTH }}
            />

            {/* Lanes area */}
            <div className="absolute top-0 bottom-0 right-0" style={{ left: AXIS_WIDTH }}>
              {/* Horizontal grid lines */}
              {ticks.map((tick) => (
                <div
                  key={tick.num}
                  className="absolute left-0 right-0 h-px bg-scripture-border/15"
                  style={{ top: getTop(tick.num) }}
                />
              ))}

              {/* Lane separator between time and person lanes */}
              {timeLaneCount > 0 && numLanes > timeLaneCount && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-scripture-border/30"
                  style={{ left: `${(timeLaneCount / numLanes) * 100}%` }}
                />
              )}

              {/* Entries */}
              {lanedEntries.map((entry) => {
                const top = getTop(entry.startNum);
                const naturalHeight = yearToPixel(entry.endNum) - yearToPixel(entry.startNum);
                const leftPct = (entry.lane / numLanes) * 100;
                const widthPct = (1 / numLanes) * 100;
                const yearLabel = formatYearNum(entry.startNum) +
                  (entry.endNum !== entry.startNum ? ` — ${formatYearNum(entry.endNum)}` : '');
                const tooltip = `${entry.label}\n${yearLabel}\n${formatVerseRef(entry.verseRef.book, entry.verseRef.chapter, entry.verseRef.verse)}`;

                if (entry.type === 'event') {
                  const barHeight = Math.max(naturalHeight, MIN_BAR_PX);
                  return (
                    <button
                      key={`event-${entry.id}`}
                      onClick={() => handleNavigateToVerse(entry.verseRef)}
                      className="absolute rounded-md bg-scripture-warning/30 hover:bg-scripture-warning/40 border border-scripture-warning/60 transition-colors cursor-pointer overflow-hidden flex flex-col justify-center px-1.5"
                      style={{
                        top: top + 1,
                        height: barHeight - 2,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                      }}
                      title={tooltip}
                    >
                      <span className="text-[10px] text-scripture-text font-medium truncate block leading-tight">
                        {entry.label}
                      </span>
                      {entry.yearLabel && barHeight >= 36 && (
                        <span className="text-[9px] text-scripture-muted truncate block leading-tight">
                          {entry.yearLabel}
                        </span>
                      )}
                    </button>
                  );
                }

                if (entry.type === 'person') {
                  const barHeight = Math.max(naturalHeight, MIN_BAR_PX);
                  const displayYear = entry.yearLabel || yearLabel;
                  return (
                    <button
                      key={`person-${entry.id}`}
                      onClick={() => handleNavigateToVerse(entry.verseRef)}
                      className="absolute rounded-md bg-scripture-accent/70 hover:bg-scripture-accent border border-scripture-accent transition-colors cursor-pointer overflow-hidden flex flex-col justify-center px-1.5"
                      style={{
                        top: top + 1,
                        height: barHeight - 2,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                      }}
                      title={tooltip}
                    >
                      <span className="text-[10px] text-white font-medium truncate block leading-tight">
                        {entry.label}
                      </span>
                      {barHeight >= 36 && (
                        <span className="text-[9px] text-white/70 truncate block leading-tight">
                          {displayYear}
                        </span>
                      )}
                    </button>
                  );
                }

                return (
                  <button
                    key={`time-${entry.id}`}
                    onClick={() => handleNavigateToVerse(entry.verseRef)}
                    className="absolute flex items-center gap-1.5 cursor-pointer rounded-sm bg-scripture-elevated/90 hover:bg-scripture-elevated border border-scripture-border/40 px-1.5 overflow-hidden transition-colors"
                    style={{
                      top: top - 10,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      height: 20,
                    }}
                    title={tooltip}
                  >
                    <span className="text-[10px] text-scripture-muted shrink-0">🕐</span>
                    <span className="text-[10px] text-scripture-text font-medium truncate leading-none">
                      {entry.label}
                    </span>
                    <span className="text-[9px] text-scripture-muted shrink-0">
                      {yearLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
