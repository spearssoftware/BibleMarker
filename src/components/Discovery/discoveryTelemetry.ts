/**
 * Shared telemetry helpers for the Setting / Who's here / Look closer
 * components: one event per feature per {book, chapter, translation}.
 */

import { track, type TelemetryFeature } from '@/lib/telemetry';

export interface ChapterTelemetryScope {
  book: string;
  chapter: number;
  translationId: string;
}

type ChipEvent = 'discovery_chip_shown' | 'discovery_chip_tapped';

export function trackChip(event: ChipEvent, feature: TelemetryFeature, { book, chapter, translationId }: ChapterTelemetryScope): void {
  track(event, { feature, dedupeKey: `${event}:${feature}:${book}:${chapter}:${translationId}` });
}
