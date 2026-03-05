import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0'),
  },
  test: {
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: [
        'src/lib/**/*.test.ts',
        'src/lib/__test__/**',
        'src/lib/database.ts',
        'src/lib/sqlite-db.ts',
        'src/lib/sync-engine.ts',
      ],
    },
  },
})
