import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** Second server: the same app built for a sub-path, like GitHub Pages (spec 002, AC-11). */
const SUBPATH_PORT = 4174;
const SUBPATH_BASE = '/3d-World/';
const SUBPATH_SPEC = /subpath\.spec\.ts/;

const chrome = {
  ...devices['Desktop Chrome'],
  // Software WebGL so headless runs work without a GPU.
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
};

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: SUBPATH_SPEC,
      use: { ...chrome, baseURL: `http://localhost:${PORT}` },
    },
    {
      name: 'subpath',
      testMatch: SUBPATH_SPEC,
      // Trailing slash matters: tests navigate relative to it (e.g. goto('#/space/x')).
      use: { ...chrome, baseURL: `http://localhost:${SUBPATH_PORT}${SUBPATH_BASE}` },
    },
  ],
  webServer: [
    {
      // Test-mode build exposes window.__WORLD__ and preserves the drawing buffer for pixel checks.
      command: `npm run build:test && npx vite preview --port ${PORT} --strictPort`,
      port: PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // VITE_BASE is read by vite.config.ts for both build and preview; `env` avoids needing cross-env.
      command: `npm run build:test -- --outDir dist-subpath && npx vite preview --outDir dist-subpath --port ${SUBPATH_PORT} --strictPort`,
      url: `http://localhost:${SUBPATH_PORT}${SUBPATH_BASE}`,
      env: { VITE_BASE: SUBPATH_BASE },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
