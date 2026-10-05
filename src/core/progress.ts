/** Fractions at which progress is spoken to screen readers (spec 011, AC-9). */
const ANNOUNCED_STEPS = [0.75, 0.5, 0.25] as const;

/**
 * The progress to show next: `next` clamped to [0, 1], never below `previous` (spec 011, AC-11).
 * null means "total unknown": it stays null until a value arrives, and a later null keeps the shown value.
 * Non-finite input (e.g. 0/0 from a zero-length response) changes nothing.
 */
export function clampProgress(previous: number | null, next: number | null): number | null {
  if (next === null || !Number.isFinite(next)) return previous;
  const clamped = Math.min(1, Math.max(0, next));
  return previous === null ? clamped : Math.max(previous, clamped);
}

/**
 * The step (25, 50 or 75 %) to announce when progress moves from `previous` to `next`, or null.
 * Only the highest step crossed is announced, so a jump from 30 % to 80 % says "75 %" once. No progress
 * yet counts as 0; an unknown total (`next` null) announces nothing.
 */
export function announcementFor(previous: number | null, next: number | null): 25 | 50 | 75 | null {
  if (next === null) return null;
  const from = previous ?? 0;
  const step = ANNOUNCED_STEPS.find((s) => from < s && next >= s);
  return step === undefined ? null : ((step * 100) as 25 | 50 | 75);
}
