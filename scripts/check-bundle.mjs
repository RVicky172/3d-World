// @ts-check
// Runs after `vite build` (see the `build` script). Fails the build if bundle rules are broken.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkBundle } from './bundle-checks.mjs';

const DIST = 'dist';
const ENTRY_BUDGET_BYTES = 250 * 1024; // Constitution IV

const manifest = JSON.parse(readFileSync(join(DIST, '.vite', 'manifest.json'), 'utf8'));
const spaceSources = readdirSync('src/spaces', { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory() && existsSync(join('src/spaces', dirent.name, 'index.ts')))
  .map((dirent) => `src/spaces/${dirent.name}/index.ts`);

const { errors, entryGzipBytes } = checkBundle({
  manifest,
  spaceSources,
  readFile: (file) => readFileSync(join(DIST, file)),
  entryBudgetBytes: ENTRY_BUDGET_BYTES,
  forbiddenInEntry: ['__WORLD__'],
});

console.log(
  `Bundle check: entry ${(entryGzipBytes / 1024).toFixed(1)} KB gzipped (budget ${ENTRY_BUDGET_BYTES / 1024} KB), ` +
    `${spaceSources.length} lazy Space chunk(s).`,
);
if (errors.length > 0) {
  errors.forEach((error) => console.error(`  ✗ ${error}`));
  process.exit(1);
}
