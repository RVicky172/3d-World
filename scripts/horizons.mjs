// @ts-check
// Pure helpers for the dev-only JPL Horizons fetch (spec 021, T002): Julian days, the query URL, and parsing
// the vector table. Unit-tested from tests/unit/scripts/horizons.test.ts; the network call lives in
// scripts/fetch-reference-positions.mjs.

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
/** Julian day of the Unix epoch (1970-01-01T00:00:00Z). */
const UNIX_EPOCH_JD = 2440587.5;

/**
 * Julian day of a UTC instant (treated as TDB: they differ by about a minute, far below the tests' tolerances).
 * @param {string} iso
 * @returns {number}
 */
export function julianDay(iso) {
  return Date.parse(iso) / 86_400_000 + UNIX_EPOCH_JD;
}

/**
 * Horizons API query for heliocentric/planetocentric vectors: ecliptic and mean equinox of J2000, km.
 * @param {string} command body id, e.g. '599' (Jupiter)
 * @param {string} center e.g. '@10' (the Sun) or '@599'
 * @param {number[]} julianDays
 * @returns {string}
 */
export function horizonsUrl(command, center, julianDays) {
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: `'${command}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: `'${center}'`,
    REF_PLANE: "'ECLIPTIC'",
    REF_SYSTEM: "'J2000'",
    OUT_UNITS: "'KM-S'",
    VEC_TABLE: "'1'",
    TLIST: `'${julianDays.join(' ')}'`,
  });
  return `${API}?${params}`;
}

/**
 * The rows between `$$SOE` and `$$EOE`: a Julian-day line, then `X = … Y = … Z = …`.
 * @param {string} text
 * @returns {Array<{ jd: number; xyz: [number, number, number] }>}
 */
export function parseVectors(text) {
  const start = text.indexOf('$$SOE');
  const end = text.indexOf('$$EOE');
  if (start < 0 || end < start) throw new Error(`Horizons reply has no vectors:\n${text.slice(0, 400)}`);
  const lines = text
    .slice(start + 5, end)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  /** @type {Array<{ jd: number; xyz: [number, number, number] }>} */
  const rows = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const jd = Number.parseFloat(lines[i] ?? '');
    const match = /X\s*=\s*(\S+)\s+Y\s*=\s*(\S+)\s+Z\s*=\s*(\S+)/.exec(lines[i + 1] ?? '');
    if (!Number.isFinite(jd) || !match)
      throw new Error(`unexpected Horizons rows: ${lines[i]} / ${lines[i + 1]}`);
    rows.push({ jd, xyz: [Number(match[1]), Number(match[2]), Number(match[3])] });
  }
  return rows;
}
