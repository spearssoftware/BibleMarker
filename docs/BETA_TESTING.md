# Beta Testing Guide - iPad & Mac

This guide covers multiple ways to beta test your Bible Study app on iPad and Mac.

## Option 1: Local Network Development (Quickest for Testing)

Best for: Quick iteration and testing on your local network

### On Your Mac:

1. **Start the development server:**
   ```bash
   pnpm dev
   ```
   
   The server will start on `http://localhost:5173` (or next available port)

2. **Find your Mac's local IP address:**
   ```bash
   ipconfig getifaddr en0
   # or
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```
   
   You'll get something like `192.168.1.100`

3. **Configure Vite to allow network access:**
   
   Update `vite.config.ts` to add `host: true`:
   ```typescript
   server: {
     host: true, // Add this line
     port: 5173,
     // ... rest of config
   }
   ```

4. **Access from iPad:**
   - Make sure iPad is on the same Wi-Fi network as your Mac
   - Open Safari on iPad
   - Navigate to: `http://YOUR_MAC_IP:5173` (e.g., `http://192.168.1.100:5173`)

### Installing as PWA on iPad:

1. Open the app in Safari on iPad
2. Tap the Share button (square with arrow)
3. Select "Add to Home Screen"
4. The app will install as a standalone PWA

### Installing as PWA on Mac:

1. Open the app in Safari on Mac
2. Click Safari menu → "Add to Dock" (or use Share button → "Add to Home Screen")
3. The app will appear in your Dock/Applications

**Note:** The dev server needs to be running for this to work. If you close it, the app won't load.

---

## Option 2: Build and Preview (Better Performance)

Best for: Testing production build locally

### Steps:

1. **Build the app:**
   ```bash
   pnpm build
   ```
   
   This creates a `dist/` folder with optimized production files.

2. **Preview the build:**
   ```bash
   pnpm preview --host
   ```
   
   The `--host` flag allows network access (same as Option 1).

3. **Access from iPad/Mac:**
   - Same as Option 1, but use the preview server URL
   - Install as PWA using the same steps

**Advantages:**
- Tests the actual production build
- Better performance (optimized code)
- Tests PWA features (service worker, caching)

---

## Option 3: Deploy to Hosting Service (Best for Beta Testing)

Best for: Sharing with beta testers, testing across different networks

### Option 3a: Vercel (Recommended - Free & Easy)

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Deploy:**
   ```bash
   vercel
   ```
   
   Follow the prompts. Vercel will:
   - Detect Vite automatically
   - Build and deploy your app
   - Give you a URL like `biblestudy.vercel.app`

3. **Access from anywhere:**
   - Share the URL with beta testers
   - Works on any device with internet
   - HTTPS enabled automatically (required for PWA)

4. **Install as PWA:**
   - Open the URL on iPad/Mac
   - Install using Safari's "Add to Home Screen" feature

### Option 3b: Netlify (Alternative)

1. **Install Netlify CLI:**
   ```bash
   npm i -g netlify-cli
   ```

2. **Deploy:**
   ```bash
   pnpm build
   netlify deploy --prod --dir=dist
   ```
   
   Or use Netlify's drag-and-drop interface at netlify.com

### Option 3c: GitHub Pages

1. **Install gh-pages:**
   ```bash
   pnpm add -D gh-pages
   ```

2. **Add deploy script to `package.json`:**
   ```json
   "scripts": {
     "deploy": "pnpm build && gh-pages -d dist"
   }
   ```

3. **Deploy:**
   ```bash
   pnpm deploy
   ```

4. **Enable GitHub Pages:**
   - Go to your repo → Settings → Pages
   - Select `gh-pages` branch
   - Your app will be at `https://YOUR_USERNAME.github.io/biblestudy`

---

## Option 4: Local HTTPS Server (For PWA Testing)

PWAs require HTTPS (except localhost). For testing on your local network with HTTPS:

### Using mkcert (Recommended):

1. **Install mkcert:**
   ```bash
   brew install mkcert
   mkcert -install
   ```

2. **Create certificates:**
   ```bash
   mkcert localhost 192.168.1.100  # Use your Mac's IP
   ```

3. **Update `vite.config.ts`:**
   ```typescript
   server: {
     https: {
       key: './localhost+2-key.pem',
       cert: './localhost+2.pem',
     },
     host: true,
     port: 5173,
   }
   ```

4. **Access via HTTPS:**
   - `https://192.168.1.100:5173` on iPad
   - Install as PWA (now works properly with HTTPS)

---

## Testing Checklist

### iPad Testing:
- [ ] App loads correctly in Safari
- [ ] PWA installs successfully ("Add to Home Screen")
- [ ] App works offline (service worker caching)
- [ ] Touch interactions work (tapping, scrolling)
- [ ] Responsive layout looks good
- [ ] Keyboard shortcuts work (if using external keyboard)
- [ ] IndexedDB data persists after closing app
- [ ] Multi-touch gestures work (pinch to zoom, etc.)

### Mac Testing:
- [ ] App loads correctly in Safari
- [ ] PWA installs to Dock/Applications
- [ ] App works offline
- [ ] Keyboard shortcuts work
- [ ] Mouse interactions work
- [ ] Window resizing works correctly
- [ ] IndexedDB data persists
- [ ] File System Access API works (for backup/restore)

### Cross-Device Testing:
- [ ] Backup/restore works on both devices
- [ ] Data syncs if using cloud folder (iCloud Drive)
- [ ] Same features work on both platforms
- [ ] Performance is acceptable on both

---

## Troubleshooting

### iPad can't connect to Mac's dev server:
- ✅ Ensure both devices are on same Wi-Fi network
- ✅ Check Mac's firewall settings (allow incoming connections)
- ✅ Verify `host: true` is set in `vite.config.ts`
- ✅ Try accessing from Mac's browser first to verify it works

### PWA won't install:
- ✅ Ensure you're using HTTPS (or localhost)
- ✅ Check that `manifest.json` is properly configured
- ✅ Verify service worker is registered
- ✅ Try clearing Safari cache and retrying

### Service worker not working:
- ✅ Check browser console for errors
- ✅ Verify `vite-plugin-pwa` is configured correctly
- ✅ Ensure app is served over HTTPS (or localhost)
- ✅ Check `dist/` folder contains `sw.js` after build

### IndexedDB not persisting:
- ✅ Check browser storage settings (Safari → Preferences → Privacy)
- ✅ Verify Dexie database is opening correctly
- ✅ Check browser console for IndexedDB errors
- ✅ Ensure you're not using private/incognito mode

---

## Recommended Workflow

For beta testing, I recommend:

1. **Development Phase:** Use Option 1 (local network dev server)
   - Fast iteration
   - Hot module reloading
   - Easy debugging

2. **Beta Testing Phase:** Use Option 3a (Vercel deployment)
   - Shareable URL
   - HTTPS enabled
   - Works anywhere
   - Easy to update (just run `vercel` again)

3. **Production:** Use Option 3a or your preferred hosting service
   - Set up custom domain
   - Configure analytics
   - Set up monitoring

---

## Quick Start Commands

```bash
# Development (local network)
pnpm dev

# Build for production
pnpm build

# Preview production build (local network)
pnpm preview --host

# Deploy to Vercel
vercel

# Deploy to Netlify
pnpm build && netlify deploy --prod --dir=dist
```

---

## Next Steps

After beta testing, consider:
- Setting up a custom domain
- Adding analytics (privacy-respecting)
- Setting up error tracking (Sentry, etc.)
- Creating a TestFlight build (if building native iOS app)
- Setting up automated deployments (GitHub Actions, etc.)
