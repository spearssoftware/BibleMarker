import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import { clearVerseAnnotations } from '@/lib/database'

// Dev console helper: wipe all annotations for a verse across every translation.
// Call from devtools: __cleanVerse('John', 15, 2)
if (import.meta.env.DEV) {
  (window as unknown as { __cleanVerse: typeof clearVerseAnnotations }).__cleanVerse = clearVerseAnnotations;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60, // 1 hour
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
