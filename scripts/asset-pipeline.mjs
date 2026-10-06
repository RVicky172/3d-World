// @ts-check
// Pure rules for the asset pipeline (spec 011, AC-14): manifest validation, per-slot texture settings, and
// checks on what `build-assets.mjs` produced. Spec 022 adds standalone textures: one image → one KTX2 file.
// Unit-tested in tests/unit/scripts/asset-pipeline.test.ts.

/**
 * @typedef {'etc1s' | 'uastc'} TextureMode
 * @typedef {{
 *   kind?: 'model';
 *   id: string;
 *   source: string;
 *   output: string;
 *   maxBytes: number;
 *   textures: { color: TextureMode; data: TextureMode };
 *   maxSize?: Record<string, number>;
 * }} ModelEntry
 * @typedef {{
 *   kind: 'texture';
 *   id: string;
 *   source: string;
 *   output: string;
 *   maxBytes: number;
 *   mode: TextureMode;
 *   color: boolean;
 * }} TextureEntry one image → one `.ktx2`; `color` = sRGB (perceptual), else linear data
 * @typedef {ModelEntry | TextureEntry} AssetEntry
 * @typedef {readonly AssetEntry[]} AssetManifest
 * @typedef {{
 *   id: string;
 *   bytes: number;
 *   maxBytes: number;
 *   sourceExtensions: readonly string[];
 *   outputExtensions: readonly string[];
 *   textureMimeTypes: readonly string[];
 * }} OutputReport
 */

/** Material slots holding colour (sRGB) images; every other slot holds data (normals, ORM, roughness…). */
const COLOR_SLOTS = new Set(['baseColorTexture', 'sheenColorTexture', 'emissiveTexture']);
const MODES = new Set(['etc1s', 'uastc']);
const MB = 1024 * 1024;
/** The 12-byte file identifier every KTX2 file starts with: «KTX 20»\r\n\x1A\n. */
export const KTX2_IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Problems with the manifest, one message per problem, each naming the model; empty when it's valid.
 * @param {AssetManifest} manifest
 * @param {(path: string) => boolean} exists
 * @returns {string[]}
 */
export function validateManifest(manifest, exists) {
  if (manifest.length === 0) return ['The asset manifest lists no models.'];
  /** @type {string[]} */
  const errors = [];
  const ids = new Set();
  const outputs = new Set();

  for (const entry of manifest) {
    const fail = (/** @type {string} */ message) => errors.push(`${entry.id}: ${message}`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.id)) fail(`id "${entry.id}" must be kebab-case.`);
    if (ids.has(entry.id)) fail('id is used more than once.');
    if (outputs.has(entry.output)) fail(`output ${entry.output} is used more than once.`);
    ids.add(entry.id);
    outputs.add(entry.output);

    if (!entry.source.startsWith('assets-src/')) fail('source must be under assets-src/.');
    else if (!exists(entry.source)) {
      fail(
        `source file not found: ${entry.source} (add the original model there, see assets-src/README.md).`,
      );
    }
    if (!(entry.maxBytes > 0)) fail('maxBytes must be a positive number.');
    if (entry.kind === 'texture') {
      if (!entry.output.startsWith('public/assets/')) fail('output must be under public/assets/.');
      else if (!entry.output.endsWith('.ktx2')) fail('output must be a .ktx2 file.');
      if (!/\.(jpe?g|png)$/.test(entry.source)) fail('source must be a .jpg or .png image.');
      if (!MODES.has(entry.mode)) fail('mode must be "etc1s" or "uastc".');
      if (typeof entry.color !== 'boolean') fail('color must be true (sRGB) or false (linear data).');
      continue;
    }
    if (!entry.output.startsWith('public/assets/')) fail('output must be under public/assets/.');
    else if (!entry.output.endsWith('.glb')) fail('output must be a .glb file.');
    for (const kind of /** @type {const} */ (['color', 'data'])) {
      if (!MODES.has(entry.textures[kind])) fail(`textures.${kind} must be "etc1s" or "uastc".`);
    }
    for (const [slot, size] of Object.entries(entry.maxSize ?? {})) {
      if (!Number.isInteger(size) || size < 1 || (size & (size - 1)) !== 0) {
        fail(`maxSize.${slot} must be a power of two.`);
      }
    }
  }
  return errors;
}

/**
 * Problems with a generated standalone texture: over its size limit, not a KTX2 file, or sides that aren't
 * multiples of four. `header` is the file's first 28 bytes.
 * @param {{ id: string; bytes: number; maxBytes: number; header: Uint8Array }} report
 * @returns {string[]}
 */
export function checkTextureOutput({ id, bytes, maxBytes, header }) {
  /** @type {string[]} */
  const errors = [];
  const kb = (/** @type {number} */ n) => `${Math.round(n / 1024)} KB`;
  if (bytes > maxBytes) errors.push(`${id}: output is ${kb(bytes)}, over its ${kb(maxBytes)} limit.`);
  if (!KTX2_IDENTIFIER.every((byte, i) => header[i] === byte)) {
    errors.push(`${id}: output is not a KTX2 file.`);
    return errors;
  }
  // Block-compressed formats work in 4 × 4 blocks (KTX2Loader warns otherwise; some GPUs refuse the upload).
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const [width, height] = [view.getUint32(20, true), view.getUint32(24, true)];
  if (width % 4 || height % 4)
    errors.push(`${id}: ${width} × ${height} is not a multiple of four in both dimensions.`);
  return errors;
}

/**
 * The nearest size whose sides are multiples of four (at least four), for block-compressed textures.
 * @param {number} width
 * @param {number} height
 * @returns {{ width: number, height: number }}
 */
export function blockAligned(width, height) {
  const align = (/** @type {number} */ n) => Math.max(4, Math.round(n / 4) * 4);
  return { width: align(width), height: align(height) };
}

/**
 * Encoding for a texture used in `slots`. Data wins over colour when a texture is shared, because UASTC is the
 * higher-quality mode and data maps such as normals show ETC1S artefacts.
 * @param {readonly string[]} slots
 * @param {ModelEntry['textures']} modes
 * @returns {TextureMode}
 */
export function textureMode(slots, modes) {
  return isColorTexture(slots) ? modes.color : modes.data;
}

/**
 * True when every slot using the texture holds colour, so it is encoded perceptually with an sRGB transfer
 * function; data maps stay linear.
 * @param {readonly string[]} slots
 * @returns {boolean}
 */
export function isColorTexture(slots) {
  return slots.length > 0 && slots.every((slot) => COLOR_SLOTS.has(slot));
}

/**
 * Largest allowed width/height for a texture used in `slots`: the smallest cap that applies, if any.
 * @param {readonly string[]} slots
 * @param {Record<string, number> | undefined} caps
 * @returns {number | undefined}
 */
export function maxSizeFor(slots, caps) {
  const sizes = slots.flatMap((slot) => (caps?.[slot] === undefined ? [] : [caps[slot]]));
  return sizes.length > 0 ? Math.min(...sizes) : undefined;
}

/**
 * Problems with a generated model: over its size limit, a source extension lost, not compressed, or
 * textures the encoder silently left as PNG/JPEG (its glTF-Transform step only warns on failure).
 * @param {OutputReport} report
 * @returns {string[]}
 */
export function checkOutput({ id, bytes, maxBytes, sourceExtensions, outputExtensions, textureMimeTypes }) {
  /** @type {string[]} */
  const errors = [];
  const fail = (/** @type {string} */ message) => errors.push(`${id}: ${message}`);
  const used = new Set(outputExtensions);

  if (bytes > maxBytes) {
    fail(`output is ${(bytes / MB).toFixed(2)} MB, over its ${(maxBytes / MB).toFixed(2)} MB limit.`);
  }
  for (const extension of sourceExtensions) {
    if (!used.has(extension)) fail(`output lost the ${extension} extension.`);
  }
  if (!used.has('EXT_meshopt_compression')) fail('output is missing EXT_meshopt_compression.');
  if (textureMimeTypes.length > 0 && !used.has('KHR_texture_basisu'))
    fail('output is missing KHR_texture_basisu.');

  const notKtx2 = textureMimeTypes.filter((type) => type !== 'image/ktx2');
  if (notKtx2.length > 0) {
    fail(
      `${notKtx2.length} of ${textureMimeTypes.length} textures are not KTX2 (${[...new Set(notKtx2)].join(', ')}); ` +
        'see the encoder warnings above.',
    );
  }
  return errors;
}
