import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../../../scripts/assets.config.mjs';
import {
  blockAligned,
  checkOutput,
  checkTextureOutput,
  isColorTexture,
  KTX2_IDENTIFIER,
  maxSizeFor,
  textureMode,
  validateManifest,
  type ModelEntry,
  type TextureEntry,
} from '../../../scripts/asset-pipeline.mjs';

// Spec 011, AC-14: the asset pipeline's settings and its checks on what it produced. Spec 022, T010: standalone
// textures (one image → one KTX2 file) for the Solar System.

const entry = (overrides: Partial<ModelEntry> = {}): ModelEntry => ({
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

  it.each<[string, Partial<ModelEntry>, RegExp]>([
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

describe('texture entries (spec 022, T010)', () => {
  const texture = (overrides: Partial<TextureEntry> = {}): TextureEntry => ({
    kind: 'texture',
    id: 'mars',
    source: 'assets-src/solar-system/mars.jpg',
    output: 'public/assets/solar-system/mars.ktx2',
    maxBytes: 450 * 1024,
    mode: 'etc1s',
    color: true,
    ...overrides,
  });

  it('accepts a well-formed texture entry next to model entries', () => {
    expect(validateManifest([entry(), texture()], allExist)).toEqual([]);
  });

  it.each<[string, Partial<TextureEntry>, RegExp]>([
    ['a non-KTX2 output', { output: 'public/assets/solar-system/mars.png' }, /output must be a \.ktx2 file/],
    [
      'a source that is not an image',
      { source: 'assets-src/solar-system/mars.glb' },
      /source must be a \.jpg or \.png/,
    ],
    ['an unknown mode', { mode: 'png' as 'etc1s' }, /mode must be "etc1s" or "uastc"/],
    [
      'a missing colour flag',
      { color: undefined as unknown as boolean },
      /color must be true \(sRGB\) or false \(linear data\)/,
    ],
    ['a source outside assets-src/', { source: 'public/mars.jpg' }, /source must be under assets-src\//],
  ])('rejects %s, naming the texture', (_label, overrides, message) => {
    const errors = validateManifest([texture(overrides)], allExist);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(message);
    expect(errors[0]).toMatch(/^mars: /);
  });

  it('the real manifest lists every Solar System map as a texture, with sources in the repo', () => {
    const textures = manifest.filter((e): e is TextureEntry => e.kind === 'texture');
    expect(textures.length).toBe(20);
    for (const t of textures) {
      expect(t.id).toMatch(/^solar-system-/); // unique across Spaces
      expect(t.output, t.id).toBe(`public/assets/solar-system/${t.id.replace('solar-system-', '')}.ktx2`);
      expect(existsSync(t.source), t.id).toBe(true);
    }
    // Data maps stay linear: the ocean mask (roughness) and the clouds (alpha).
    const linear = textures.filter((t) => !t.color).map((t) => t.id);
    expect(linear.sort()).toEqual(['solar-system-earth-clouds', 'solar-system-earth-ocean']);
  });

  describe('checkTextureOutput', () => {
    const header = (bytes: number[]) => Uint8Array.from([...bytes, ...new Array(20).fill(0)]);

    it('passes a KTX2 file within its limit', () => {
      expect(
        checkTextureOutput({
          id: 'mars',
          bytes: 300_000,
          maxBytes: 450 * 1024,
          header: header(KTX2_IDENTIFIER),
        }),
      ).toEqual([]);
    });

    it('names the texture and both sizes when it is too big', () => {
      expect(
        checkTextureOutput({
          id: 'mars',
          bytes: 500 * 1024,
          maxBytes: 450 * 1024,
          header: header(KTX2_IDENTIFIER),
        }),
      ).toEqual(['mars: output is 500 KB, over its 450 KB limit.']);
    });

    it('reports a file that is not KTX2', () => {
      expect(
        checkTextureOutput({
          id: 'mars',
          bytes: 1000,
          maxBytes: 450 * 1024,
          header: header([0x89, 0x50, 0x4e, 0x47]),
        }),
      ).toEqual(['mars: output is not a KTX2 file.']);
    });

    // Block-compressed formats (ETC1S, UASTC) work in 4 × 4 blocks: other sizes warn in KTX2Loader and may fail
    // to upload compressed on some GPUs (022 T051: the ring strip was 1024 × 63).
    it('reports dimensions that are not multiples of four (pixelWidth/pixelHeight at bytes 20 and 24)', () => {
      const sized = (width: number, height: number) => {
        const bytes = header(KTX2_IDENTIFIER);
        const view = new DataView(bytes.buffer);
        view.setUint32(20, width, true);
        view.setUint32(24, height, true);
        return bytes;
      };
      const check = (width: number, height: number) =>
        checkTextureOutput({ id: 'rings', bytes: 1000, maxBytes: 450 * 1024, header: sized(width, height) });
      expect(check(1024, 64)).toEqual([]);
      expect(check(1024, 63)).toEqual(['rings: 1024 × 63 is not a multiple of four in both dimensions.']);
    });
  });

  describe('blockAligned', () => {
    it('rounds each dimension to the nearest multiple of four, never below four', () => {
      expect(blockAligned(1024, 63)).toEqual({ width: 1024, height: 64 });
      expect(blockAligned(2048, 1024)).toEqual({ width: 2048, height: 1024 });
      expect(blockAligned(1021, 5)).toEqual({ width: 1020, height: 4 });
      expect(blockAligned(1, 2)).toEqual({ width: 4, height: 4 });
    });
  });
});
