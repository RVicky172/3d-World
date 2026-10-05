// @ts-check
// Runs after `vite build` (see the `build` script). Fails the build if bundle rules are broken.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checkBundle, checkSpaceBudgets } from './bundle-checks.mjs';

const DIST = 'dist';
const ENTRY_BUDGET_BYTES = 250 * 1024; // Constitution IV
const SPACE_BUDGET_BYTES = 5 * 1024 * 1024; // Constitution IV: each Space's code + assets + emitted decoders

const manifest = JSON.parse(readFileSync(join(DIST, '.vite', 'manifest.json'), 'utf8'));
const spaceSources = readdirSync('src/spaces', { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory() && existsSync(join('src/spaces', dirent.name, 'index.ts')))
  .map((dirent) => `src/spaces/${dirent.name}/index.ts`);

/**
 * Total size of every file under `dir` (recursively); 0 if it doesn't exist.
 * @param {string} dir
 * @returns {number}
 */
function folderBytes(dir) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true }).reduce((sum, dirent) => {
    const path = join(dir, dirent.name);
    return sum + (dirent.isDirectory() ? folderBytes(path) : statSync(path).size);
  }, 0);
}

const { errors, entryGzipBytes } = checkBundle({
  manifest,
  spaceSources,
  readFile: (file) => readFileSync(join(DIST, file)),
  entryBudgetBytes: ENTRY_BUDGET_BYTES,
  forbiddenInEntry: ['__WORLD__'],
});

const budgets = checkSpaceBudgets({
  manifest,
  spaceSources,
  readFile: (file) => readFileSync(join(DIST, file)),
  assetBytes: (id) => folderBytes(join('public', 'assets', id)),
  budgetBytes: SPACE_BUDGET_BYTES,
});
errors.push(...budgets.errors);

console.log(
  `Bundle check: entry ${(entryGzipBytes / 1024).toFixed(1)} KB gzipped (budget ${ENTRY_BUDGET_BYTES / 1024} KB), ` +
    `${spaceSources.length} lazy Space chunk(s).`,
);
for (const { id, codeGzipBytes, assetBytes, emittedBytes, totalBytes } of budgets.sizes) {
  console.log(
    `  Space ${id}: code ${(codeGzipBytes / 1024).toFixed(1)} KB gzipped + assets ${(assetBytes / 1024 / 1024).toFixed(2)} MB` +
      ` + decoders ${(emittedBytes / 1024).toFixed(1)} KB = ${(totalBytes / 1024 / 1024).toFixed(2)} MB (budget ${SPACE_BUDGET_BYTES / 1024 / 1024} MB)`,
  );
}
if (errors.length > 0) {
  errors.forEach((error) => console.error(`  ✗ ${error}`));
  process.exit(1);
}
