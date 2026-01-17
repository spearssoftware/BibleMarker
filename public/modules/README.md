# Bundled SWORD Modules

Place SWORD module ZIP files in this directory to bundle them with the app.

**For Desktop/iOS Apps:** These modules are included in the app package, so they work offline and avoid CORS issues entirely.

## Public Domain Modules

These translations are public domain and can be legally bundled:

- **ASV.zip** - American Standard Version (1901) ✅ Available from CrossWire
- **KJV.zip** - King James Version (1769) ✅ Available from CrossWire
- **GodsWord.zip** - GOD'S WORD to the Nations ✅ Available from CrossWire

## How to Add Modules

### Option 1: Automatic Download (Recommended)

Run the download script:

```bash
pnpm download-modules
# or
npm run download-modules
```

This will automatically download ASV, KJV, and GodsWord from CrossWire and save them to this directory.

### Option 2: Manual Download

1. Download SWORD module ZIP files from:
   - CrossWire Repository: https://crosswire.org/sword/modules/ModDisp.jsp?modType=Bibles
   - Direct servlet URLs work: https://crosswire.org/sword/servlet/SwordMod.Verify?modName=ASV&pkgType=raw
   - Or other legal SWORD module sources

2. Place the ZIP files in this directory:
   - `public/modules/ASV.zip`
   - `public/modules/KJV.zip`
   - `public/modules/GodsWord.zip`

3. The app will automatically install them on first load (via `installBundledModules()`)

## Notes

- **Desktop/iOS apps:** Modules are bundled with the app, so they work offline and have no CORS restrictions
- Modules are automatically installed into IndexedDB on first app launch
- Licensed translations (NASB, ESV) should still be installed via "Install from ZIP" in the app
- The Vite dev server proxy handles CORS during development
