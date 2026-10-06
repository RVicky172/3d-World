// @ts-check
// `npm run assets`: turns each original model in assets-src/ into its web-ready file in public/assets/
// (spec 011): Meshopt geometry and KTX2 textures. Settings: scripts/assets.config.mjs; rules and checks:
// scripts/asset-pipeline.mjs. Dev-only (D-018). Its output is committed, so the build never runs it.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, listTextureSlots, meshopt, prune, weld } from '@gltf-transform/functions';
import { encodeToKTX2 } from 'ktx2-encoder';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import manifest from './assets.config.mjs';
import {
  blockAligned,
  checkOutput,
  checkTextureOutput,
  isColorTexture,
  maxSizeFor,
  textureMode,
  validateManifest,
} from './asset-pipeline.mjs';

/** Basis settings per mode, as chosen in the 011 T003 spike. */
const ENCODE = {
  etc1s: { isUASTC: false, qualityLevel: 128, compressionLevel: 2 },
  uastc: {
    isUASTC: true,
    needSupercompression: true,
    uastcLDRQualityLevel: 1,
    enableRDO: true,
    rdoQualityLevel: 1,
  },
};

/**
 * PNG/JPEG bytes → RGBA pixels, which ktx2-encoder needs in Node.
 * @param {Uint8Array} buffer
 */
async function decodeImage(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

/**
 * The Basis encoder prints a line per mip level to stdout; keep the console readable.
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
async function quietly(task) {
  const log = console.log;
  console.log = () => {};
  try {
    return await task();
  } finally {
    console.log = log;
  }
}

/** @param {number} bytes */
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

/**
 * @param {import('./asset-pipeline.mjs').ModelEntry} entry
 * @param {NodeIO} io
 * @returns {Promise<string[]>} errors from the output checks
 */
async function build(entry, io) {
  const started = Date.now();
  const document = await io.read(entry.source);
  const root = document.getRoot();
  const sourceExtensions = root.listExtensionsUsed().map((extension) => extension.extensionName);

  await document.transform(dedup(), prune(), weld());

  // Textures one at a time: deterministic output, modest memory, and encoder errors throw.
  for (const texture of root.listTextures()) {
    const slots = listTextureSlots(texture);
    let image = texture.getImage();
    if (!image) continue;
    const before = image.byteLength;
    const limit = maxSizeFor(slots, entry.maxSize);
    const size = texture.getSize();
    if (limit && size && Math.max(...size) > limit) {
      image = new Uint8Array(await sharp(image).resize(limit, limit, { fit: 'inside' }).png().toBuffer());
    }
    const mode = textureMode(slots, entry.textures);
    const color = isColorTexture(slots);
    const encoded = await quietly(() =>
      encodeToKTX2(image, {
        ...ENCODE[mode],
        isPerceptual: color,
        isSetKTX2SRGBTransferFunc: color,
        generateMipmap: true,
        imageDecoder: decodeImage,
      }),
    );
    texture.setImage(encoded).setMimeType('image/ktx2');
    console.log(
      `  ${slots.join('+') || 'unused'}: ${mode}${limit ? ` ≤ ${limit}px` : ''}, ${kb(before)} → ${kb(encoded.byteLength)}`,
    );
  }
  if (root.listTextures().length > 0) document.createExtension(KHRTextureBasisu).setRequired(true);

  await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

  mkdirSync(dirname(entry.output), { recursive: true });
  await io.write(entry.output, document);

  const bytes = statSync(entry.output).size;
  console.log(
    `${entry.id}: ${kb(statSync(entry.source).size)} → ${kb(bytes)} in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
  return checkOutput({
    id: entry.id,
    bytes,
    maxBytes: entry.maxBytes,
    sourceExtensions,
    outputExtensions: root.listExtensionsUsed().map((extension) => extension.extensionName),
    textureMimeTypes: root.listTextures().map((texture) => texture.getMimeType()),
  });
}

/**
 * One image → one KTX2 file with mipmaps (spec 022): colour maps perceptual + sRGB, data maps linear.
 * @param {import('./asset-pipeline.mjs').TextureEntry} entry
 * @returns {Promise<string[]>} errors from the output checks
 */
async function buildTexture(entry) {
  const started = Date.now();
  let source = new Uint8Array(readFileSync(entry.source));
  const { width = 0, height = 0 } = await sharp(source).metadata();
  const aligned = blockAligned(width, height);
  if (aligned.width !== width || aligned.height !== height) {
    // Block compression needs sides in multiples of four (the ring strip is published 1024 × 63).
    source = new Uint8Array(
      await sharp(source).resize(aligned.width, aligned.height, { fit: 'fill' }).png().toBuffer(),
    );
  }
  const encoded = await quietly(() =>
    encodeToKTX2(source, {
      ...ENCODE[entry.mode],
      isPerceptual: entry.color,
      isSetKTX2SRGBTransferFunc: entry.color,
      generateMipmap: true,
      imageDecoder: decodeImage,
    }),
  );
  mkdirSync(dirname(entry.output), { recursive: true });
  writeFileSync(entry.output, encoded);
  console.log(
    `  ${entry.mode}${entry.color ? ' sRGB' : ' linear'}: ${kb(source.byteLength)} → ${kb(encoded.byteLength)} in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
  return checkTextureOutput({
    id: entry.id,
    bytes: encoded.byteLength,
    maxBytes: entry.maxBytes,
    header: encoded.subarray(0, 28), // identifier, then pixelWidth/pixelHeight at 20 and 24
  });
}

const problems = validateManifest(manifest, existsSync);
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const errors = [];
for (const entry of manifest) {
  console.log(`${entry.id}: ${entry.source} → ${entry.output}`);
  errors.push(...(entry.kind === 'texture' ? await buildTexture(entry) : await build(entry, io)));
}
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
