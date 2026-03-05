import { useMemo, useEffect, useRef } from 'react';
import { useTimeStore } from '@/stores/timeStore';
import { usePeopleStore } from '@/stores/peopleStore';
import { useStudyStore } from '@/stores/studyStore';
import { useBibleStore } from '@/stores/bibleStore';
import { formatVerseRef } from '@/types';
import type { VerseRef } from '@/types';

interface SwimLaneEntry {
  type: 'time' | 'person';
  id: string;
  label: string;
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
    let lane = laneEnds.findIndex(end => end <= entry.startNum);
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

    if (rawTimeEntries.length === 0 && rawPersonEntries.length === 0) return empty;

    // Build ordinal scale: each unique data year gets one SLOT_PX slot.
    // Years that fall between data points (e.g. axis ticks) are interpolated.
    const allNums = [...rawTimeEntries, ...rawPersonEntries].flatMap(e => [e.startNum, e.endNum]);
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

    const rawLanedPeople = assignLanes(rawPersonEntries);
    const numPeopleLanes = rawLanedPeople.length > 0 ? Math.max(...rawLanedPeople.map(e => e.lane + 1)) : 0;
    const lanedPeople = rawLanedPeople.map(e => ({ ...e, lane: e.lane + numTimeLanes }));
    const laned = [...lanedTime, ...lanedPeople];
    const nLanes = Math.max(1, numTimeLanes + numPeopleLanes);

    const firstTick = Math.ceil(rawMin / interval) * interval;
    const lastTick = Math.floor(rawMax / interval) * interval;
    const tickList: { num: number; label: string }[] = [];
    for (let n = firstTick; n <= lastTick; n += interval) {
      tickList.push({ num: n, label: formatYearNum(n) });
    }

    return { lanedEntries: laned, ticks: tickList, chartHeight: chartH, yearToPixel: toPixel, numLanes: nLanes, timeLaneCount: numTimeLanes };
  }, [timeExpressions, people, activeStudyId, currentBook, filterByBook]);

  const getTop = yearToPixel;

  return (
    <div>
      {lanedEntries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-scripture-muted text-sm mb-2">No timeline entries yet.</p>
          <p className="text-scripture-muted text-xs">
            Add years to time expressions or people in the Observation tools to see them here.
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

                if (entry.type === 'person') {
                  const barHeight = Math.max(naturalHeight, MIN_BAR_PX);
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
                          {yearLabel}
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
