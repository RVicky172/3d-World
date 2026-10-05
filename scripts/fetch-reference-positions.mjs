// @ts-check
// Dev-only (spec 021, T002): fetches JPL Horizons reference positions for the orbit-maths tests (AC-1, AC-3)
// and writes tests/fixtures/horizons-positions.json, which is committed. Never run by the build, tests or CI.
// Usage: node scripts/fetch-reference-positions.mjs
import { writeFileSync } from 'node:fs';
import { horizonsUrl, julianDay, parseVectors } from './horizons.mjs';

const DATES = [
  '1800-01-03T00:00:00Z', // Horizons has no Neptune before 1800-01-02
  '1850-01-01T00:00:00Z',
  '1900-01-01T00:00:00Z',
  '1950-01-01T00:00:00Z',
  '2000-01-01T12:00:00Z',
  '2025-01-01T00:00:00Z',
  '2050-12-31T00:00:00Z',
];

/** Our body id → Horizons id and centre: planets about the Sun, moons about their planet.
 * @type {Record<string, [string, string]>} */
const BODIES = {
  mercury: ['199', '@10'],
  venus: ['299', '@10'],
  earth: ['399', '@10'],
  mars: ['499', '@10'],
  jupiter: ['599', '@10'],
  saturn: ['699', '@10'],
  uranus: ['799', '@10'],
  neptune: ['899', '@10'],
  moon: ['301', '@399'],
  io: ['501', '@599'],
  europa: ['502', '@599'],
  ganymede: ['503', '@599'],
  callisto: ['504', '@599'],
  titan: ['606', '@699'],
  triton: ['801', '@899'],
};

const days = DATES.map(julianDay);
/** @type {Record<string, { horizons: string; center: string; xyz: Array<[number, number, number]> }>} */
const bodies = {};
for (const [id, [command, center]] of Object.entries(BODIES)) {
  const response = await fetch(horizonsUrl(command, center, days));
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
  const rows = parseVectors(await response.text());
  if (rows.length !== days.length) throw new Error(`${id}: expected ${days.length} rows, got ${rows.length}`);
  bodies[id] = { horizons: command, center, xyz: rows.map((row) => row.xyz) };
  console.log(`${id}: ok`);
}

const fixture = {
  source: 'JPL Horizons API (https://ssd.jpl.nasa.gov/api/horizons.api), public domain',
  query: 'EPHEM_TYPE=VECTORS, REF_PLANE=ECLIPTIC, REF_SYSTEM=J2000, OUT_UNITS=KM-S, VEC_TABLE=1, TLIST',
  frame: 'ecliptic and mean equinox of J2000; km; planets about the Sun, moons about their planet',
  read: new Date().toISOString().slice(0, 10),
  dates: DATES.map((iso, i) => ({ iso, jd: days[i] })),
  bodies,
};
writeFileSync('tests/fixtures/horizons-positions.json', `${JSON.stringify(fixture, null, 2)}\n`);
console.log('wrote tests/fixtures/horizons-positions.json');
