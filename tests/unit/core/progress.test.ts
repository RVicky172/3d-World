import { describe, expect, it } from 'vitest';
import { announcementFor, clampProgress } from '../../../src/core/progress';

// Spec 011: download progress never moves backwards (AC-11) and is announced only at 25/50/75 % (AC-9).

describe('clampProgress', () => {
  it.each<[number | null, number | null, number | null]>([
    // Advances.
    [null, 0, 0],
    [null, 0.4, 0.4],
    [0.2, 0.6, 0.6],
    [0.6, 1, 1],
    // Never goes backwards.
    [0.6, 0.3, 0.6],
    [1, 0.9, 1],
    // Kept within [0, 1].
    [null, -0.5, 0],
    [null, 1.7, 1],
    [0.4, 3, 1],
    // Unknown totals: null stays null until a value arrives; a later null keeps what was shown.
    [null, null, null],
    [0.5, null, 0.5],
    // Garbage in (e.g. 0/0 from a zero-length total) changes nothing.
    [null, Number.NaN, null],
    [0.3, Number.NaN, 0.3],
    [0.3, Number.POSITIVE_INFINITY, 0.3],
  ])('clampProgress(%s, %s) is %s', (previous, next, expected) => {
    expect(clampProgress(previous, next)).toBe(expected);
  });
});

describe('announcementFor', () => {
  it.each<[number | null, number | null, 25 | 50 | 75 | null]>([
    // Crossing a step announces it.
    [0.2, 0.3, 25],
    [0.25, 0.5, 50],
    [0.7, 0.75, 75],
    // Landing exactly on a step counts; starting on it does not repeat it.
    [0.1, 0.25, 25],
    [0.25, 0.3, null],
    // Only the highest step crossed is spoken.
    [0.3, 0.8, 75],
    [0, 1, 75],
    // Nothing crossed.
    [0, 0.2, null],
    [0.8, 1, null],
    [0.5, 0.5, null],
    // Backwards never announces.
    [0.6, 0.3, null],
    // No progress yet counts as 0, so a first value past a step is still spoken.
    [null, 0.3, 25],
    [null, 0.1, null],
    // Unknown totals announce nothing.
    [0.3, null, null],
    [null, null, null],
  ])('announcementFor(%s, %s) is %s', (previous, next, expected) => {
    expect(announcementFor(previous, next)).toBe(expected);
  });
});
