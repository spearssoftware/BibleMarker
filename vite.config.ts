import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'BibleMarker',
        short_name: 'BibleMarker',
        description: 'A focused Bible study app with rich annotation tools',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.esv\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'esv-api-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  server: {
    host: true, // Allow access from local network (for iPad testing)
    port: 5173, // Change this to your preferred port
    strictPort: false, // If true, will fail if port is in use; if false, will try next available port
    proxy: {
      // Proxy BibleGateway API requests to avoid CORS (https://api.biblegateway.com/2/)
      '/api/biblegateway': {
        target: 'https://api.biblegateway.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/biblegateway/, ''),
      },
      // Proxy Biblia API requests to avoid CORS issues
      // Requests to /api/biblia/* will be forwarded to https://api.biblia.com/v1/bible/*
      '/api/biblia': {
        target: 'https://api.biblia.com',
        changeOrigin: true,
        rewrite: (path) => {
          // path includes /api/biblia, e.g., "/api/biblia/content/NASB.txt"
          // Rewrite to /v1/bible + everything after /api/biblia
          return path.replace(/^\/api\/biblia/, '/v1/bible');
        },
        configure: (proxy) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('[Vite Proxy] Proxy error:', err);
          });
        },
      },
    },
  },
})
