/**
 * Symbol → PNG rasterization + caching for PDF export.
 *
 * Phosphor symbols are SVG; jsPDF embeds raster images. We rasterize each
 * unique (symbol, color) pair once to a PNG data URL and look it up by a
 * stable key while building the document.
 */

import type { Annotation, MarkingPreset } from '@/types';
import { getHighlightColorHex, type HighlightColor, type SymbolKey } from '@/types';
import { getSymbolMarkup } from '@/lib/symbolDisplay';

/** Stable cache key for a (symbol, colorHex) pair. */
export function iconCacheKey(symbol: SymbolKey, colorHex: string | undefined): string {
  return `${symbol}|${colorHex ?? ''}`;
}

/** Render a Phosphor SVG to a PNG data URL at 2x the requested pt size
 *  (for crisp rendering at print resolutions). Returns null if rasterization
 *  fails (e.g. no canvas in Node/headless) — callers fall back to no icon. */
export async function rasterizeSymbol(symbol: SymbolKey, colorHex: string | undefined, sizePt: number): Promise<string | null> {
  const color = colorHex ?? '#222';
  const markup = getSymbolMarkup(symbol, color);
  if (!markup) return null;
  // getSymbolMarkup wraps the SVG in a <span style="color:…"> and relies on
  // CSS `currentColor` to tint the Phosphor paths. We rasterize the bare SVG
  // (without that span), so the color would otherwise be lost — bake it in by
  // substituting currentColor with the actual hex. Duotone keeps its two-tone
  // look because the faint background layer shares the same currentColor.
  const svgMatch = markup.match(/<svg[\s\S]*<\/svg>/);
  if (!svgMatch) return null;
  // Force an explicit width/height on the SVG so canvas drawImage knows the
  // intrinsic size — Phosphor's em-based sizing gives 0×0 on a free SVG.
  const svgStr = svgMatch[0]
    .replace(/currentColor/g, color)
    .replace(/<svg([^>]*)>/, (_m, attrs) => {
      const cleaned = String(attrs)
        .replace(/\swidth="[^"]*"/, '')
        .replace(/\sheight="[^"]*"/, '');
      return `<svg${cleaned} width="64" height="64">`;
    });
  const px = Math.max(16, Math.round(sizePt * 2));

  try {
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('SVG image load failed'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = px;
      canvas.height = px;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, px, px);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.warn('[pdf] symbol rasterize failed for', symbol, err);
    return null;
  }
}

interface IconKey { symbol: SymbolKey; colorHex: string | undefined }

/** Rasterize a deduped set of keys into a lookup map (keyed by `iconCacheKey`). */
async function buildCacheFromKeys(keys: IconKey[], sizePt: number): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  await Promise.all(
    keys.map(async ({ symbol, colorHex }) => {
      const dataUrl = await rasterizeSymbol(symbol, colorHex, sizePt);
      if (dataUrl) cache.set(iconCacheKey(symbol, colorHex), dataUrl);
    }),
  );
  return cache;
}

function dedupeKeys(keys: IconKey[]): IconKey[] {
  const seen = new Set<string>();
  const out: IconKey[] = [];
  for (const k of keys) {
    const key = iconCacheKey(k.symbol, k.colorHex);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

/** Icon cache for the passage exporter: every unique symbol annotation across
 *  the per-verse annotation lists. */
export async function buildIconCache(annotationsByVerse: Annotation[][], sizePt: number): Promise<Map<string, string>> {
  const keys: IconKey[] = [];
  for (const list of annotationsByVerse) {
    for (const ann of list) {
      if (ann.type !== 'symbol') continue;
      const colorHex = ann.color ? getHighlightColorHex(ann.color as HighlightColor) : undefined;
      keys.push({ symbol: ann.symbol, colorHex });
    }
  }
  return buildCacheFromKeys(dedupeKeys(keys), sizePt);
}

/** Icon cache for the observation exporter: every keyword preset that carries
 *  a symbol, tinted by the preset's highlight color. */
export async function buildPresetIconCache(presets: MarkingPreset[], sizePt: number): Promise<Map<string, string>> {
  const keys: IconKey[] = [];
  for (const p of presets) {
    if (!p.symbol) continue;
    const colorHex = p.highlight?.color ? getHighlightColorHex(p.highlight.color) : undefined;
    keys.push({ symbol: p.symbol, colorHex });
  }
  return buildCacheFromKeys(dedupeKeys(keys), sizePt);
}
