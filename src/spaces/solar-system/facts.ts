import { BODIES, FACTS } from './data';
import { moonPosition, planetPosition, type Vector3Like } from './orbit';
import type { BodyData } from './types';

/** Newton's gravitational constant in km³ kg⁻¹ s⁻² (CODATA 2018): mass = GM ÷ G (spec 023, AC-13). */
export const G_KM3_PER_KG_S2 = 6.6743e-20;

export interface FactRow {
  label: string;
  value: string;
}

/** What a body's facts card shows (spec 023, AC-9). */
export interface BodyFactsView {
  name: string;
  description: string;
  rows: FactRow[];
}

const byId = new Map(BODIES.map((b) => [b.id, b]));
const body = (id: string): BodyData => {
  const found = byId.get(id);
  if (!found) throw new Error(`Solar System: no body "${id}"`);
  return found;
};
const EARTH = body('earth');

// Fixed English, so the card reads the same in every browser and tests don't depend on the locale.
const grouped = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const threeFigures = new Intl.NumberFormat('en', {
  minimumSignificantDigits: 3,
  maximumSignificantDigits: 3,
});
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const superscript = (n: number) =>
  String(n)
    .split('')
    .map((c) => (c === '-' ? '⁻' : SUPERSCRIPT[Number(c)]))
    .join('');

/** Three significant figures, grouped: "1.00", "0.383", "109", "333,000". */
export const formatRatio = (ratio: number): string => threeFigures.format(ratio);

/** "384,400 km", "149.6 million km", "4.50 billion km". */
export function formatDistance(km: number): string {
  if (km >= 1e9) return `${twoDecimals.format(km / 1e9)} billion km`;
  if (km >= 1e6) return `${oneDecimal.format(km / 1e6)} million km`;
  return `${grouped.format(km)} km`;
}

/** Hours under two days, days under two years, then years: "23.9 hours", "687.0 days", "11.9 years". */
export function formatDuration(hours: number): string {
  const days = hours / 24;
  if (hours < 48) return `${oneDecimal.format(hours)} hours`;
  if (days < 2 * 365.25) return `${oneDecimal.format(days)} days`;
  return `${oneDecimal.format(days / 365.25)} years`;
}

/** "5.97 × 10²⁴ kg". */
export function formatMass(kg: number): string {
  const [mantissa = '0', exponent = '0'] = kg.toExponential(2).split('e');
  return `${mantissa} × 10${superscript(Number(exponent))} kg`;
}

/** A body's mass from its standard gravitational parameter (020's data). */
export const massKg = (id: string): number => body(id).gmKm3s2 / G_KM3_PER_KG_S2;

/**
 * The facts card for a body (spec 023, AC-9, D-036): its description, then diameter and mass (also × Earth),
 * average distance from what it orbits, its day (sidereal: one turn, "backwards" for a tilt over 90°), its year
 * or orbit, axial tilt, and known moons (planets) or the number of planets (the Sun, which has no distance or year).
 */
export function factsFor(id: string): BodyFactsView {
  const b = body(id);
  const parent = b.parent ? body(b.parent) : null;
  const rows: FactRow[] = [
    {
      label: 'Diameter',
      // A size, not a distance: always in km ("1,391,400 km"), never "1.4 million km".
      value: `${grouped.format(2 * b.radiusKm)} km (${formatRatio(b.radiusKm / EARTH.radiusKm)} × Earth)`,
    },
    { label: 'Mass', value: `${formatMass(massKg(id))} (${formatRatio(b.gmKm3s2 / EARTH.gmKm3s2)} × Earth)` },
  ];
  if (b.orbit && parent) {
    rows.push({
      label: `Average distance from ${theName(parent)}`,
      value: formatDistance(b.orbit.semiMajorAxisKm),
    });
  }
  const backwards = b.axialTiltDeg > 90 ? ', backwards' : '';
  rows.push({ label: 'Day (one turn)', value: `${formatDuration(b.rotationHours)}${backwards}` });
  if (b.orbit && parent) {
    const label = b.kind === 'moon' ? `Orbit (one turn round ${parent.name})` : 'Year (one orbit)';
    rows.push({ label, value: formatDuration(b.orbit.periodDays * 24) });
  }
  rows.push({ label: 'Axial tilt', value: `${oneDecimal.format(b.axialTiltDeg)}°` });
  const known = FACTS[id]?.knownMoons;
  if (known) {
    rows.push({
      label: 'Known moons',
      value: known.count === 0 ? 'None' : `${grouped.format(known.count)} (as of ${known.asOf.slice(0, 4)})`,
    });
  }
  if (b.kind === 'star') {
    rows.push({ label: 'Planets', value: String(BODIES.filter((x) => x.kind === 'planet').length) });
  }
  return { name: b.name, description: FACTS[id]?.description ?? '', rows };
}

/** "the Sun", but "Earth", "Saturn". */
const theName = (b: BodyData) => (b.kind === 'star' ? `the ${b.name}` : b.name);

const point: Vector3Like = { x: 0, y: 0, z: 0 };

/**
 * The body's current distance from what it orbits at `days` since J2000 (spec 023, AC-10, Q7), in real km
 * whatever the scale shown: "Now: 147.1 million km from the Sun", "Now: 368,000 km from Earth". The Sun: null.
 * Moons are rounded to 1,000 km, so the text changes about as often as the planets' does.
 */
export function liveDistance(id: string, days: number): string | null {
  const b = body(id);
  if (!b.orbit || !b.parent) return null;
  const parent = body(b.parent);
  if (b.kind === 'moon') moonPosition(b, parent, days, point);
  else planetPosition(b, days, point);
  const km = Math.hypot(point.x, point.y, point.z);
  const shown = km < 1e6 ? Math.round(km / 1000) * 1000 : km;
  return `Now: ${formatDistance(shown)} from ${theName(parent)}`;
}
