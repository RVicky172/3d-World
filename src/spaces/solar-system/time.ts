/**
 * The simulated clock (spec 021, D-025). Time is `days` since J2000 (2000-01-01 12:00, treated as UTC: TDB is
 * about a minute ahead, far below anything shown). It moves only by the frame delta (Constitution VI), stays
 * within 1800–2050 (the orbital elements' validity), and is never read from the wall clock here: the start time
 * comes from the core. Pure.
 */

/** Days of simulated time per real second (Q2). A month is a twelfth of a Julian year. */
export const SPEEDS = { day: 1, week: 7, month: 30.436875, year: 365.25 } as const;
export type Speed = keyof typeof SPEEDS;

export interface SimTime {
  days: number;
  speed: Speed;
  backwards: boolean;
  playing: boolean;
}

const DAY_MS = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const daysFromEpochMs = (ms: number): number => (ms - J2000_MS) / DAY_MS;
export const epochMsFromDays = (days: number): number => J2000_MS + days * DAY_MS;

/** The simulated range (Q7): 1800-01-01 to 2050-12-31, 00:00 UTC. */
export const RANGE = {
  start: daysFromEpochMs(Date.UTC(1800, 0, 1)),
  end: daysFromEpochMs(Date.UTC(2050, 11, 31)),
} as const;

const clamp = (days: number) => Math.min(RANGE.end, Math.max(RANGE.start, days));

/** A new visit (Q1, Q8): the given wall-clock time, 1 week per second forwards, paused under reduced motion. */
export function initialTime(startTimeMs: number, reducedMotion: boolean): SimTime {
  return {
    days: clamp(daysFromEpochMs(startTimeMs)),
    speed: 'week',
    backwards: false,
    playing: !reducedMotion,
  };
}

/**
 * Advances by `deltaSeconds` of real time while playing. At a range limit time stops there, pauses, and reports
 * which limit it reached, once (AC-8).
 */
export function advance(t: SimTime, deltaSeconds: number): { time: SimTime; limit: 'start' | 'end' | null } {
  if (!t.playing) return { time: t, limit: null };
  const next = t.days + SPEEDS[t.speed] * (t.backwards ? -1 : 1) * deltaSeconds;
  if (next >= RANGE.end) return { time: { ...t, days: RANGE.end, playing: false }, limit: 'end' };
  if (next <= RANGE.start) return { time: { ...t, days: RANGE.start, playing: false }, limit: 'start' };
  return { time: { ...t, days: next }, limit: null };
}

/** "12 Mar 2031", in UTC so it reads the same on every machine (no locale formatting). */
export function formatDate(days: number): string {
  const date = new Date(epochMsFromDays(days));
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "2031-03-12": for `<time datetime>`. */
export function isoDate(days: number): string {
  return new Date(epochMsFromDays(days)).toISOString().slice(0, 10);
}
