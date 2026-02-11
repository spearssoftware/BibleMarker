/**
 * Study filtering utilities
 *
 * Keywords: global always; when null show global-only; when study show global+study
 * Annotations: when null show default bucket; when study show global+study (hide manual/freeform)
 */

import type { MarkingPreset } from '@/types/keyWord';
import type { Annotation } from '@/types/annotation';

/**
 * Filter presets by active study.
 * - Global presets (preset.studyId null/undefined): always visible
 * - When activeStudyId is null: show global only (default study mode)
 * - When activeStudyId is set: show global + study-scoped presets
 */
export function filterPresetsByStudy(
  presets: MarkingPreset[],
  activeStudyId: string | null
): MarkingPreset[] {
  return presets.filter((p) => {
    if (!p.studyId) return true;
    if (!activeStudyId) return false;
    return p.studyId === activeStudyId;
  });
}

/**
 * Infer annotation study from preset: no preset or preset.studyId null = default bucket.
 * - Default bucket = annotations with no presetId or preset.studyId null (manual + global keyword annotations)
 * - Default mode (null): show default-bucket annotations only
 * - Study mode: show global (preset.studyId null) + study annotations only; hide default (manual/freeform) when study is active
 */
export function filterAnnotationsByStudy(
  annotations: Annotation[],
  presetMap: Map<string, MarkingPreset>,
  activeStudyId: string | null
): Annotation[] {
  return annotations.filter((ann) => {
    const presetId = 'presetId' in ann ? ann.presetId : undefined;

    if (!presetId) {
      return !activeStudyId;
    }

    const preset = presetMap.get(presetId);
    if (!preset) return !activeStudyId;

    return !preset.studyId || preset.studyId === activeStudyId;
  });
}
