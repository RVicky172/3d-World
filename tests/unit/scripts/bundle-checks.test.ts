import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { checkBundle, checkSpaceBudgets, entryFiles, spaceIdOf } from '../../../scripts/bundle-checks.mjs';

/** Shaped like a real `dist/.vite/manifest.json`. */
const manifest = {
  'index.html': {
    file: 'assets/index.js',
    isEntry: true,
    imports: ['_shared.js'],
    dynamicImports: ['src/spaces/demo-cube/index.ts'],
  },
  '_shared.js': { file: 'assets/shared.js' },
  'src/spaces/demo-cube/index.ts': {
    file: 'assets/demo-cube.js',
    isDynamicEntry: true,
    imports: ['index.html'],
  },
};

const files: Record<string, string> = {
  'assets/index.js': 'console.log("app")',
  'assets/shared.js': 'export const x = 1',
  'assets/demo-cube.js': 'export default () => {}',
};
const readFile = (file: string) => {
  const content = files[file];
  if (content === undefined) throw new Error(`missing ${file}`);
  return content;
};

const baseInput = {
  manifest,
  spaceSources: ['src/spaces/demo-cube/index.ts'],
  readFile,
  entryBudgetBytes: 250 * 1024,
  forbiddenInEntry: ['__WORLD__'],
};

describe('entryFiles', () => {
  it('returns the entry chunk and its static imports, not dynamic ones', () => {
    expect(entryFiles(manifest).sort()).toEqual(['assets/index.js', 'assets/shared.js']);
  });
});

describe('checkBundle', () => {
  it('passes a healthy build and reports the gzipped entry size', () => {
    const result = checkBundle(baseInput);
    expect(result.errors).toEqual([]);
    expect(result.entryGzipBytes).toBeGreaterThan(0);
  });

  it('fails when a Space is missing from the build (AC-2)', () => {
    const result = checkBundle({ ...baseInput, spaceSources: ['src/spaces/solar-system/index.ts'] });
    expect(result.errors.join()).toMatch(/solar-system.*not in the build/);
  });

  it('fails when a Space is bundled statically instead of lazily (AC-2)', () => {
    const eager = {
      ...manifest,
      'index.html': { ...manifest['index.html'], imports: ['_shared.js', 'src/spaces/demo-cube/index.ts'] },
      'src/spaces/demo-cube/index.ts': { file: 'assets/demo-cube.js' },
    };
    const result = checkBundle({ ...baseInput, manifest: eager });
    expect(result.errors.join()).toMatch(/demo-cube.*not a lazy chunk/);
  });

  it('fails when the entry exceeds the gzip budget (Constitution IV)', () => {
    const result = checkBundle({ ...baseInput, entryBudgetBytes: 10 });
    expect(result.errors.join()).toMatch(/budget/);
  });

  it('fails when the entry contains a forbidden marker such as the debug hook', () => {
    files['assets/shared.js'] = 'window.__WORLD__ = {}';
    const result = checkBundle(baseInput);
    files['assets/shared.js'] = 'export const x = 1';
    expect(result.errors.join()).toMatch(/__WORLD__/);
  });

  it('fails when there is no entry chunk', () => {
    const result = checkBundle({ ...baseInput, manifest: {} });
    expect(result.errors.join()).toMatch(/no entry/i);
  });
});

describe('checkSpaceBudgets (spec 010, AC-12)', () => {
  /** A Space with its own chunk plus a lazy-only helper chunk, next to the entry. */
  const lazyManifest = {
    ...manifest,
    'src/spaces/demo-cube/index.ts': {
      file: 'assets/demo-cube.js',
      isDynamicEntry: true,
      imports: ['index.html', '_viewer.js'],
    },
    '_viewer.js': { file: 'assets/viewer.js', imports: ['_shared.js'] },
  };
  const lazyFiles: Record<string, string> = { ...files, 'assets/viewer.js': 'x'.repeat(5000) };
  const input = (assetBytes: (spaceId: string) => number, budgetBytes = 5 * 1024 * 1024) => ({
    manifest: lazyManifest,
    spaceSources: ['src/spaces/demo-cube/index.ts'],
    readFile: (file: string) => lazyFiles[file] ?? '',
    assetBytes,
    budgetBytes,
  });

  it('derives the Space id from its source path', () => {
    expect(spaceIdOf('src/spaces/sheen-chair/index.ts')).toBe('sheen-chair');
  });

  it('counts the Space chunk and its lazy-only imports (gzipped) plus its asset folder, not entry code', () => {
    const { errors, sizes } = checkSpaceBudgets(input((id) => (id === 'demo-cube' ? 1000 : 0)));
    expect(errors).toEqual([]);
    const [size] = sizes;
    expect(size?.id).toBe('demo-cube');
    expect(size?.assetBytes).toBe(1000);
    const own = ['assets/demo-cube.js', 'assets/viewer.js'].reduce(
      (sum, file) => sum + gzipSync(lazyFiles[file] ?? '').length,
      0,
    );
    expect(size?.codeGzipBytes).toBe(own);
    expect(size?.totalBytes).toBe(own + 1000);
  });

  it('fails a Space whose code plus assets exceed the budget, naming it and its size', () => {
    const { errors } = checkSpaceBudgets(input(() => 6 * 1024 * 1024));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/demo-cube.*6\.0 MB.*5 MB/);
  });

  it('a Space can have its own, tighter budget (022 AC-13, D-030: the Solar System ≤ 4 MB)', () => {
    const { errors } = checkSpaceBudgets({
      ...input(() => 4.5 * 1024 * 1024),
      budgetFor: { 'demo-cube': 4 * 1024 * 1024 },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/demo-cube.*4\.5 MB.*4 MB/);
    expect(checkSpaceBudgets({ ...input(() => 4.5 * 1024 * 1024) }).errors).toEqual([]); // default 5 MB
  });

  it('a Space without an asset folder is measured by its code alone', () => {
    const { errors, sizes } = checkSpaceBudgets(input(() => 0));
    expect(errors).toEqual([]);
    expect(sizes[0]?.assetBytes).toBe(0);
  });

  describe('emitted files such as the KTX2 transcoder (spec 011, AC-6)', () => {
    /** The Space and its lazy helper each reference an emitted file; the entry references one of its own. */
    const emittingManifest = {
      ...lazyManifest,
      'index.html': { ...lazyManifest['index.html'], assets: ['assets/logo.svg'] },
      'src/spaces/demo-cube/index.ts': {
        ...lazyManifest['src/spaces/demo-cube/index.ts'],
        assets: ['assets/transcoder.wasm', 'assets/logo.svg'],
      },
      '_viewer.js': { ...lazyManifest['_viewer.js'], assets: ['assets/transcoder.js'] },
    };
    const emittingFiles: Record<string, string> = {
      ...lazyFiles,
      'assets/transcoder.wasm': 'w'.repeat(30_000), // compresses well, but is counted as stored
      'assets/transcoder.js': 'j'.repeat(2_000),
      'assets/logo.svg': 's'.repeat(9_000),
    };
    const emitting = (budgetBytes = 5 * 1024 * 1024) => ({
      ...input(() => 1000, budgetBytes),
      manifest: emittingManifest,
      readFile: (file: string) => emittingFiles[file] ?? '',
    });

    it('counts files emitted by the Space’s lazy chunks at their stored size', () => {
      const { sizes } = checkSpaceBudgets(emitting());
      expect(sizes[0]?.emittedBytes).toBe(32_000);
      expect(sizes[0]?.totalBytes).toBe((sizes[0]?.codeGzipBytes ?? 0) + 1000 + 32_000);
    });

    it('does not charge a Space for files the entry also uses', () => {
      const { sizes } = checkSpaceBudgets(emitting());
      expect(sizes[0]?.emittedBytes).not.toBeGreaterThan(32_000); // logo.svg (9 000) is the entry's
    });

    it('a Space without emitted files reports 0', () => {
      expect(checkSpaceBudgets(input(() => 0)).sizes[0]?.emittedBytes).toBe(0);
    });

    it('the over-budget message breaks the total down, including emitted files', () => {
      const { errors } = checkSpaceBudgets(emitting(20_000));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/demo-cube/);
      expect(errors[0]).toMatch(/assets 1\.0 KB/);
      expect(errors[0]).toMatch(/emitted files 31\.3 KB/);
    });
  });

  it('skips Spaces missing from the build (checkBundle reports those)', () => {
    const result = checkSpaceBudgets({ ...input(() => 0), spaceSources: ['src/spaces/nope/index.ts'] });
    expect(result).toEqual({ errors: [], sizes: [] });
  });
});
