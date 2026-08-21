/**
 * Study filtering utilities
 *
 * Keywords: global always; when null show global-only; when study show global+study
 * Annotations: when null show default bucket; when study show global+study (hide manual/freeform)
 */

import type { MarkingPreset } from '@/types';
import type { Annotation } from '@/types';

/**
 * True if a preset-less annotation is visible under activeStudyId, based on
 * its own studyId — falling back to the legacy default-bucket rule
 * (`!activeStudyId`) for annotations created before studyId existed.
 */
function presetlessAnnotationVisible(studyId: string | undefined, activeStudyId: string | null): boolean {
  if (studyId) return studyId === activeStudyId;
  return !activeStudyId;
}

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
 * Infer annotation study from preset when one is set; otherwise from the
 * annotation's own studyId (set at creation time for quick highlights/
 * symbols made without a preset).
 * - With a presetId: study comes from the preset (preset.studyId null = global, always visible)
 * - Without a presetId: study comes from ann.studyId
 *   - ann.studyId set: visible only when it matches activeStudyId
 *   - ann.studyId unset (legacy data predating this field): default-bucket
 *     rule — visible only when activeStudyId is null
 */
export function filterAnnotationsByStudy(
  annotations: Annotation[],
  presetMap: Map<string, MarkingPreset>,
  activeStudyId: string | null
): Annotation[] {
  return annotations.filter((ann) => {
    const presetId = 'presetId' in ann ? ann.presetId : undefined;

    if (!presetId) {
      return presetlessAnnotationVisible(ann.studyId, activeStudyId);
    }

    const preset = presetMap.get(presetId);
    if (!preset) return !activeStudyId;

    return !preset.studyId || preset.studyId === activeStudyId;
  });
}
