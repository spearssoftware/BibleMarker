# BibleMarker

A cross-platform Bible study application for deep text study using the Inductive Bible Study Method. Mark, annotate, and analyze Scripture with powerful study tools.

**Website:** [biblemarker.app](https://biblemarker.app)

![BibleMarker Screenshot](./public/biblemaker-screenshot-202601.png)

## Features

### 📖 Bible Reading
- **Multiple Translations**: Access various Bible translations through multiple API providers
  - getBible (free, no API key required)
  - Biblia API (NASB, ESV, NIV, NKJV, and more)
  - ESV API (Crossway)
- **Offline Support**: Previously fetched chapters are cached locally for offline reading
- **Multi-Translation View**: Compare up to 3 translations side-by-side with synchronized scrolling

### ✏️ Text Marking & Annotation
- **Flexible Highlighting**: Mark text with colors, underline styles, and custom symbols
- **Keyword System**: Create reusable keyword presets with automatic matching
- **Smart Suggestions**: Previously used markings suggested for repeated words
- **Notes**: Add markdown-supported notes to any verse
- **Section Headings & Chapter Titles**: Create custom structure and organization

### 🔍 Inductive Bible Study Tools
- **Observation Tools**:
  - Track places, people, and times
  - Identify contrasts and conclusions
  - Mark themes throughout passages
  - 5 W's and H (Who, What, When, Where, Why, How)
- **Interpretation Worksheet**: Explore what the text means
- **Application Worksheet**: Record personal applications
- **Lists**: Create custom lists to track any concept

### 📚 Study Management
- **Study System**: Organize keywords and markings by study
- **Book-Scoped Keywords**: Limit keywords to specific books for focused study
- **Clear Book Highlights**: Start fresh on any book while preserving your data structure

### 💾 Data Management
- **Automatic Backups**: Configurable auto-backup system with retention policies
- **Import/Export**: Full backup and restore capabilities
- **Study Export**: Export formatted study notes with all observations and applications
- **Local Storage**: All data stored locally in IndexedDB - no cloud required

### ⚡ User Experience
- **Keyboard Shortcuts**: Navigate efficiently with arrow keys, J/K navigation, and toolbar shortcuts
- **Dark/Light Themes**: Choose dark, light, or auto (follows OS preference)
- **Responsive Design**: Works on desktop and mobile devices
- **PWA Support**: Install as a progressive web app

## Download & Installation

Pre-built desktop apps (macOS, Windows, Linux) are on [GitHub Releases](https://github.com/spearssoftware/BibleMarker/releases). BibleMarker is built with [Tauri](https://tauri.app) for native desktop.

**macOS:** If you see "BibleMarker is damaged and can't be opened", the app is not damaged—Gatekeeper blocks unsigned downloads. Right-click the app → **Open** → then click **Open** in the dialog. Or in Terminal: `xattr -cr /Applications/BibleMarker.app` (adjust path if needed).

**Windows:** SmartScreen may warn for unsigned downloads. Click **More info** → **Run anyway**. For signed builds (no warning), see [Windows code signing](./docs/WINDOWS_CODE_SIGNING.md).

**Web app:** Run in the browser without installing: `pnpm install` then `pnpm dev`, and open the URL shown in the terminal.

## Building from source

1. Clone the repository:
```bash
git clone https://github.com/spearssoftware/BibleMarker.git
cd biblemarker
```

2. Install dependencies:
```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
```

3. Run desktop app in development:
```bash
pnpm tauri:dev
```

4. Build desktop app for production:
```bash
pnpm tauri:build
```

See [docs/MAC_APP_GUIDE.md](./docs/MAC_APP_GUIDE.md) for detailed macOS-specific instructions.

To build and run the web app only: `pnpm install`, `pnpm dev` (development) or `pnpm build` (production).

## Configuration

### Bible API Keys (Optional)

While the app works without API keys using the free getBible service, you can configure additional providers for more translation options:

1. **Biblia API** (for NASB, ESV, NIV, NKJV):
   - Sign up at [biblia.com/api](https://biblia.com/api)
   - Free tier: 5,000 calls/day
   - Add key in Settings → Bible → API Configuration

2. **ESV API** (for ESV translation):
   - Register at [api.esv.org](https://api.esv.org)
   - Free tier available
   - Add key in Settings → Bible → API Configuration

### Self-Hosting Bible Data

For complete offline functionality, you can self-host Bible data using GetBible. See [docs/GETBIBLE_SELF_HOSTING.md](./docs/GETBIBLE_SELF_HOSTING.md) for detailed instructions.

## Keyboard Shortcuts

### Navigation
- `↑` / `↓` - Navigate between verses
- `J` / `K` - Navigate between verses (Vim-style)
- `←` / `→` - Previous/Next chapter
- `⌘/Ctrl + F` - Search

### Marking
- `1` - Quick color 1
- `2` - Quick color 2
- `3` - Quick color 3

View all shortcuts in **Settings → Help → Keyboard Shortcuts**

## Development

### Project Structure

```
biblemarker/
├── src/
│   ├── components/      # React components
│   ├── stores/          # Zustand state management
│   ├── lib/             # Core libraries
│   │   ├── bible-api/   # Bible API integrations
│   │   ├── db.ts        # IndexedDB/Dexie database
│   │   ├── backup.ts    # Backup/restore functionality
│   │   └── ...
│   └── types/           # TypeScript type definitions
├── src-tauri/           # Tauri native app code
├── docs/                # Documentation
└── public/              # Static assets
```

### Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **State Management**: Zustand
- **Database**: Dexie (IndexedDB wrapper)
- **Desktop**: Tauri 2
- **Build Tool**: Vite
- **Bible APIs**: getBible, Biblia, ESV

### Debug Logging

The app includes toggleable debug logging for development:

1. Go to **Settings → Help → Debug Logging**
2. Enable "Keyword Matching" or "Verse Text Rendering"
3. Open browser/dev console to see detailed logs

This is useful for troubleshooting keyword matching issues or rendering problems.

### Scripts

```bash
# Development
pnpm dev              # Run web dev server
pnpm tauri:dev        # Run Tauri desktop dev

# Building
pnpm build            # Build web app
pnpm tauri:build      # Build desktop app

# Utilities
pnpm generate-icons   # Generate app icons
pnpm version:sync     # Sync version across configs
pnpm lint             # Run ESLint
```

## License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](./LICENSE).

**In Summary:**
- ✅ Free for personal use, study, research, and non-profit organizations
- ✅ Modify and share for non-commercial purposes
- ❌ Commercial use requires separate licensing

See [LICENSE](./LICENSE) file for full terms.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Roadmap

See [docs/CROSS_PLATFORM_STRATEGY.md](./docs/CROSS_PLATFORM_STRATEGY.md) for the current development roadmap.

## Support

For questions or issues:
- **Website:** [biblemarker.app](https://biblemarker.app)
- Open an issue on [GitHub](https://github.com/spearssoftware/BibleMarker)
- Check the built-in help: **Settings → Help → Getting Started**

## Acknowledgments

- Bible text provided by getBible, Biblia API, and ESV API
- Built with [Tauri](https://tauri.app), [React](https://react.dev), and [Dexie](https://dexie.org)
- Icons generated using Sharp (see [docs/ICON_GENERATION.md](./docs/ICON_GENERATION.md))

---

**Made for deeper Bible study** 📖✨
