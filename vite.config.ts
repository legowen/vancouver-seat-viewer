import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages serves the site from /<repo-name>/, so every asset URL needs this prefix.
  base: '/vancouver-seat-viewer/',
  build: {
    target: 'es2022',
    // three.js is one large vendor chunk. It is only loaded with the 3D screens.
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
