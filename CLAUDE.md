# BibleMarker — Project Rules

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4, Vite 7
- **State**: Zustand (stores in `src/stores/`)
- **Database**: SQLite via `@tauri-apps/plugin-sql` (native only — no web/PWA)
- **Desktop/Mobile**: Tauri 2 (Rust in `src-tauri/`)
- **Sync**: Journal-based file sync to iCloud Documents (macOS/iOS)
- **Build**: pnpm, Vitest, ESLint

## Folder Structure

```
src/
├── components/     # Feature-based folders (BibleReader/, Observation/, etc.)
│   └── shared/     # Reusable UI: Button, Modal, Input, Form, Overlay, etc.
├── hooks/          # Custom React hooks
├── lib/            # Core utilities — bible-api/, database.ts, sqlite-db.ts, sync.ts
├── stores/         # Zustand stores (useXxxStore naming)
└── types/          # TypeScript definitions (barrel: src/types/index.ts)
```

## Key Conventions

- **Imports**: Use `@/` path alias (maps to `src/`)
- **Components**: Named exports, feature-based folders, barrel `index.ts` per folder
- **Stores**: `useXxxStore` naming, `persist` middleware for UI state
- **Styling**: Tailwind utilities + `scripture-*` CSS variables (see below)
- **Database**: Always import from `@/lib/database` — never `sqlite-db.ts` directly

## Styling — scripture-* Variables

All colors must use `scripture-*` theme variables. Never use raw Tailwind color utilities (`bg-green-500`, `text-red-600`, etc.).

```tsx
// ✅
<div className="bg-scripture-surface text-scripture-text border-scripture-border">
<span className="text-scripture-error">Error</span>

// ❌
<div className="bg-white text-gray-900">
<span className="text-red-500">Error</span>
```

Key variables: `scripture-bg`, `scripture-surface`, `scripture-elevated`, `scripture-text`, `scripture-muted`, `scripture-accent`, `scripture-border`, `scripture-error`, `scripture-success`, `scripture-warning`, `scripture-info`

## Shared Components — Always Use Them

Never write raw `<button>`, `<input>`, `<textarea>`, or `<select>` elements with inline Tailwind classes when a shared component exists.

```tsx
import { Button, Modal, Input, Textarea, Select, Checkbox, Label } from '@/components/shared';
```

### Buttons

| Variant | Use For |
|---------|---------|
| `primary` | Main actions (Save, Create, Confirm) |
| `secondary` | Alternative actions (Cancel, Back) |
| `destructive` | Dangerous actions (Delete, Remove) |
| `ghost` | Subtle actions, toolbars |

Sizes: `sm`, `md` (default), `lg`. Props: `variant`, `size`, `fullWidth`, `disabled`, standard HTML button attrs.

**Exceptions** where raw `<button>` is acceptable:
- Icon-only toolbar buttons
- Toggle/chip buttons with selected state
- Buttons inside HTML template strings

```tsx
// Icon-only — raw button is fine
<button onClick={onClose} className="p-1 text-scripture-muted hover:text-scripture-text" aria-label="Close">✕</button>
```

### Forms

All form components support `label`, `error`, `helpText`, and standard HTML attrs. Use `FORM_GROUP_SPACING` / `FORM_FIELD_SPACING` constants for consistent layout.

If you need a custom input style, import and extend `BASE_INPUT_CLASSES` from `@/components/shared/Form`.

## Zustand Stores

```typescript
export const useXxxStore = create<XxxState>()(
  persist(
    (set, get) => ({
      items: [],
      activeId: null,

      loadItems: async () => {
        const items = await db.tableName.toArray();
        set({ items });
      },

      createItem: async (data) => {
        const item = { id: crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
        await db.tableName.put(item);
        set({ items: [...get().items, item] });
        return item;
      },
    }),
    {
      name: 'xxx-state',
      partialize: (state) => ({ activeId: state.activeId }), // persist IDs/prefs only, not full data
    }
  )
);
```

Conventions:
- Persist IDs and preferences — not full data arrays (reload from DB on mount)
- All DB operations are async
- Optimistic pattern: write to DB, then update local state

## Database Architecture

- `src/lib/sqlite-db.ts` — raw SQLite driver (never import directly)
- `src/lib/database.ts` — all CRUD, cache ops, raw SQL; **always import from here**
- `src/lib/sync-engine.ts` — journal-based file sync
- `src/lib/sync.ts` — public sync API and status management

The database lives in the app data directory (`sqlite:biblemarker.db`). It is **never** placed in the cloud sync folder. Sync is handled by writing JSON journal files to a separate sync folder.

All write operations via `database.ts` automatically log to `change_log` for sync.

### Schema Migrations

Update `SCHEMA_VERSION` and `migrateSchema()` in `sqlite-db.ts`:

```typescript
const SCHEMA_VERSION = 3; // bump for each migration

async function migrateSchema(db, fromVersion, toVersion) {
  if (fromVersion < 3) { /* add tables/columns */ }
}
```

## Bible API

All Bible API logic is in `src/lib/bible-api/`. Providers:

| Provider | Module | Key Required |
|----------|--------|-------------|
| getBible | `getbible.ts` | No |
| BibleGateway | `biblegateway.ts` | No (scraper) |
| Biblia | `biblia.ts` | Yes |
| ESV | `esv.ts` | Yes |
| SWORD | local Z-Text | No |

Key functions: `fetchChapter()`, `getAllTranslations()`, `configureApi()`, `saveApiConfig()`.

Error handling: use `BibleApiError`, check `isNetworkError()` / `isOnline()`, use `retryWithBackoff()`.

Adding a provider: create `src/lib/bible-api/newprovider.ts` implementing `BibleApiClient`, add to `clients` in `index.ts`, add to `BibleApiProvider` type.

## Running the App

```bash
pnpm run tauri:dev        # Desktop dev (sets CARGO_HOME, unsets CI)
pnpm run tauri:build      # Desktop production build
pnpm run ios:dev          # iOS simulator
pnpm run ios:build        # iOS production
```

**Never** run bare `pnpm tauri dev` — always use `pnpm run tauri:dev` (uses `scripts/tauri-dev.sh`).

For a specific target: `CARGO_HOME="$(pwd)/.cargo-home" unset CI && pnpm tauri build --target aarch64-apple-darwin`

## CI / GitHub Actions

| Workflow | Trigger | Jobs |
|----------|---------|------|
| `ci` | push/PR to main | `pnpm run lint`, `pnpm test` |
| `publish` | tag `app-v*` | Tauri builds (macOS, Linux, Windows, iOS) |
| `security` | push/PR to main | semgrep static analysis |

Local reproduction:

```bash
pnpm run lint
pnpm test
unset CI && pnpm tauri build   # always unset CI for local Tauri builds
```

macOS release builds require Apple signing certs (CI secrets only). `public/icon.svg` must exist for icon generation during release.

## Release Workflow

- **Tag format**: `app-vX.Y.Z` (semver)
- **Release notes**: entire `RELEASE_NOTES.md` becomes the GitHub release body (`--notes-file`)
- Keep the Windows install tip at the bottom of `RELEASE_NOTES.md`
- Never copy release notes from a previous version — write fresh notes for what changed

```bash
git log --oneline <last-tag>..HEAD
# update RELEASE_NOTES.md and version fields
git add RELEASE_NOTES.md package.json
git commit -m "Release vX.Y.Z: <brief description>"
git push origin main && git tag app-vX.Y.Z && git push origin app-vX.Y.Z
```

Retagging (e.g. to add a hotfix):
```bash
gh release delete app-vX.Y.Z --yes
git push origin :refs/tags/app-vX.Y.Z && git tag -d app-vX.Y.Z
# update RELEASE_NOTES.md — combine old + new notes, don't replace
git tag app-vX.Y.Z && git push origin app-vX.Y.Z
```

After tagging, monitor at:
- https://github.com/spearssoftware/BibleMarker/actions
- https://github.com/spearssoftware/BibleMarker/releases

## Before Completing Any Task

1. If you modified files that have nearby `*.test.ts` / `*.test.tsx` files, run `pnpm test`
2. After TypeScript changes, run `pnpm tsc --noEmit` to catch type errors across consumers
3. Run `pnpm run lint` and fix any errors you introduced
