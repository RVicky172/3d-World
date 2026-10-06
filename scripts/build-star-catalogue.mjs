// @ts-check
// Dev-only (spec 022, T005, AC-9): packs the Yale Bright Star Catalogue (assets-src/solar-system/bsc5-catalog.gz,
// CDS V/50) into public/assets/solar-system/stars.bin for the Solar System's sky. Run with
// `node scripts/build-star-catalogue.mjs`; the output is committed. Format: scripts/star-catalogue.mjs.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { encodeStars, parseBsc5 } from './star-catalogue.mjs';

const SOURCE = 'assets-src/solar-system/bsc5-catalog.gz';
const OUTPUT = 'public/assets/solar-system/stars.bin';

const stars = parseBsc5(gunzipSync(readFileSync(SOURCE)).toString('latin1'));
const bytes = encodeStars(stars);
mkdirSync('public/assets/solar-system', { recursive: true });
writeFileSync(OUTPUT, bytes);
console.log(`${stars.length} stars → ${OUTPUT} (${(bytes.byteLength / 1024).toFixed(1)} KB)`);
