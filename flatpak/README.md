# Flatpak packaging

This directory contains the Flathub manifest for BibleMarker. It's not part of the runtime app build — it's used for one-time submission to Flathub and ongoing release rebuilds there.

## Status

**Pre-submission.** The manifest is drafted but the vendored dependency files (`cargo-sources.json`, `node-sources.json`) haven't been generated yet. Submitting to Flathub requires running the generators (see below), committing the output, and opening a PR against `flathub/flathub`.

## Files

| File | Purpose |
|---|---|
| `app.biblemarker.BibleMarker.yml` | The Flatpak manifest. Names the app, picks the runtime, lists sources, runs build steps. |
| `cargo-config.toml` | Tells cargo to use vendored sources instead of crates.io. Copied into `<build>/cargo/config.toml` during the build. |
| `cargo-sources.json` | (Not yet generated.) All cargo crate URLs + sha256 hashes. Output of `flatpak-cargo-generator`. |
| `node-sources.json` | (Not yet generated.) All npm package URLs + sha256 hashes. Output of `flatpak-node-generator`. |

## One-time submission to Flathub

### 1. Verify a local build works

Install the GNOME SDK runtime:

```bash
flatpak install --user flathub org.gnome.Platform//47 org.gnome.Sdk//47 \
  org.freedesktop.Sdk.Extension.rust-stable//24.08 \
  org.freedesktop.Sdk.Extension.node20//24.08
```

Then build:

```bash
cd flatpak
flatpak-builder --user --install --force-clean --repo=repo build-dir app.biblemarker.BibleMarker.yml
flatpak run app.biblemarker.BibleMarker
```

Expect to iterate on this several times. Likely first-time issues: webkit version mismatch, resource_dir path issue, node generator pnpm quirks. Fix locally before opening the Flathub PR.

### 2. Generate vendored dependency sources

Both generators come from https://github.com/flatpak/flatpak-builder-tools — a dependency you'll clone once locally.

```bash
git clone https://github.com/flatpak/flatpak-builder-tools /tmp/flatpak-builder-tools

# Cargo: straightforward, reads Cargo.lock
python3 /tmp/flatpak-builder-tools/cargo/flatpak-cargo-generator.py \
  ../src-tauri/Cargo.lock \
  -o cargo-sources.json

# Node: pnpm support is partial; convert to npm lock first.
# This synthesizes a package-lock.json without changing the dev workflow
# (you continue using pnpm). The synthesized lock is for Flatpak only.
cd /tmp
cp -r ~/code/biblemarker /tmp/biblemarker-flatpak-build
cd /tmp/biblemarker-flatpak-build
rm -rf node_modules pnpm-lock.yaml
npm install --package-lock-only

# Now generate from the synthetic package-lock.json
python3 /tmp/flatpak-builder-tools/node/flatpak-node-generator.py npm \
  package-lock.json \
  -o ~/code/biblemarker/flatpak/node-sources.json
```

Commit `cargo-sources.json` and `node-sources.json`.

### 3. Pin the source git tag and commit SHA

In the manifest, set:

```yaml
- type: git
  url: https://github.com/spearssoftware/BibleMarker.git
  tag: app-v2.1.0
  commit: <SHA of that tag>
```

Get the SHA via `git rev-list -n 1 app-v2.1.0`.

### 4. Submit to Flathub

Fork `https://github.com/flathub/flathub`. Create a branch named `app.biblemarker.BibleMarker` (must match the app ID). Commit:

- `app.biblemarker.BibleMarker.yml`
- `cargo-sources.json`
- `node-sources.json`
- `cargo-config.toml`

Open a PR titled `Add app.biblemarker.BibleMarker`. flathubbot runs the build automatically; iterate on failures. A human reviewer (volunteer maintainer) responds in days to ~2 weeks.

Common reviewer requests:
- Drop overly broad `finish-args` (we already minimize, but they may push back on `--share=network`)
- Justify network access in the PR description (NASB download, ESV API, Gnosis, CrossWire)
- Pin runtime version (don't use `master`)
- Use `git` source with explicit tag + commit (we do)
- Fix metainfo validation warnings (`appstreamcli validate ../src-tauri/linux/app.biblemarker.BibleMarker.metainfo.xml`)

After the PR merges, Flathub creates a per-app repo at `https://github.com/flathub/app.biblemarker.BibleMarker` and grants you commit access. The manifest moves there.

## Updates after approval

For each new BibleMarker release:

```bash
# Update tag and commit in the manifest
# Regenerate cargo-sources.json and node-sources.json (above)
# Push to flathub/app.biblemarker.BibleMarker master branch
```

Flathub buildbot rebuilds and publishes to the stable channel within ~1 hour.

## NASB on Flathub

**NASB is not available in the Flathub build.** The build-time `NASB_SIGNING_KEY` secret is not present in Flathub's build environment (Flathub doesn't support build-time secrets for FOSS apps), so NASB download requests from a Flathub-installed BibleMarker get rejected with 401.

This is the intended behavior. Flathub users get ASV (bundled, public domain) and any of the public-domain SWORD modules from CrossWire. Users who want NASB use the official builds from biblemarker.app or GitHub Releases.

## Open questions to verify before submission

- Tauri 2 webkit compatibility with `org.gnome.Platform` 47's webkitgtk-6.0. May need to set the `webkit2gtk-6_0` feature in src-tauri/Cargo.toml or fall back to a different runtime.
- `tauri::path::resource_dir()` behavior inside Flatpak — does it resolve to `/app/share/BibleMarker/resources/`? Test with `flatpak run` and confirm Gnosis DB + ASV load.
- `xdg-desktop-portal` integration via Tauri's dialog plugin — works on Flathub by default, but worth a smoke test.
- pnpm vs npm in the build — synthesized package-lock.json is the workaround; verify the build actually completes against vendored sources.
