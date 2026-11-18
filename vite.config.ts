import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site from /<repo-name>/. Override with VITE_BASE for a fork or a custom domain.
const base = process.env.VITE_BASE ?? '/vancouver-seat-viewer/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    // three.js is loaded on demand (dynamic import), so it gets its own chunk.
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
