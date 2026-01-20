# Icon Generation Guide

I've created a professional icon design for your Bible Study app and a script to generate all required sizes.

## What Was Created

1. **`public/icon.svg`** - High-quality SVG icon design featuring:
   - Open book with pages
   - Highlight marker (representing study/annotation)
   - Cross reference symbol
   - Your app's color scheme (#1a1a2e background, #c9a227 gold accents)

2. **`scripts/generate-icons.js`** - Automated script to generate all icon sizes

## Quick Start

### Option 1: Using the Script (Recommended)

1. **Install sharp (image processing library):**
   ```bash
   pnpm add -D sharp
   ```

2. **Generate all icons:**
   ```bash
   pnpm generate-icons
   ```

This will create:
- `public/pwa-192x192.png` - PWA icon (192x192)
- `public/pwa-512x512.png` - PWA icon (512x512)
- `public/apple-touch-icon.png` - Apple touch icon (180x180)
- `src-tauri/icons/*.png` - All Tauri icon sizes (if Tauri is set up)

### Option 2: Using Tauri CLI (If Tauri is Installed)

If you've already set up Tauri:

```bash
pnpm tauri icon public/icon.svg
```

This automatically generates all required icon formats for Tauri, including `.icns` for macOS.

### Option 3: Manual Generation (No Dependencies)

If you prefer not to install sharp, you can use online tools or ImageMagick:

#### Using ImageMagick:

```bash
# Install ImageMagick
brew install imagemagick

# Generate PWA icons
convert -background none -resize 192x192 public/icon.svg public/pwa-192x192.png
convert -background none -resize 512x512 public/icon.svg public/pwa-512x512.png

# Generate Apple touch icon
convert -background none -resize 180x180 public/icon.svg public/apple-touch-icon.png
```

#### Using Online Tools:

1. Go to https://cloudconvert.com/svg-to-png
2. Upload `public/icon.svg`
3. Set width/height to desired size
4. Download and save to `public/` with appropriate filename

## Icon Sizes Needed

### PWA Icons (for web app)
- `pwa-192x192.png` - Standard PWA icon
- `pwa-512x512.png` - Large PWA icon

### Apple Touch Icon
- `apple-touch-icon.png` - 180x180 (for iOS home screen)

### Tauri Icons (for Mac app)
- `32x32.png`
- `128x128.png`
- `128x128@2x.png` (256x256)
- `256x256.png`
- `256x256@2x.png` (512x512)
- `512x512.png`
- `512x512@2x.png` (1024x1024)
- `1024x1024.png`
- `icon.icns` - macOS app bundle icon

## Customizing the Icon

The icon design is in `public/icon.svg`. You can edit it with:
- Any text editor (it's SVG/XML)
- Inkscape (free vector editor)
- Figma, Sketch, or Adobe Illustrator

### Color Scheme
- Background: `#1a1a2e` (dark blue)
- Accent: `#c9a227` (gold)
- Book: `#2a2a4e` (lighter blue)
- Pages: `#f5f5f5` (off-white)

Feel free to adjust colors, add elements, or change the design to match your preferences!

## After Generation

1. **Update favicon** (optional): You can also use the new icon as favicon:
   ```bash
   # Copy to replace favicon.svg or create favicon.ico
   cp public/icon.svg public/favicon.svg
   ```

2. **Verify in browser**: After generating, check that icons appear:
   - In browser tab (favicon)
   - When adding to home screen (PWA icons)
   - In app manifest

3. **For Tauri**: After generating icons, they'll be automatically used when you build the Mac app.

## Troubleshooting

**Script fails with "sharp not found":**
- Run `pnpm add -D sharp` first

**Icons look blurry:**
- Ensure source SVG is high quality (512x512 or larger viewBox)
- Regenerate with higher resolution

**Tauri icons not generating:**
- Make sure Tauri is initialized (`src-tauri/` directory exists)
- Or run `pnpm tauri icon public/icon.svg` directly

**Need different design:**
- Edit `public/icon.svg` with any SVG editor
- Regenerate icons after changes
