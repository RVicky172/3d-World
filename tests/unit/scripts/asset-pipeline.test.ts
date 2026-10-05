import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../../../scripts/assets.config.mjs';
import {
  checkOutput,
  isColorTexture,
  maxSizeFor,
  textureMode,
  validateManifest,
  type AssetEntry,
} from '../../../scripts/asset-pipeline.mjs';

// Spec 011, AC-14: the asset pipeline's settings and its checks on what it produced.

const entry = (overrides: Partial<AssetEntry> = {}): AssetEntry => ({
  id: 'sheen-chair',
  source: 'assets-src/sheen-chair/SheenChair.glb',
  output: 'public/assets/sheen-chair/SheenChair.glb',
  maxBytes: 1.5 * 1024 * 1024,
  textures: { color: 'etc1s', data: 'uastc' },
  maxSize: { normalTexture: 512 },
  ...overrides,
});
const allExist = () => true;

describe('validateManifest', () => {
  it('accepts a well-formed entry whose source exists', () => {
    expect(validateManifest([entry()], allExist)).toEqual([]);
  });

  it('rejects an empty manifest', () => {
    expect(validateManifest([], allExist)).toEqual(['The asset manifest lists no models.']);
  });

  it.each<[string, Partial<AssetEntry>, RegExp]>([
    ['an id that is not kebab-case', { id: 'Sheen Chair' }, /id "Sheen Chair"/],
    ['a source outside assets-src/', { source: 'public/x.glb' }, /source must be under assets-src\//],
    ['an output outside public/assets/', { output: 'dist/x.glb' }, /output must be under public\/assets\//],
    ['a non-GLB output', { output: 'public/assets/x/x.gltf' }, /\.glb/],
    ['a zero size limit', { maxBytes: 0 }, /maxBytes must be a positive number/],
    ['an unknown texture mode', { textures: { color: 'etc1s', data: 'png' as 'uastc' } }, /textures\.data/],
    ['a non-power-of-two size cap', { maxSize: { normalTexture: 500 } }, /maxSize\.normalTexture/],
  ])('rejects %s, naming the model', (_label, overrides, message) => {
    const errors = validateManifest([entry(overrides)], allExist);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(message);
    expect(errors[0]).toMatch(/^sheen-chair: |^Sheen Chair: /);
  });

  it('rejects duplicate ids and outputs', () => {
    const errors = validateManifest([entry(), entry()], allExist);
    expect(errors).toEqual([
      'sheen-chair: id is used more than once.',
      'sheen-chair: output public/assets/sheen-chair/SheenChair.glb is used more than once.',
    ]);
  });

  it('the real manifest is valid and its sources are in the repo', () => {
    expect(validateManifest(manifest, existsSync)).toEqual([]);
  });

  it('names a missing source file and tells how to fix it', () => {
    const errors = validateManifest([entry()], () => false);
    expect(errors).toEqual([
      'sheen-chair: source file not found: assets-src/sheen-chair/SheenChair.glb ' +
        '(add the original model there, see assets-src/README.md).',
    ]);
  });
});

describe('textureMode', () => {
  const modes = { color: 'etc1s', data: 'uastc' } as const;

  it.each([['baseColorTexture'], ['sheenColorTexture'], ['emissiveTexture']])('%s is colour', (slot) => {
    expect(textureMode([slot], modes)).toBe('etc1s');
  });

  it.each([['normalTexture'], ['occlusionTexture'], ['metallicRoughnessTexture'], ['sheenRoughnessTexture']])(
    '%s is data',
    (slot) => {
      expect(textureMode([slot], modes)).toBe('uastc');
    },
  );

  it('a texture shared by a colour slot and a data slot gets the data mode (the safer quality)', () => {
    expect(textureMode(['baseColorTexture', 'normalTexture'], modes)).toBe('uastc');
  });

  it('an unused texture (no slots) is treated as data', () => {
    expect(textureMode([], modes)).toBe('uastc');
  });
});

describe('isColorTexture', () => {
  it('is true only when every slot holds colour, so it is encoded as sRGB', () => {
    expect(isColorTexture(['baseColorTexture'])).toBe(true);
    expect(isColorTexture(['baseColorTexture', 'sheenColorTexture'])).toBe(true);
    expect(isColorTexture(['baseColorTexture', 'normalTexture'])).toBe(false);
    expect(isColorTexture(['occlusionTexture'])).toBe(false);
    expect(isColorTexture([])).toBe(false);
  });
});

describe('maxSizeFor', () => {
  it('returns the cap for a capped slot, the smallest when several apply, and none otherwise', () => {
    const caps = { normalTexture: 512, occlusionTexture: 256 };
    expect(maxSizeFor(['normalTexture'], caps)).toBe(512);
    expect(maxSizeFor(['normalTexture', 'occlusionTexture'], caps)).toBe(256);
    expect(maxSizeFor(['baseColorTexture'], caps)).toBeUndefined();
    expect(maxSizeFor(['normalTexture'], undefined)).toBeUndefined();
  });
});

describe('checkOutput', () => {
  const good = {
    id: 'sheen-chair',
    bytes: 1_330_000,
    maxBytes: 1.5 * 1024 * 1024,
    sourceExtensions: ['KHR_materials_sheen', 'KHR_texture_transform'],
    outputExtensions: [
      'KHR_materials_sheen',
      'KHR_texture_transform',
      'KHR_texture_basisu',
      'KHR_mesh_quantization',
      'EXT_meshopt_compression',
    ],
    textureMimeTypes: ['image/ktx2', 'image/ktx2'],
  };

  it('passes a compressed model within its limit that kept its extensions', () => {
    expect(checkOutput(good)).toEqual([]);
  });

  it('names the model and both sizes when it is too big', () => {
    expect(checkOutput({ ...good, bytes: 1_700_000 })).toEqual([
      'sheen-chair: output is 1.62 MB, over its 1.50 MB limit.',
    ]);
  });

  it('reports a source extension the output lost', () => {
    expect(
      checkOutput({
        ...good,
        outputExtensions: good.outputExtensions.filter((e) => e !== 'KHR_materials_sheen'),
      }),
    ).toEqual(['sheen-chair: output lost the KHR_materials_sheen extension.']);
  });

  it('requires Meshopt geometry and KTX2 textures', () => {
    expect(
      checkOutput({ ...good, outputExtensions: ['KHR_materials_sheen', 'KHR_texture_transform'] }),
    ).toEqual([
      'sheen-chair: output is missing EXT_meshopt_compression.',
      'sheen-chair: output is missing KHR_texture_basisu.',
    ]);
  });

  it('reports textures that did not become KTX2 (the encoder only warns on failure)', () => {
    expect(checkOutput({ ...good, textureMimeTypes: ['image/ktx2', 'image/png', 'image/png'] })).toEqual([
      'sheen-chair: 2 of 3 textures are not KTX2 (image/png); see the encoder warnings above.',
    ]);
  });

  it('a model without textures needs no KTX2', () => {
    expect(
      checkOutput({
        ...good,
        outputExtensions: ['KHR_materials_sheen', 'KHR_texture_transform', 'EXT_meshopt_compression'],
        textureMimeTypes: [],
      }),
    ).toEqual([]);
  });
});
