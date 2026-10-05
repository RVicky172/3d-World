import { describe, expect, it } from 'vitest';
import {
  advance,
  daysFromEpochMs,
  epochMsFromDays,
  formatDate,
  initialTime,
  isoDate,
  RANGE,
  SPEEDS,
  type SimTime,
} from '../../../../src/spaces/solar-system/time';

// Spec 021, AC-5/AC-6/AC-8 (D-025): a simulated clock in days since J2000, advanced only by the frame delta,
// clamped to 1800–2050, with four speeds forwards or backwards.

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const at = (iso: string) => daysFromEpochMs(Date.parse(iso));
const playing = (overrides: Partial<SimTime> = {}): SimTime => ({
  days: 0,
  speed: 'week',
  backwards: false,
  playing: true,
  ...overrides,
});

describe('dates', () => {
  it('counts days from J2000 (2000-01-01 12:00 UTC), both ways', () => {
    expect(daysFromEpochMs(J2000_MS)).toBe(0);
    expect(daysFromEpochMs(J2000_MS + 86_400_000)).toBe(1);
    expect(epochMsFromDays(-0.5)).toBe(Date.UTC(2000, 0, 1));
  });

  it('formats the shown date in UTC, the same on every machine', () => {
    expect(formatDate(at('2031-03-12T23:59:00Z'))).toBe('12 Mar 2031');
    expect(formatDate(at('1800-01-01T00:00:00Z'))).toBe('1 Jan 1800');
    expect(isoDate(at('2031-03-12T23:59:00Z'))).toBe('2031-03-12');
  });

  it('spans 1800-01-01 to 2050-12-31 (Q7)', () => {
    expect(RANGE.start).toBe(at('1800-01-01T00:00:00Z'));
    expect(RANGE.end).toBe(at('2050-12-31T00:00:00Z'));
  });
});

describe('initialTime (Q1, Q8, AC-9)', () => {
  it('starts at the given wall-clock time, 1 week per second forwards, playing', () => {
    const t = initialTime(Date.UTC(2026, 9, 5), false);
    expect(isoDate(t.days)).toBe('2026-10-05');
    expect(t).toMatchObject({ speed: 'week', backwards: false, playing: true });
  });

  it('starts paused with reduced motion', () => {
    expect(initialTime(Date.UTC(2026, 9, 5), true).playing).toBe(false);
  });

  it('clamps a wall clock outside the range', () => {
    expect(initialTime(Date.UTC(2100, 0, 1), false).days).toBe(RANGE.end);
  });
});

describe('advance (AC-5, AC-6, AC-8)', () => {
  it('moves by speed × delta while playing, in days per second', () => {
    expect(SPEEDS).toEqual({ day: 1, week: 7, month: 30.436875, year: 365.25 });
    expect(advance(playing({ speed: 'week' }), 0.5).time.days).toBeCloseTo(3.5, 12);
    expect(advance(playing({ speed: 'year' }), 2).time.days).toBeCloseTo(730.5, 12);
  });

  it('runs backwards when asked', () => {
    expect(advance(playing({ speed: 'day', backwards: true }), 3).time.days).toBeCloseTo(-3, 12);
  });

  it('holds still while paused', () => {
    const t = playing({ playing: false, days: 42 });
    expect(advance(t, 10)).toEqual({ time: t, limit: null });
  });

  it('pauses at the end of the range and reports it once', () => {
    const near = playing({ speed: 'year', days: RANGE.end - 10 });
    const first = advance(near, 1);
    expect(first.time.days).toBe(RANGE.end);
    expect(first.time.playing).toBe(false);
    expect(first.limit).toBe('end');
    expect(advance(first.time, 1).limit).toBeNull(); // paused now: nothing more to report
  });

  it('pauses at the start of the range when running backwards', () => {
    const result = advance(playing({ speed: 'month', backwards: true, days: RANGE.start + 5 }), 1);
    expect(result.time.days).toBe(RANGE.start);
    expect(result.limit).toBe('start');
  });

  it('reaches the same day by different frame sequences (AC-5)', () => {
    let a = playing();
    for (let i = 0; i < 60; i++) a = advance(a, 1 / 60).time;
    let b = playing();
    for (const delta of [0.25, 0.5, 0.125, 0.125]) b = advance(b, delta).time;
    expect(a.days).toBeCloseTo(b.days, 9);
  });
});
