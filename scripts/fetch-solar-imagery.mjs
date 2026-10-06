// @ts-check
// Dev-only (spec 022, T004, D-031): downloads the Solar System's source maps, brings each to its shipping size
// and to one convention (0° longitude at the centre, east to the right), applies the agreed treatments (greyscale
// maps tinted by body colour, Titan at low contrast), and writes them to assets-src/solar-system/ with
// sources.json. Run with `node scripts/fetch-solar-imagery.mjs`; never run in CI. `npm run assets` then encodes
// them. Rules and data: scripts/solar-imagery.mjs.

import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { IMAGERY, columnShift, fillNoData, outputPath, rollColumns, targetSize } from './solar-imagery.mjs';

const OUT = 'assets-src/solar-system';
/** At or below this in every channel, a mosaic pixel is unmapped (JPEG noise keeps true black slightly above 0). */
const NO_DATA = 10;
const read = new Date().toISOString().slice(0, 10);

/**
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function download(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (3d-world asset fetch)' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get('content-type') ?? '';
      if (type.includes('text/html')) throw new Error(`got HTML, not an image (${type})`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= 5) throw new Error(`${url}: ${/** @type {Error} */ (error).message}`, { cause: error });
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
    }
  }
}

/** @param {number} hex */
const rgb = (hex) => ({ r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 });

mkdirSync(OUT, { recursive: true });
const records = [];
for (const map of IMAGERY) {
  const bytes = await download(map.url);
  const source = await sharp(bytes, { limitInputPixels: false }).metadata();
  const { width, height } = targetSize(map.id);
  let image;
  if (map.id === 'saturn-rings') {
    // A radial strip with alpha: keep its proportions and transparency.
    image = sharp(bytes).resize({ width }).png();
  } else {
    const { data, info } = await sharp(bytes, { limitInputPixels: false })
      .resize(width, height, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rolled = rollColumns(
      map.fillNoData ? fillNoData(new Uint8Array(data), info.channels, NO_DATA) : new Uint8Array(data),
      info.width,
      info.height,
      info.channels,
      columnShift(info.width, map.leftEdgeLongitudeDeg),
    );
    image = sharp(rolled, { raw: { width: info.width, height: info.height, channels: info.channels } });
    if (map.contrast !== undefined) image = image.linear(map.contrast, 128 * (1 - map.contrast));
    if (map.tint !== undefined) image = image.tint(rgb(map.tint));
    if (map.id === 'earth-ocean' || map.id === 'earth-clouds') image = image.greyscale();
    image = image.jpeg({ quality: 95 });
  }
  const file = outputPath(map.id);
  const info = await image.toFile(file);
  console.log(
    `${map.id}: ${source.width}×${source.height} → ${info.width}×${info.height}, ${Math.round(info.size / 1024)} KB`,
  );
  records.push({
    id: map.id,
    url: map.url,
    page: map.page,
    credit: map.credit,
    licence: map.licence,
    read,
    source: { width: source.width, height: source.height, leftEdgeLongitudeDeg: map.leftEdgeLongitudeDeg },
    output: { file, width: info.width, height: info.height, leftEdgeLongitudeDeg: -180 },
    treatment: {
      ...(map.tint !== undefined ? { tint: `#${map.tint.toString(16).padStart(6, '0')}` } : {}),
      ...(map.contrast !== undefined ? { contrast: map.contrast } : {}),
      ...(map.fillNoData ? { fillNoData: `pixels ≤ ${NO_DATA} → mapped mean` } : {}),
    },
  });
}
writeFileSync(`${OUT}/sources.json`, `${JSON.stringify({ read, maps: records }, null, 2)}\n`);
console.log(`Wrote ${records.length} maps and ${OUT}/sources.json`);
