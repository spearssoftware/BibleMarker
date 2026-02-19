import { useState, useMemo } from 'react';
import { useTimeStore } from '@/stores/timeStore';
import { usePeopleStore } from '@/stores/peopleStore';
import { useStudyStore } from '@/stores/studyStore';
import { useBibleStore } from '@/stores/bibleStore';
import { formatVerseRef } from '@/types/bible';
import type { VerseRef } from '@/types/bible';

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

const MIN_CHART_HEIGHT = 400;
const MIN_BAR_PX = 24;
const AXIS_WIDTH = 64;
const MIN_LANE_WIDTH = 80;

export function Timeline() {
  const { timeExpressions } = useTimeStore();
  const { people } = usePeopleStore();
  const { activeStudyId } = useStudyStore();
  const { currentBook, currentChapter, setLocation, setNavSelectedVerse } = useBibleStore();
  const [filterByBook, setFilterByBook] = useState(true);

  const handleNavigateToVerse = (verseRef: VerseRef) => {
    if (verseRef.book !== currentBook || verseRef.chapter !== currentChapter) {
      setLocation(verseRef.book, verseRef.chapter);
      setTimeout(() => setNavSelectedVerse(verseRef.verse), 300);
    } else {
      setNavSelectedVerse(verseRef.verse);
    }
  };

  const { lanedEntries, ticks, chartHeight, minNum, pxPerYear, numLanes } = useMemo(() => {
    const empty = { lanedEntries: [] as SwimLaneEntry[], ticks: [] as { num: number; label: string }[], chartHeight: 0, minNum: 0, pxPerYear: 0, numLanes: 0 };

    const matchesStudy = (studyId: string | undefined) =>
      !activeStudyId || !studyId || studyId === activeStudyId;
    const matchesBook = (book: string) => !currentBook || !filterByBook || book === currentBook;

    const rawTimeEntries = timeExpressions
      .filter(t => t.year != null && t.yearEra && matchesStudy(t.studyId) && matchesBook(t.verseRef.book))
      .map(t => {
        const num = toNum(t.year!, t.yearEra!);
        return { type: 'time' as const, id: t.id, label: t.expression, startNum: num, endNum: num, verseRef: t.verseRef };
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

    const allEntries = [...rawTimeEntries, ...rawPersonEntries];
    if (allEntries.length === 0) return empty;

    const allNums = allEntries.flatMap(e => [e.startNum, e.endNum]);
    const rawMin = Math.min(...allNums);
    const rawMax = Math.max(...allNums);
    const range = Math.max(rawMax - rawMin, 1);
    const pad = Math.max(range * 0.08, 5);
    const minN = rawMin - pad;
    const maxN = rawMax + pad;
    const totalRange = maxN - minN;

    const pxPY = Math.max(3, MIN_CHART_HEIGHT / totalRange);
    const height = totalRange * pxPY;

    const laned = assignLanes(allEntries);
    const nLanes = Math.max(1, ...laned.map(e => e.lane + 1));

    const interval = getNiceInterval(range);
    const firstTick = Math.ceil(rawMin / interval) * interval;
    const lastTick = Math.floor(rawMax / interval) * interval;
    const tickList: { num: number; label: string }[] = [];
    for (let n = firstTick; n <= lastTick; n += interval) {
      tickList.push({ num: n, label: formatYearNum(n) });
    }

    return { lanedEntries: laned, ticks: tickList, chartHeight: height, minNum: minN, pxPerYear: pxPY, numLanes: nLanes };
  }, [timeExpressions, people, activeStudyId, currentBook, filterByBook]);

  const getTop = (num: number) => (num - minNum) * pxPerYear;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-ui font-semibold text-scripture-text">Timeline</h3>
        <label className="flex items-center gap-2 text-xs text-scripture-muted cursor-pointer">
          <input
            type="checkbox"
            checked={filterByBook}
            onChange={(e) => setFilterByBook(e.target.checked)}
            className="rounded"
          />
          Current Book Only
        </label>
      </div>

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

              {/* Entries */}
              {lanedEntries.map((entry) => {
                const top = getTop(entry.startNum);
                const naturalHeight = (entry.endNum - entry.startNum) * pxPerYear;
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
                      className="absolute rounded-sm bg-scripture-accent/75 hover:bg-scripture-accent transition-colors cursor-pointer overflow-hidden flex flex-col justify-center px-1.5"
                      style={{
                        top,
                        height: barHeight,
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
                    className="absolute flex items-center gap-1 cursor-pointer group/event"
                    style={{
                      top: top - 5,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      height: 10,
                    }}
                    title={tooltip}
                  >
                    <div className="w-2 h-2 rounded-full bg-scripture-muted group-hover/event:bg-scripture-text transition-colors shrink-0" />
                    <span className="text-[10px] text-scripture-text truncate leading-none">
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
