# Plan: Unify Key Words with Highlighting & Symbols

## Executive Summary

**Key Words** and **Highlighting/Symbols** currently overlap in concept and implementation. Keywords are "word → (symbol or color)" definitions that produce the same visual annotations as manual highlighting/symbols, but with two separate systems: a KeyWordManager for definitions and a Toolbar for ad-hoc marking. This plan proposes a **unified marking system** where:

- **Marking Presets** (renamed/evolved from Key Words) = reusable (symbol + color) combos with optional **word matching** for auto-suggest
- **Annotations** stay as-is (TextAnnotation, SymbolAnnotation) but can optionally reference a preset
- One mental model: "I mark text with a symbol and/or color; I can save that as a preset and optionally tie it to words for quick reuse."

---

## 1. Current State: Overlaps & Gaps

### 1.1 Key Words

| Aspect | Implementation |
|--------|----------------|
| **Data** | `KeyWordDefinition`: `word`, `variants`, `symbol?`, `color?`, `category`, `description`, `autoSuggest`, `usageCount` |
| **Store** | `keyWordStore` + IndexedDB `keyWords` table |
| **UI** | KeyWordManager (define/edit), KeyWordLegend, KeyWordFinder (find occurrences) |
| **Flow** | Select text → if it matches a keyword (autoSuggest) → suggest "Key Word: X" → apply creates **SymbolAnnotation** or **TextAnnotation** (symbol **or** color; symbol wins if both) |
| **Annotation link** | **None.** The created annotation does not store `keyWordId`. You cannot "find all uses of this key word" from annotations. KeyWordFinder searches **text** in the Bible, not annotations. |

### 1.2 Highlighting / Symbols

| Aspect | Implementation |
|--------|----------------|
| **Data** | `TextAnnotation` (highlight/textColor/underline + `color`), `SymbolAnnotation` (symbol + optional `color`) |
| **Store** | `annotationStore` + IndexedDB `annotations` |
| **UI** | Toolbar: Highlight, Text Color, Underline, Symbol → ColorPicker, SymbolPicker |
| **Flow** | Select text → pick tool + color/symbol → apply → creates annotation |
| **Suggestions** | "Previously used for [selection]" from **annotations** (same selection text + type+color or symbol). Shown alongside keyword suggestions. |

### 1.3 Overlap (Where It Gets Redundant)

1. **Symbol + color**  
   - Keywords: `symbol` and `color` both exist; **only one is used when applying** (symbol wins).  
   - Manual: Symbol can have `color`; highlight has `color`.  
   - **Gap:** A keyword cannot mean "highlight in X and also put symbol Y." It’s either/or.

2. **Categories**  
   - **KeyWord**: `KEY_WORD_CATEGORIES` (identity, people, places, time, actions, themes, contrasts, conclusions, custom).  
   - **Symbols**: `SYMBOL_CATEGORIES` (Identity, People & Characters, Concepts & Themes, Scripture & Teaching, Time & Sequence, Geography & Place, Actions & States, General Markers, …).  
   - **Overlap:** Identity, People, Time, Themes, etc. Same ideas, different names and structures.

3. **Suggestions in Toolbar**  
   - **Keyword suggestions**: "Key Word: God" (from KeyWordDefinition).  
   - **Previous-use suggestions**: "Symbol: ✝", "Highlight: yellow" (from annotations).  
   - Both appear in the same list. Conceptually: "something I’ve used for this phrase before" vs "a predefined meaning for this phrase." The source differs; the result (an annotation) is the same type.

4. **Legend / reference**  
   - KeyWordLegend: groups by KeyWord category, shows word + symbol/color.  
   - There is no "Symbol Legend" or "Highlight Legend" for ad-hoc symbols/colors. So we have a legend for key words but not for "plain" symbols.

5. **Finding occurrences**  
   - KeyWordFinder: search Bible text for `word`/`variants`, optionally in scope. Does **not** use `annotationId` from `KeyWordOccurrence` in a central way; it’s about **text** matching.  
   - There is no "find where I used this symbol or this color" on annotations.

### 1.4 Gaps

- **No `keyWordId` on annotations** → can’t query "all annotations for key word X" or "all verses where I marked God."
- **Keyword = symbol OR color** → can’t express "God = triangle + purple highlight."
- **Two separate UIs** for "define a reusable style" (KeyWordManager) vs "pick symbol/color" (SymbolPicker/ColorPicker).  
- **Duplicate category systems** for organizing symbols vs keywords.

---

## 2. Unified Model: Marking Presets

### 2.1 Core Idea

Treat **keywords** as one use case of a more general concept: **Marking Presets**.

- A **Marking Preset** defines:
  - **Visual:** `symbol?` and/or `color?` (for highlight/textColor/underline) and optionally `textStyle?: 'highlight' | 'textColor' | 'underline'`.
  - **Semantic (optional):** `word`, `variants`, `category`, `description` for organization and auto-suggest.
  - **Behavior:** `autoSuggest: boolean` (when selection matches `word`/`variants`, suggest this preset).

- **Annotations** (unchanged structurally at first) get an optional:
  - `presetId?: string`
  so we can later support "find all for this preset" and "legend from presets."

### 2.2 Name: Keep "Key Words" or Introduce "Marking Presets"?

**Option A – Keep "Key Words" and broaden meaning**  
- Pros: Familiar Precept term; no renaming in UI.  
- Cons: "Key Word" implies "word" is required; we’d be overloading it.

**Option B – Introduce "Marking Presets" and make "Key Words" a view**  
- Preset = (symbol?, color?, textStyle?) + optional (word, variants, category, description, autoSuggest).  
- "Key Words" = filtered view: presets that have `word` set. KeyWordManager becomes "Preset Manager" with a "Key Words" filter/tab.  
- Pros: Clear that a preset can be symbol-only, color-only, or both; key words are a subcase.  
- Cons: Slightly more generic terminology.

**Recommendation: Option B** — Use **Marking Presets** as the backend/conceptual type. Expose:
- **"Key Words"** as the main user-facing label for "presets that have a word and auto-suggest," to keep Precept language.
- **"My symbols/colors"** or **"Presets"** for presets without a word (e.g. "purple triangle" for ad-hoc reuse).

---

## 3. Data Model Changes

### 3.1 `MarkingPreset` (replaces `KeyWordDefinition`)

```ts
interface MarkingPreset {
  id: string;

  // --- Visual (at least one of symbol or highlightStyle needed) ---
  symbol?: SymbolKey;
  /** If set, use with highlight/textColor/underline. If symbol is also set, we can do BOTH. */
  highlight?: {
    style: 'highlight' | 'textColor' | 'underline';
    color: HighlightColor;
  };

  // --- Optional: Key Word semantics ---
  word?: string;           // when set, this is a "key word" preset
  variants: string[];       // only meaningful when word is set
  category?: KeyWordCategory;  // reuse, or rename to PresetCategory
  description?: string;

  // --- Behavior ---
  autoSuggest: boolean;     // suggest when selection matches word/variants (if word set)

  // --- Bookkeeping ---
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}
```

- **Migration:** `KeyWordDefinition` → `MarkingPreset`:  
  - `symbol` → `symbol`;  
  - `color` → `highlight: { style: 'highlight', color }` when we used to do highlight; if we had only symbol+color on symbol, we can put `color` on `SymbolAnnotation` and optionally add `highlight` for a new "symbol + highlight" combo.  
  - `word`, `variants`, `category`, `description`, `autoSuggest`, `usageCount` map over.  
  - For old keywords that had both symbol and color: we have to choose a default (e.g. symbol only, or both) and migrate.

### 3.2 Annotation: optional `presetId`

- **TextAnnotation** and **SymbolAnnotation**: add optional `presetId?: string`.
- When applying a preset that has both `symbol` and `highlight`, we create **two** annotations (or we introduce a **combined** type; see 4.1). For simplicity, Phase 1 can support:
  - preset with **only** `symbol` → one `SymbolAnnotation` with `presetId`;
  - preset with **only** `highlight` → one `TextAnnotation` with `presetId`;
  - preset with **both** → one `SymbolAnnotation` and one `TextAnnotation`, both with same `presetId`.

### 3.3 Categories: Unify

- Use a **single** category system for both presets and the symbol picker.  
- Options:
  - **A)** `KEY_WORD_CATEGORIES` as the single source; map `SYMBOL_CATEGORIES` to those where they align (Identity, People, Time, Themes, etc.) and keep a "General / Other" for the rest.  
  - **B)** New `PRESET_CATEGORIES` / `MARKING_CATEGORIES` that explicitly cover: Identity, People, Places, Time, Themes, Contrasts, Conclusions, Scripture/Teaching, Actions, General.  
- **Recommendation:** Define `MARKING_CATEGORIES` (or keep `KEY_WORD_CATEGORIES` name) as the one place. SymbolPicker and PresetManager both use it for grouping; PresetManager can also allow "uncategorized."

---

## 4. Application Logic (Apply Preset)

### 4.1 When User Applies a Preset (from suggestion or from a "Preset" picker)

- **Preset with `symbol` only:**  
  - `createSymbolAnnotation(symbol, 'center', preset.highlight?.color ?? presetColor, 'overlay')` with `presetId: preset.id`.
- **Preset with `highlight` only:**  
  - `createTextAnnotation(preset.highlight.style, preset.highlight.color)` with `presetId: preset.id`.
- **Preset with both:**  
  - Create `SymbolAnnotation` (with `presetId`) and `TextAnnotation` (with `presetId`).  
  - **Optional later:** a single annotation type `type: 'marking'` that can hold both symbol and highlight to avoid doubles in the list and in rendering. For Phase 1, two annotations are acceptable.

### 4.2 Suggestion Logic in Toolbar

- **Preset-based (Key Word) suggestions:**  
  - Selection matches `word`/`variants` and `autoSuggest` → suggest preset (label: key word name or "Preset: …").
- **Previous-use suggestions (from annotations):**  
  - Keep: same `selectedText` + same `type`+`color` or `symbol` → suggest.  
  - **Enhancement:** if that annotation has `presetId`, we could show the preset name and, when applied, reuse the preset (and thus `presetId`) so "find by preset" stays consistent.

### 4.3 Key Word / Preset Picker in Toolbar

- Today: ColorPicker and SymbolPicker are separate; Key Words only appear as **suggestions** when the selection matches.  
- **Enhancement:** A "Key Words" or "Presets" chip in the toolbar that opens a **Preset Picker** (list of presets with word; optionally a "General presets" section for symbol+color combos without a word). Choosing one applies it to the current selection.  
- This makes "key words" and "recent symbol+color combos" one flow: pick from presets, or pick raw symbol/color.

---

## 5. UI / UX Changes

### 5.1 KeyWordManager → Preset Manager (with Key Words as main view)

- **Tabs or filters:** "Key Words" (presets with `word`), "Symbols & Colors" (presets without `word`), "All."
- **Editor:**  
  - Symbol (optional), Highlight (optional: style + color). At least one required.  
  - Word (optional), Variants, Category, Description, Auto-suggest.  
  - If `word` is set, we show it as a "Key Word" in the Key Words view.
- **Migration path:** Existing key words become presets with `word` set; symbol and/or color preserved.

### 5.2 Toolbar

- **Suggestions:**  
  - Preset-based (Key Word) and annotation-based (previous use) remain.  
  - For presets with both symbol and highlight, the suggestion clearly shows both (e.g. "God: ▲ + purple").
- **Optional: Preset / Key Word picker**  
  - Icon or "Key Words" that opens Preset Picker for current selection, so key words are not only reactive (on match) but also proactively selectable.

### 5.3 SymbolPicker and ColorPicker

- Can stay as they are for **ad-hoc** marking.  
- **Optional:** "Save as Preset" / "Save as Key Word" after applying:  
  - "You just used ✝ + red. Save as Key Word? [Word: ____] [Create Preset] [Skip]."  
  - This bridges ad-hoc and key words.

### 5.4 KeyWordLegend

- Becomes **Marking / Key Word Legend**.  
- Shows presets (key words first, then symbol-only or color-only presets).  
- Grouping by unified category.

### 5.5 KeyWordFinder

- Remains: search for `word`/`variants` in Bible text.  
- **Enhancement:** When an occurrence is already marked with an annotation that has `presetId` matching this key word, show a small indicator (e.g. "✓ marked") and optionally scroll to it.  
- **Future:** "Find all annotations for this preset" (query by `presetId`).

---

## 6. Implementation Phases

### Phase 1 – Non-breaking unification (recommended first)

1. **Data model**
   - Add `presetId` to `TextAnnotation` and `SymbolAnnotation` (optional, backward compatible).
   - Introduce `MarkingPreset` in types and DB; **migrate** `KeyWordDefinition` → `MarkingPreset` (symbol and/or highlight; for "both" in old keywords, start with symbol-only to match current behavior).
2. **Apply logic**
   - When applying a key word (preset with `word`): set `presetId` on the created annotation(s). Support presets with `highlight` only or `symbol` only.
3. **Categories**
   - Unify into one `MARKING_CATEGORIES` (or keep `KEY_WORD_CATEGORIES`); use in KeyWordManager and, where useful, in SymbolPicker. No need to change SymbolPicker layout in Phase 1.
4. **No UI renames yet**  
   - KeyWordManager, KeyWordLegend, KeyWordFinder keep their names; they work with `MarkingPreset` under the hood.

**Deliverables:** Presets in DB, `presetId` on annotations, key-word apply writes `presetId`, single category source. KeyWordFinder can later use `presetId` for "marked" badge.

### Phase 2 – Keywords can be symbol + highlight

1. **Preset model**
   - `highlight` as `{ style, color }`; preset may have `symbol`, `highlight`, or both.
2. **Apply**
   - If both: create `SymbolAnnotation` and `TextAnnotation`, both with `presetId`.
3. **KeyWordManager editor**
   - Add "Highlight" (style + color) alongside "Symbol"; at least one required.
4. **KeyWordLegend / suggestions**
   - Show "▲ + purple" when both are set.

### Phase 3 – Preset Manager and Toolbar

1. **Rename / reframe**
   - KeyWordManager → "Key Words & Presets" or "Marking Presets"; tab "Key Words" for those with `word`.
2. **Preset Picker in Toolbar**
   - Optional button to pick a preset (or key word) and apply to selection, without relying only on text match.
3. **"Save as Preset" from ad-hoc**
   - After applying a symbol or highlight, optional "Save as Key Word / Preset" flow.

### Phase 4 – Find by preset and legend

1. **KeyWordFinder**
   - Use `presetId` on annotations to show "marked" and optionally "Find markings" for a preset.
2. **Legend**
   - Include all presets (not only key words), grouped by category.

---

## 7. File-Level Checklist

| Area | Files to touch |
|------|----------------|
| **Types** | `annotation.ts` (add `presetId` to TextAnnotation, SymbolAnnotation), `keyWord.ts` → `markingPreset.ts` or evolve `keyWord.ts` to `MarkingPreset` and keep `KeyWordDefinition` as a legacy alias during migration. |
| **DB** | `db.ts`: `keyWords` → `markingPresets` (or keep table name and migrate contents); migration for `KeyWordDefinition` → `MarkingPreset`; indexes if we query by `presetId` on annotations (Dexie stores annotations; we’d need to add `presetId` to the annotation store and, if we have one, an index). |
| **Stores** | `keyWordStore` → `markingPresetStore` (or keep name and have it hold `MarkingPreset[]`). |
| **KeyWordManager** | Support `MarkingPreset`; editor: symbol and/or highlight; category from unified list. |
| **KeyWordLegend** | Use `MarkingPreset`; show symbol and/or highlight. |
| **KeyWordFinder** | Use `MarkingPreset`; optional: check annotations for `presetId` to show "marked." |
| **Toolbar** | `handleApplySuggestion` for presets: create symbol and/or highlight annotations with `presetId`; support both in a preset. Optional: Preset Picker. |
| **useAnnotations** | `createTextAnnotation` and `createSymbolAnnotation`: accept optional `presetId` and pass through. |
| **SymbolPicker / ColorPicker** | Optional: "Save as Preset" and use of unified categories. |

---

## 8. Open Decisions

1. **One annotation type for "symbol + highlight"?**  
   - Phase 1–2: two annotations (symbol, text) with same `presetId`.  
   - Later: one `type: 'marking'` with `symbol?` and `highlight?` if we want to simplify rendering and listing.

2. **Table name: `keyWords` vs `markingPresets`**  
   - Keeping `keyWords` reduces migration surface; the schema can be the new `MarkingPreset` shape.  
   - Renaming to `markingPresets` is clearer for new developers. Recommend: rename in code and run a one-time DB migration.

3. **Backward compatibility**  
   - Annotations without `presetId` remain valid.  
   - KeyWordFinder and "Find by preset" only apply to annotations with `presetId`.

4. **KeyWordCategory vs a broader PresetCategory**  
   - We can keep `KeyWordCategory` and reuse for all presets, or rename to `PresetCategory`/`MarkingCategory`. Low risk either way.

---

## 9. Summary

- **Unify** Key Words and Highlighting/Symbols under **Marking Presets**: (symbol?, highlight?) + optional (word, variants, category, description, autoSuggest).
- **Annotations** get optional `presetId` so we can "find by preset" and keep the legend in sync.
- **One category system** for symbols and key words; KeyWordManager becomes Preset Manager with a Key Words view.
- **Phased work:** Preset model + `presetId` and migration (Phase 1), then symbol+highlight in one preset (Phase 2), then UI polish and Preset Picker (Phase 3–4).
- **User-facing:** "Key Words" remains the main term for "word-linked presets"; "Presets" or "My symbols & colors" for the rest. The mental model is: one place to define reusable markings; key words are those tied to specific words for fast, consistent study.
