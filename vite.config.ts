/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Set VITE_BASE=/repo-name/ when deploying to a GitHub Pages project site.
  base: process.env.VITE_BASE ?? '/',
  build: {
    target: 'es2022',
    sourcemap: true,
    // dist/.vite/manifest.json — read by scripts/check-bundle.mjs to verify lazy Space chunks.
    manifest: true,
    // Three.js core alone is ~530 KB raw (~130 KB gzip). The real budget is gzip — see constitution IV.
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts'],
    },
  },
});
