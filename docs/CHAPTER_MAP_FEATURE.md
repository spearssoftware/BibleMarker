# Chapter Map Feature Plan

> **Status: Not yet implemented.** This is a design/plan document for a future feature.

Display biblical locations mentioned in the current chapter on an interactive map with synchronized verse navigation.

## Overview

A split-view feature (similar to `MultiTranslationView`) that shows:
- **Left panel**: Interactive map with markers for all places mentioned in the chapter
- **Right panel**: Place list with verse references that scroll the Bible reader when clicked

## User Experience

### Activation
- Map icon button in `NavigationBar` (next to Search button)
- Opens split view with map on left, current chapter on right
- Map button shows active state when map view is open

### Interactions
1. **Map markers**: Click a marker → highlights corresponding place in the list
2. **Place list**: Click a verse reference → scrolls Bible reader to that verse (keeps map open)
3. **Place list hover**: Hovering a place highlights its marker on the map
4. **Map auto-fit**: Map automatically zooms/pans to fit all places in the chapter

### Example Flow
1. User is reading Acts 17
2. Clicks Map button in nav bar
3. Split view opens showing map with markers for: Thessalonica, Berea, Athens, Areopagus
4. User clicks "Acts 17:15" next to Athens → Bible reader scrolls to verse 15
5. User clicks Athens marker on map → Athens entry highlights in place list

---

## Data Architecture

### Source: OpenBible Geocoding Data
- Repository: https://github.com/openbibleinfo/Bible-Geocoding-Data
- License: CC-BY-4.0 (requires attribution)
- Format: JSON Lines files

### Key Data Files Needed

**1. `ancient.jsonl`** - Place definitions with verse references
```typescript
interface AncientPlace {
  id: string;                    // e.g., "a15257a"
  friendly_id: string;           // e.g., "jerusalem"
  type: string;                  // e.g., "settlement", "mountain", "river"
  verses: VerseReference[];      // All verses mentioning this place
  identifications: Identification[];
  modern_associations: Record<string, ModernAssociation>;
  translation_name_counts: Record<string, number>;  // Different spellings
}

interface VerseReference {
  osis: string;      // e.g., "Acts.17.15"
  usx: string;       // e.g., "ACT 17:15"
  readable: string;  // e.g., "Acts 17:15"
  sort: string;      // e.g., "44017015" (for sorting)
  translations: string[];  // Which translations include this place
}
```

**2. `modern.jsonl`** - Modern location coordinates
```typescript
interface ModernLocation {
  id: string;           // e.g., "m15257a"
  friendly_id: string;  // e.g., "jerusalem"
  lonlat: string;       // e.g., "35.2163,31.7683"
  type: string;         // e.g., "settlement"
  names: { name: string; type: string }[];
  media?: {
    thumbnail?: {
      file: string;
      credit: string;
      description: string;
    }
  }
}
```

### Bundled Data Strategy

Rather than shipping the full 15MB+ dataset, we'll create a **preprocessed lookup file**:

```typescript
// src/data/bible-places.json (generated at build time)
interface BiblePlacesData {
  // Lookup by OSIS verse reference
  verseToPlaces: Record<string, PlaceInfo[]>;
  
  // Place details indexed by place ID
  places: Record<string, {
    id: string;
    name: string;
    type: string;
    coordinates: [number, number];  // [lng, lat]
    thumbnail?: string;
  }>;
}

// Example entry
{
  "verseToPlaces": {
    "Acts.17.1": [
      { placeId: "a123", name: "Thessalonica" }
    ],
    "Acts.17.10": [
      { placeId: "a456", name: "Berea" }
    ]
  },
  "places": {
    "a123": {
      id: "a123",
      name: "Thessalonica",
      type: "settlement",
      coordinates: [22.9444, 40.6401],
      thumbnail: "thessalonica.jpg"
    }
  }
}
```

**Build Script**: `scripts/generate-bible-places.js`
- Downloads `ancient.jsonl` and `modern.jsonl` from GitHub
- Resolves ancient places → modern coordinates
- Filters to places with confident identifications (score > 300)
- Generates optimized JSON (~500KB estimated)

---

## Component Architecture

### New Components

```
src/components/ChapterMap/
├── index.ts
├── ChapterMapView.tsx      # Main split-view container
├── MapPanel.tsx            # Leaflet map with markers
├── PlaceList.tsx           # List of places with verse refs
├── PlaceListItem.tsx       # Individual place entry
└── MapMarker.tsx           # Custom marker component
```

### Component Details

**`ChapterMapView.tsx`** - Split view container
```tsx
interface ChapterMapViewProps {
  book: string;
  chapter: number;
  onVerseClick: (verse: number) => void;
  onClose: () => void;
}

// Layout: CSS Grid with resizable panels
// Left: MapPanel (flex: 1)
// Right: Bible reader content (flex: 1)
```

**`MapPanel.tsx`** - Leaflet map
```tsx
interface MapPanelProps {
  places: PlaceWithVerses[];
  selectedPlaceId: string | null;
  onMarkerClick: (placeId: string) => void;
  onMarkerHover: (placeId: string | null) => void;
}

// Uses: react-leaflet
// Tiles: OpenStreetMap (free, no API key)
// Auto-fits bounds to show all markers
```

**`PlaceList.tsx`** - Place listing with verse links
```tsx
interface PlaceListProps {
  places: PlaceWithVerses[];
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  onPlaceClick: (placeId: string) => void;
  onPlaceHover: (placeId: string | null) => void;
  onVerseClick: (verse: number) => void;
}

// Shows: Place name, type icon, verse references
// Verse refs are clickable → scroll to verse
```

### State Management

**Option A: Local state in ChapterMapView** (Recommended for v1)
- Simple useState for selectedPlaceId, hoveredPlaceId
- Pass callbacks down to children

**Option B: Zustand store** (If needed later)
```typescript
// src/stores/mapStore.ts
interface MapState {
  isMapOpen: boolean;
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  // actions
  openMap: () => void;
  closeMap: () => void;
  selectPlace: (id: string | null) => void;
  hoverPlace: (id: string | null) => void;
}
```

---

## Dependencies

### New Packages
```json
{
  "leaflet": "^1.9.4",
  "react-leaflet": "^4.2.1",
  "@types/leaflet": "^1.9.8"
}
```

### Why Leaflet + OpenStreetMap?
- **Free**: No API keys, no usage limits, no cost
- **Offline-capable**: Can cache tiles for offline use (future enhancement)
- **Lightweight**: ~40KB gzipped
- **Well-supported**: Large ecosystem, good React bindings

---

## Implementation Steps

### Phase 1: Data Pipeline
1. [ ] Create `scripts/generate-bible-places.js` to process OpenBible data
2. [ ] Generate `src/data/bible-places.json`
3. [ ] Create TypeScript types for the data structures
4. [ ] Create `src/lib/bible-places.ts` with lookup functions:
   - `getPlacesForChapter(book: string, chapter: number): PlaceWithVerses[]`
   - `getPlaceById(id: string): Place | null`

### Phase 2: Map Components
1. [ ] Install leaflet and react-leaflet
2. [ ] Create `MapPanel.tsx` with basic Leaflet setup
3. [ ] Add custom markers with place type icons
4. [ ] Implement auto-fit bounds
5. [ ] Add marker click/hover interactions

### Phase 3: Place List
1. [ ] Create `PlaceList.tsx` and `PlaceListItem.tsx`
2. [ ] Style to match existing app design (scripture-* colors)
3. [ ] Add verse reference links
4. [ ] Implement highlight states for selected/hovered

### Phase 4: Integration
1. [ ] Create `ChapterMapView.tsx` split container
2. [ ] Add Map button to `NavigationBar.tsx`
3. [ ] Wire up verse clicking to scroll Bible reader
4. [ ] Add keyboard shortcut (e.g., Cmd+M)

### Phase 5: Polish
1. [ ] Add loading states while map initializes
2. [ ] Handle chapters with no places gracefully
3. [ ] Add attribution footer for OpenBible.info
4. [ ] Responsive design for mobile (stack vertically)
5. [ ] Add to Settings: option to disable map feature

---

## UI Mockup

```
┌─────────────────────────────────────────────────────────────────┐
│  ← [ESV ▼]     [Acts ▼] [17 ▼] [1 ▼]          🔍  🗺️  →       │  ← Map button
├─────────────────────────────────┬───────────────────────────────┤
│                                 │                               │
│         ┌─────────────┐         │   PLACES IN ACTS 17           │
│         │    MAP      │         │                               │
│    ●    │             │  ●      │   📍 Thessalonica             │
│ Athens  │   ●Berea    │Thess.   │      Acts 17:1, 17:11, 17:13  │
│         │             │         │                               │
│         └─────────────┘         │   📍 Berea                    │
│                                 │      Acts 17:10, 17:13        │
│    [OpenStreetMap attribution]  │                               │
│                                 │   📍 Athens ← highlighted     │
│                                 │      Acts 17:15, 17:16, 17:22 │
│                                 │                               │
│                                 │   📍 Areopagus                │
│                                 │      Acts 17:19, 17:22        │
│                                 │                               │
├─────────────────────────────────┴───────────────────────────────┤
│  1 Now when they had passed... (Bible text continues below)     │
│  ...                                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Edge Cases

1. **Chapter with no places**: Show friendly message "No geographic locations identified in this chapter"
2. **Place with uncertain location**: Show with different marker style, tooltip explains uncertainty
3. **Multiple places at same coordinates**: Cluster markers or offset slightly
4. **Very large chapters (e.g., Numbers 33)**: Paginate place list or use virtual scrolling
5. **Offline mode**: Cache map tiles (Tauri can intercept requests)

---

## Attribution Requirements

OpenBible.info data is CC-BY-4.0. Required attribution:

```
Geographic data from OpenBible.info, licensed under CC-BY-4.0
Map tiles © OpenStreetMap contributors
```

Display in:
- Map panel footer (always visible)
- App credits/about screen

---

## Future Enhancements

1. **Place details popup**: Show thumbnail image, description, link to more info
2. **Journey visualization**: Draw paths for travel narratives (Paul's journeys)
3. **Historical overlays**: Show ancient boundaries, roads
4. **Offline maps**: Bundle regional tile caches for common areas
5. **Place search**: Find verses mentioning a specific place
6. **Integration with PlaceTracker**: Link to observation tools

---

## Files to Create/Modify

### New Files
- `scripts/generate-bible-places.js`
- `src/data/bible-places.json` (generated)
- `src/types/places.ts`
- `src/lib/bible-places.ts`
- `src/components/ChapterMap/index.ts`
- `src/components/ChapterMap/ChapterMapView.tsx`
- `src/components/ChapterMap/MapPanel.tsx`
- `src/components/ChapterMap/PlaceList.tsx`
- `src/components/ChapterMap/PlaceListItem.tsx`

### Modified Files
- `src/components/BibleReader/NavigationBar.tsx` - Add map button
- `src/App.tsx` - Add ChapterMapView rendering
- `package.json` - Add leaflet dependencies
- `index.html` - Add Leaflet CSS link

---

## Estimated Bundle Size Impact

- Leaflet JS: ~40KB gzipped
- Leaflet CSS: ~15KB gzipped  
- Bible places data: ~500KB (estimate, depends on filtering)
- New components: ~10KB gzipped

**Total**: ~565KB additional

This is acceptable for a desktop app. For web, consider lazy-loading the map feature.
