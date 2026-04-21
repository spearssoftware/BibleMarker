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
import { getAllXxx, saveXxx, deleteXxx } from '@/lib/database';

export const useXxxStore = create<XxxState>()(
  persist(
    (set, get) => ({
      items: [],
      activeId: null,

      loadItems: async () => {
        const items = await getAllXxx();
        set({ items });
      },

      createItem: async (data) => {
        const item = { id: crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
        await saveXxx(item);
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
- **No data store persists full arrays.** Observation/worksheet stores use `partialize: (_state) => ({})` and reload from DB on mount. UI/preference stores may persist IDs and preferences.
- Every consumer of such a store must call the store's `load*` function on mount. A component showing empty content is usually a missing `load*` call.
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
const SCHEMA_VERSION = 5; // bump for each migration

async function migrateSchema(db, fromVersion, toVersion) {
  if (fromVersion < 3) { /* add tables/columns */ }
}
```

When adding a new table, you MUST also:
- Add it to `VALID_TABLE_NAMES` in `sqlite-db.ts` — generic CRUD throws "Invalid table name" otherwise.
- Add it to `SYNCED_TABLES` if it should sync between devices.
- Add it to `ensureTablesExist()` in `sqlite-db.ts` — safety net for tables missed during migration (e.g., schema version bumped but table creation skipped under hot-reload).

## Bible API

All Bible API logic is in `src/lib/bible-api/`. Two providers:

| Provider | Module | Key Required | Notes |
|----------|--------|-------------|-------|
| SWORD | `sword.ts` + `sword-ztext.ts` | No | Local zText modules, offline. NASB bundled with app. |
| ESV | `esv.ts` | Yes | Network API, requires API key from esv.org |

SWORD modules are downloaded on demand and stored in `{appDataDir}/sword/`. NASB 2020 and NASB 1995 are bundled as app resources (`src-tauri/resources/`). Module registry is hardcoded in `sword.ts`.

Key functions: `fetchChapter()`, `getAllTranslations()`, `downloadModule()`, `isModuleDownloaded()`.

Error handling: use `BibleApiError`, check `isNetworkError()` / `isOnline()`, use `retryWithBackoff()`.

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
- **Release notes**: auto-generated from commits since the last tag (`--generate-notes`)

### User-Facing Release Notes

After the CI draft release is created, edit it on GitHub to prepend a `## What's New` section **before** the auto-generated commit list. This section is fetched by the app and shown to users as an in-app popup on first launch after an update.

Rules for `## What's New`:
- Write for non-technical Bible study users — no jargon, no internal terms
- Use plain bullet points describing what the user can now do or what got fixed for them
- **Omit the section entirely** for patch releases that are purely internal fixes (no visible user impact)
- Keep it short — 2–5 bullets max

Example:
```markdown
## What's New
- Choose from 4 scripture fonts in Appearance settings
- Studies are now easier to find — go to Settings → Studies to create one
- Fixed an issue where deleted keywords still appeared in the Places list
```

```bash
pnpm run release -- patch                                   # 1.6.3 → 1.6.4 (stable)
pnpm run release -- minor                                   # → next minor (stable)
pnpm run release -- major                                   # → next major (stable)
pnpm run release -- beta                                    # → 1.7.0-beta.N (prerelease)
pnpm run release -- patch --notes "- Bullet one\n- Bullet two"   # prepend What's New automatically
```

Prefer `--notes` over editing the draft on GitHub after the fact — the script waits for CI and prepends the `## What's New` section for you. Pitfalls:
- `--notes` requires a string argument immediately after it. An empty value silently fails under `set -euo pipefail`.
- The script aborts on uncommitted changes — commit `Cargo.lock` and `project.yml` from dev builds first.
- Tags with `-` (e.g. `1.7.0-beta.1`) publish as GitHub prereleases with a `beta.json` manifest; tags without `-` publish as `latest` with `latest.json`.

The script creates a `release/vX.Y.Z` branch with the version bump, pushes it, and opens a PR. When the PR is merged, the `release-tag` workflow automatically creates the `app-vX.Y.Z` tag, which triggers the publish workflow and creates a draft GitHub Release.

Retagging (e.g. to add a hotfix):
```bash
gh release delete app-vX.Y.Z --yes
git push origin :refs/tags/app-vX.Y.Z
```
Then re-merge or manually create the tag on the desired commit.

After merging a release PR, monitor at:
- https://github.com/spearssoftware/BibleMarker/actions
- https://github.com/spearssoftware/BibleMarker/releases

