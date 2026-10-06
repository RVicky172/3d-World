import { describe, expect, it } from 'vitest';
import { BODIES, FACTS, SOURCES } from '../../../../src/spaces/solar-system/data';
import {
  factsFor,
  formatDistance,
  formatDuration,
  formatMass,
  formatRatio,
  G_KM3_PER_KG_S2,
  liveDistance,
  massKg,
} from '../../../../src/spaces/solar-system/facts';
import { daysFromEpochMs } from '../../../../src/spaces/solar-system/time';

// Spec 023, AC-9, AC-10, AC-13 (D-036): a facts card per body, from sourced data.

const row = (id: string, label: string) => factsFor(id).rows.find((r) => r.label === label)?.value;
const labels = (id: string) => factsFor(id).rows.map((r) => r.label);
const millions = (text: string) => Number(/([\d.]+) million km/.exec(text)?.[1]);
const dayOf = (y: number, m: number, d: number) => daysFromEpochMs(Date.UTC(y, m - 1, d));

describe('FACTS data (AC-13)', () => {
  it('every body has a one- or two-sentence description of at most 300 characters', () => {
    for (const body of BODIES) {
      const description = FACTS[body.id]?.description ?? '';
      expect(description.length, body.id).toBeGreaterThan(20);
      expect(description.length, body.id).toBeLessThanOrEqual(300);
      const sentences = description.split(/(?<=[.!?])\s+/).filter(Boolean);
      expect(sentences.length, body.id).toBeGreaterThanOrEqual(1);
      expect(sentences.length, body.id).toBeLessThanOrEqual(2);
    }
  });

  it('every planet has a known-moon count with an as-of date; nothing else does', () => {
    const counts = Object.fromEntries(
      BODIES.filter((b) => FACTS[b.id]?.knownMoons).map((b) => [b.id, FACTS[b.id]!.knownMoons!.count]),
    );
    expect(counts).toEqual({
      earth: 1,
      mars: 2,
      jupiter: 115,
      saturn: 293,
      uranus: 29,
      neptune: 16,
      mercury: 0,
      venus: 0,
    });
    for (const b of BODIES.filter((x) => x.kind === 'planet')) {
      expect(FACTS[b.id]!.knownMoons!.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('holds only text and moon counts: no number that 020’s data already has', () => {
    const allowed = new Set(['description', 'knownMoons']);
    for (const facts of Object.values(FACTS)) {
      for (const key of Object.keys(facts)) expect(allowed.has(key), key).toBe(true);
    }
    expect(Object.keys(FACTS).sort()).toEqual(BODIES.map((b) => b.id).sort());
  });

  it('names a public-domain source for the facts, with the date read', () => {
    const sources = SOURCES.filter((s) => s.covers.includes('facts'));
    expect(sources.length).toBeGreaterThanOrEqual(1);
    for (const s of sources) {
      expect(s.licence).toMatch(/public domain/i);
      expect(s.read).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.url).toMatch(/^https:\/\//);
    }
  });
});

describe('derived values (AC-13: from 020’s data, not duplicated)', () => {
  it('mass comes from GM ÷ G: Earth within 0.5 % of 5.972 × 10²⁴ kg, the Sun of 1.989 × 10³⁰', () => {
    expect(G_KM3_PER_KG_S2).toBe(6.6743e-20);
    expect(massKg('earth') / 5.972e24).toBeCloseTo(1, 2);
    expect(Math.abs(massKg('earth') / 5.972e24 - 1)).toBeLessThan(0.005);
    expect(Math.abs(massKg('sun') / 1.989e30 - 1)).toBeLessThan(0.005);
  });

  it('Earth’s card, row by row', () => {
    const earth = factsFor('earth');
    expect(earth.name).toBe('Earth');
    expect(earth.description).toBe(FACTS.earth!.description);
    expect(earth.rows).toEqual([
      { label: 'Diameter', value: '12,742 km (1.00 × Earth)' },
      { label: 'Mass', value: '5.97 × 10²⁴ kg (1.00 × Earth)' },
      { label: 'Average distance from the Sun', value: '149.6 million km' },
      { label: 'Day (one turn)', value: '23.9 hours' },
      { label: 'Year (one orbit)', value: '365.3 days' },
      { label: 'Axial tilt', value: '23.4°' },
      { label: 'Known moons', value: '1 (as of 2026)' },
    ]);
  });

  it('every planet shows the seven facts; a moon shows six (no moons of its own), measured from its planet', () => {
    for (const b of BODIES.filter((x) => x.kind === 'planet')) expect(factsFor(b.id).rows).toHaveLength(7);
    expect(labels('moon')).toEqual([
      'Diameter',
      'Mass',
      'Average distance from Earth',
      'Day (one turn)',
      'Orbit (one turn round Earth)',
      'Axial tilt',
    ]);
    expect(row('moon', 'Average distance from Earth')).toBe('384,400 km');
    expect(row('moon', 'Orbit (one turn round Earth)')).toBe('27.3 days');
    expect(row('titan', 'Orbit (one turn round Saturn)')).toBe('15.9 days');
  });

  it('the Sun: no distance or year (D-036); the planets it holds instead of moons', () => {
    expect(labels('sun')).toEqual(['Diameter', 'Mass', 'Day (one turn)', 'Axial tilt', 'Planets']);
    expect(row('sun', 'Diameter')).toBe('1,391,400 km (109 × Earth)');
    expect(row('sun', 'Mass')).toMatch(/^1\.99 × 10³⁰ kg \(333,000 × Earth\)$/);
    expect(row('sun', 'Day (one turn)')).toBe('25.4 days');
    expect(row('sun', 'Planets')).toBe('8');
  });

  it('a backwards spin says so (Venus, Uranus); the others don’t', () => {
    expect(row('venus', 'Day (one turn)')).toBe('243.0 days, backwards');
    expect(row('uranus', 'Day (one turn)')).toBe('17.2 hours, backwards');
    expect(row('mars', 'Day (one turn)')).toBe('24.6 hours');
  });

  it('a planet without moons says "None"', () => {
    expect(row('mercury', 'Known moons')).toBe('None');
    expect(row('venus', 'Known moons')).toBe('None');
    expect(row('saturn', 'Known moons')).toBe('293 (as of 2026)');
  });

  it('long years read in years, short ones in days', () => {
    expect(row('mercury', 'Year (one orbit)')).toBe('88.0 days');
    expect(row('mars', 'Year (one orbit)')).toBe('687.0 days');
    expect(row('jupiter', 'Year (one orbit)')).toBe('11.9 years');
    expect(row('neptune', 'Year (one orbit)')).toBe('164.8 years');
  });

  it('far distances read in billions', () => {
    expect(row('neptune', 'Average distance from the Sun')).toBe('4.50 billion km');
    expect(row('mercury', 'Average distance from the Sun')).toBe('57.9 million km');
  });
});

describe('formatters (fixed English, metric)', () => {
  it('formatDistance', () => {
    expect(formatDistance(384_400)).toBe('384,400 km');
    expect(formatDistance(149_597_870)).toBe('149.6 million km');
    expect(formatDistance(4_498_396_441)).toBe('4.50 billion km');
  });

  it('formatDuration: hours under two days, days under two years, then years', () => {
    expect(formatDuration(9.925)).toBe('9.9 hours');
    expect(formatDuration(47)).toBe('47.0 hours');
    expect(formatDuration(49)).toBe('2.0 days');
    expect(formatDuration(686.98 * 24)).toBe('687.0 days');
    expect(formatDuration(731 * 24)).toBe('2.0 years');
  });

  it('formatMass: three significant figures and a superscript power of ten', () => {
    expect(formatMass(5.9722e24)).toBe('5.97 × 10²⁴ kg');
    expect(formatMass(7.342e22)).toBe('7.34 × 10²² kg');
    expect(formatMass(1.0e26)).toBe('1.00 × 10²⁶ kg');
  });

  it('formatRatio: three significant figures, grouped', () => {
    expect(formatRatio(1)).toBe('1.00');
    expect(formatRatio(0.3829)).toBe('0.383');
    expect(formatRatio(11.209)).toBe('11.2');
    expect(formatRatio(109.2)).toBe('109');
    expect(formatRatio(332_946)).toBe('333,000');
    expect(formatRatio(0.0123)).toBe('0.0123');
  });
});

describe('liveDistance (AC-10)', () => {
  it('Earth: about 147.1 million km at perihelion (3 Jan 2026), 152.1 at aphelion (6 Jul 2026)', () => {
    const near = liveDistance('earth', dayOf(2026, 1, 3))!;
    const far = liveDistance('earth', dayOf(2026, 7, 6))!;
    expect(near).toMatch(/^Now: [\d.]+ million km from the Sun$/);
    expect(millions(near)).toBeCloseTo(147.1, 0);
    expect(Math.abs(millions(near) - 147.1)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(millions(far) - 152.1)).toBeLessThanOrEqual(0.1);
  });

  it('a moon: from its planet, in km, within its orbit’s range', () => {
    for (const day of [dayOf(2026, 1, 1), dayOf(2026, 1, 15), dayOf(2030, 6, 1)]) {
      const text = liveDistance('moon', day)!;
      expect(text).toMatch(/^Now: [\d,]+ km from Earth$/);
      const km = Number(/([\d,]+) km/.exec(text)![1]!.replace(/,/g, ''));
      expect(km).toBeGreaterThan(356_000);
      expect(km).toBeLessThan(407_000);
    }
  });

  it('the Sun has none', () => {
    expect(liveDistance('sun', 0)).toBeNull();
  });
});
