# BibleMarker SWORD module Worker

A Cloudflare Worker that authenticates and serves Lockman-licensed NASB SWORD modules from an R2 bucket. Lives at `https://biblemarker.app/sword/<module>.zip`.

## Why this exists

The Lockman Foundation licenses NASB to Spears Software for distribution **only via biblemarker.app and the official BibleMarker app**, and the license is non-sublicensable. Bundling NASB into publicly-distributed binaries (App Store, Play Store, GitHub Releases, Flathub) puts those redistributors in a gray-area position relative to the license. This Worker is the answer: NASB lives only at `biblemarker.app`, and the Worker serves it only to the official BibleMarker app, identified by an HMAC signature using a build-time secret that's not in the public AGPL repo.

A fork built from public source has no signing key embedded, so its requests get rejected with `401 Unauthorized`. A determined adversary can extract the key from an official binary, but doing so is clear bad-faith behavior — different from accidental misuse — and the key can be rotated.

## Auth protocol

Client (BibleMarker app) makes a `GET` request:

```
GET /sword/NASB-2020.zip HTTP/1.1
Host: biblemarker.app
Authorization: BibleMarker <unix_timestamp>.<base64url_hmac>
```

Where `<base64url_hmac>` is `HMAC-SHA256("<module>:<timestamp>", SIGNING_KEY)`.

The Worker:
1. Parses timestamp + token from the header
2. Rejects if timestamp is more than 1 hour off from now (replay protection)
3. Recomputes the expected HMAC and compares (constant-time)
4. Fetches the requested module from R2
5. Logs the download for the annual Lockman report

## One-time setup

You'll need to do these steps once. After that, releases just push a new Worker version and module updates push to R2.

### 1. Install dependencies

```bash
cd worker
pnpm install
```

### 2. Create the R2 bucket

```bash
npx wrangler r2 bucket create biblemarker-modules
```

### 3. Generate and set the signing key

Pick a strong random key (32 bytes, hex-encoded):

```bash
openssl rand -hex 32
```

Save this somewhere safe (1Password / similar) — you'll add it to the BibleMarker GitHub Actions secrets too. Then upload to the Worker:

```bash
echo -n "<your-key>" | npx wrangler secret put SIGNING_KEY --env production
```

### 4. Upload NASB modules to R2

The NASB SWORD zips are kept in `spearssoftware/biblemarker-assets` (private repo). Download and upload to R2:

```bash
gh release download v1.0.0 \
  --repo spearssoftware/biblemarker-assets \
  --dir /tmp/sword \
  --pattern "sword-NASB*.zip"

# R2 keys must match what the BibleMarker app requests
npx wrangler r2 object put biblemarker-modules/NASB-2020.zip --file /tmp/sword/sword-NASB.zip --remote
npx wrangler r2 object put biblemarker-modules/NASB-1995.zip --file /tmp/sword/sword-NASB1995.zip --remote
```

### 5. Deploy the Worker

```bash
pnpm deploy
```

This deploys to the `production` environment, which binds the Worker to `biblemarker.app/sword/*` (configured in `wrangler.toml`).

### 6. Add the signing key to GitHub Actions

The BibleMarker build needs the same `SIGNING_KEY` to compute HMAC tokens at runtime. Add it as a repo secret:

```bash
gh secret set NASB_SIGNING_KEY --repo spearssoftware/BibleMarker --body "<your-key>"
```

The PR that wires this into Tauri builds will reference the secret as `NASB_SIGNING_KEY`.

## Deploying updates

After the initial setup, day-to-day updates are simple:

- **Worker code change**: `pnpm deploy`
- **New NASB module version**: re-upload via `wrangler r2 object put`
- **Rotate the signing key**: regenerate, set as new secret in both Worker and GitHub Actions, deploy. Old client builds will start failing — only do this if you suspect compromise.

## Local development

```bash
pnpm dev
```

Wrangler runs the Worker on localhost. You can test with `curl`:

```bash
TS=$(date +%s)
KEY="your-test-signing-key"
TOKEN=$(printf "NASB-2020.zip:%s" "$TS" | openssl dgst -sha256 -hmac "$KEY" -binary | base64 | tr -d '=' | tr '/+' '_-')
curl -H "Authorization: BibleMarker ${TS}.${TOKEN}" \
     http://localhost:8787/sword/NASB-2020.zip
```

For local R2, wrangler creates a fake bucket at `.wrangler/state/`. Drop a test zip there with the same name.

## Costs

Cloudflare R2 has zero egress fees, so even at heavy download volume costs stay near zero. See the plan at `~/.claude/plans/yeah-let-s-swtich-to-robust-meerkat.md` Phase 4 for breakdown.

## Annual Lockman reporting

The Worker logs every successful download as a structured JSON line:

```json
{"event":"sword_download","module":"NASB-2020.zip","timestamp":"2026-04-29T12:00:00Z","country":"US"}
```

Cloudflare's Logpush or the dashboard's log query can be used to extract per-year totals for the report due to Lockman by end of February each year.
