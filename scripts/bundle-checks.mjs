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
