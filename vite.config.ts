import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
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
