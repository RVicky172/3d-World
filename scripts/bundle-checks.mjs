// @ts-check
import { gzipSync } from 'node:zlib';

/**
 * @typedef {{ file: string; isEntry?: boolean; isDynamicEntry?: boolean; imports?: string[]; dynamicImports?: string[] }} ManifestChunk
 * @typedef {Record<string, ManifestChunk>} Manifest
 * @typedef {{
 *   manifest: Manifest;
 *   spaceSources: string[];
 *   readFile: (file: string) => string | Uint8Array;
 *   entryBudgetBytes: number;
 *   forbiddenInEntry: string[];
 * }} CheckInput
 */

/**
 * Files loaded up front: the entry chunk plus everything it imports statically.
 * @param {Manifest} manifest
 * @returns {string[]}
 */
export function entryFiles(manifest) {
  const seen = new Set();
  /** @type {string[]} */
  const files = [];
  /** @param {string} key */
  const visit = (key) => {
    const chunk = manifest[key];
    if (!chunk || seen.has(key)) return;
    seen.add(key);
    files.push(chunk.file);
    (chunk.imports ?? []).forEach(visit);
  };
  Object.keys(manifest)
    .filter((key) => manifest[key]?.isEntry)
    .forEach(visit);
  return files;
}

/**
 * Verifies Constitution III/IV and spec 001 AC-2 against a Vite build manifest.
 * @param {CheckInput} input
 * @returns {{ errors: string[]; entryGzipBytes: number }}
 */
export function checkBundle({ manifest, spaceSources, readFile, entryBudgetBytes, forbiddenInEntry }) {
  /** @type {string[]} */
  const errors = [];
  const entry = entryFiles(manifest);
  if (entry.length === 0) return { errors: ['No entry chunk found in the manifest.'], entryGzipBytes: 0 };

  for (const source of spaceSources) {
    const chunk = manifest[source];
    if (!chunk) {
      errors.push(`Space ${source} is not in the build. Is it registered in src/spaces/registry.ts?`);
    } else if (!chunk.isDynamicEntry || entry.includes(chunk.file)) {
      errors.push(
        `Space ${source} is not a lazy chunk; it must only be loaded via import() (Constitution III).`,
      );
    }
  }

  let entryGzipBytes = 0;
  for (const file of entry) {
    const content = readFile(file);
    entryGzipBytes += gzipSync(content).length;
    const text = typeof content === 'string' ? content : Buffer.from(content).toString('utf8');
    for (const marker of forbiddenInEntry) {
      if (text.includes(marker))
        errors.push(`${file} contains "${marker}", which must not ship in production.`);
    }
  }
  if (entryGzipBytes > entryBudgetBytes) {
    errors.push(
      `Entry JS is ${(entryGzipBytes / 1024).toFixed(1)} KB gzipped, over the ${(entryBudgetBytes / 1024).toFixed(0)} KB budget (Constitution IV).`,
    );
  }
  return { errors, entryGzipBytes };
}

/**
 * `src/spaces/<id>/index.ts` → `<id>`.
 * @param {string} source
 */
export function spaceIdOf(source) {
  return source.split('/').at(-2) ?? source;
}

/**
 * Files only a Space needs: its own chunk plus everything it imports statically that the entry
 * doesn't already load (e.g. the shared model viewer), so shared entry code isn't charged to it.
 * @param {Manifest} manifest
 * @param {string} source
 * @param {Set<string>} entry
 */
function spaceFiles(manifest, source, entry) {
  const seen = new Set();
  /** @type {string[]} */
  const files = [];
  /** @param {string} key */
  const visit = (key) => {
    const chunk = manifest[key];
    if (!chunk || seen.has(key) || entry.has(chunk.file)) return;
    seen.add(key);
    files.push(chunk.file);
    (chunk.imports ?? []).forEach(visit);
  };
  visit(source);
  return files;
}

/**
 * Constitution IV / spec 010 AC-12: each Space's own code (gzipped) plus its `public/assets/<id>/`
 * folder must fit `budgetBytes` (5 MB unless a spec justifies more). Asset bytes are counted as stored:
 * GLB and image files are already compressed formats.
 * @param {{
 *   manifest: Manifest;
 *   spaceSources: string[];
 *   readFile: (file: string) => string | Uint8Array;
 *   assetBytes: (spaceId: string) => number;
 *   budgetBytes: number;
 * }} input
 * @returns {{ errors: string[]; sizes: { id: string; codeGzipBytes: number; assetBytes: number; totalBytes: number }[] }}
 */
export function checkSpaceBudgets({ manifest, spaceSources, readFile, assetBytes, budgetBytes }) {
  const entry = new Set(entryFiles(manifest));
  const mb = (/** @type {number} */ bytes) => (bytes / 1024 / 1024).toFixed(1);
  /** @type {string[]} */
  const errors = [];
  const sizes = [];
  for (const source of spaceSources) {
    if (!manifest[source]) continue; // reported by checkBundle
    const id = spaceIdOf(source);
    const codeGzipBytes = spaceFiles(manifest, source, entry).reduce(
      (sum, file) => sum + gzipSync(readFile(file)).length,
      0,
    );
    const assets = assetBytes(id);
    const totalBytes = codeGzipBytes + assets;
    sizes.push({ id, codeGzipBytes, assetBytes: assets, totalBytes });
    if (totalBytes > budgetBytes) {
      errors.push(
        `Space ${id} is ${mb(totalBytes)} MB (code + assets), over the ${mb(budgetBytes).replace(/\.0$/, '')} MB budget (Constitution IV).`,
      );
    }
  }
  return { errors, sizes };
}
