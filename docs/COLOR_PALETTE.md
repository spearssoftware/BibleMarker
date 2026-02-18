# Color Palette Documentation

## Overview

This document defines the consistent color palette used throughout the application. All colors are theme-aware and adapt to light/dark mode.

## Base Colors

### Light Theme
- **Background**: `#ffffff` - Main app background
- **Surface**: `#ffffff` - Card/panel backgrounds
- **Elevated**: `#f2f2f7` - Elevated surfaces (iOS gray)
- **Border**: `#c6c6c8` - Borders and dividers
- **Text**: `#000000` - Primary text
- **Muted**: `#8e8e93` - Secondary/muted text

### Dark Theme
- **Background**: `#000000` - Main app background (true black)
- **Surface**: `#1c1c1e` - Card/panel backgrounds
- **Elevated**: `#2c2c2e` - Elevated surfaces
- **Border**: `#646464` (RGB: 100 100 100) - Borders and dividers (lighter grey for better visibility, works well with opacity variants like /30 and /50)
- **Text**: `#ffffff` - Primary text
- **Muted**: `#98989d` - Secondary/muted text

## Accent Colors

### Light Theme
- **Accent**: `#007aff` - Primary action color (iOS blue)
- **Accent Muted**: `#0051d5` - Secondary accent

### Dark Theme
- **Accent**: `#0a84ff` - Primary action color (iOS blue)
- **Accent Muted**: `#409cff` - Secondary accent

## Semantic Colors

### Error (Red)
**Light Theme:**
- Error: `#ff3b30` - Error text/icons
- Error Background: `#ffe5e3` - Error backgrounds
- Error Text: `#d70015` - Error text on backgrounds

**Dark Theme:**
- Error: `#ff453a` - Error text/icons
- Error Background: `#3d1f1f` - Error backgrounds
- Error Text: `#ff6961` - Error text on backgrounds

### Warning (Orange)
**Light Theme:**
- Warning: `#ff9500` - Warning text/icons
- Warning Background: `#fff4e5` - Warning backgrounds
- Warning Text: `#d68910` - Warning text on backgrounds

**Dark Theme:**
- Warning: `#ff9f0a` - Warning text/icons
- Warning Background: `#3d2f1f` - Warning backgrounds
- Warning Text: `#ffb340` - Warning text on backgrounds

### Success (Green)
**Light Theme:**
- Success: `#34c759` - Success text/icons
- Success Background: `#e5f9ed` - Success backgrounds
- Success Text: `#248a3d` - Success text on backgrounds

**Dark Theme:**
- Success: `#30d158` - Success text/icons
- Success Background: `#1f3d2f` - Success backgrounds
- Success Text: `#66d98f` - Success text on backgrounds

### Info (Blue)
**Light Theme:**
- Info: `#007aff` - Info text/icons (same as accent)
- Info Background: `#e5f2ff` - Info backgrounds
- Info Text: `#0051d5` - Info text on backgrounds

**Dark Theme:**
- Info: `#0a84ff` - Info text/icons (same as accent)
- Info Background: `#1f2f3d` - Info backgrounds
- Info Text: `#64b5ff` - Info text on backgrounds

## Usage Guidelines

### When to Use Each Color

1. **Base Colors**: Use for UI structure (backgrounds, borders, text)
2. **Accent**: Use for primary actions, links, and interactive elements
3. **Error**: Use for destructive actions, error messages, validation errors
4. **Warning**: Use for warnings, cautionary messages
5. **Success**: Use for success messages, confirmations
6. **Info**: Use for informational messages, tips

### Tailwind Classes

All colors are available as Tailwind classes:

```tsx
// Base colors
bg-scripture-surface
text-scripture-text
border-scripture-border

// Semantic colors
bg-scripture-error
text-scripture-error
bg-scripture-errorBg
text-scripture-errorText

// Same pattern for warning, success, info
```

### Never Use Hardcoded Colors

❌ **Don't:**
- `text-red-600`
- `bg-green-500`
- `text-blue-400`

✅ **Do:**
- `text-scripture-error`
- `bg-scripture-success`
- `text-scripture-info`

## Highlight Colors (Annotations)

Highlight colors are user-selected and remain constant across themes:
- These are defined in `src/types/annotation.ts`
- Used for text highlighting and annotations
- Not theme-aware (intentional - preserves user's color choice)

## Migration Status

Mostly complete. Remaining hardcoded Tailwind colors (as of v0.7.8):

- `SyncStatusIndicator.tsx` — uses `text-green-*`, `text-red-*`, `text-yellow-*`, `bg-green-*`, etc. for sync state colors
- `SettingsPanel.tsx` — minor hardcoded color usage

These are low-priority since the sync indicator uses colors for quick status recognition that map closely to the semantic palette.
