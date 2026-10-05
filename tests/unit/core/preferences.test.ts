import { beforeEach, describe, expect, it } from 'vitest';
import { readPreference, writePreference } from '../../../src/core/preferences';
import { memoryStorage } from '../../helpers/fakes';

// Spec 012, AC-1 (D-020): the info panel's open/collapsed choice is remembered in localStorage. Storage can be
// missing, blocked or throwing (private mode), so preferences never throw and fall back instead.

const throwingStorage = (): Storage =>
  ({
    getItem: () => {
      throw new DOMException('denied', 'SecurityError');
    },
    setItem: () => {
      throw new DOMException('full', 'QuotaExceededError');
    },
  }) as unknown as Storage;

describe('preferences', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it('gives the fallback for a key never written', () => {
    expect(readPreference('world.infoPanel.open', true, storage)).toBe(true);
    expect(readPreference('world.theme', 'dark', storage)).toBe('dark');
  });

  it('reads back what was written, for booleans and strings', () => {
    writePreference('world.infoPanel.open', false, storage);
    writePreference('world.theme', 'light', storage);
    expect(readPreference('world.infoPanel.open', true, storage)).toBe(false);
    expect(readPreference('world.theme', 'dark', storage)).toBe('light');
  });

  it('falls back when the stored value is corrupt or of another type', () => {
    storage.setItem('world.infoPanel.open', '{not json');
    expect(readPreference('world.infoPanel.open', true, storage)).toBe(true);
    storage.setItem('world.infoPanel.open', JSON.stringify('yes'));
    expect(readPreference('world.infoPanel.open', true, storage)).toBe(true);
  });

  it('never throws when storage does: reads fall back, writes are dropped', () => {
    const broken = throwingStorage();
    expect(readPreference('world.infoPanel.open', true, broken)).toBe(true);
    expect(() => writePreference('world.infoPanel.open', false, broken)).not.toThrow();
  });

  it('uses window.localStorage by default', () => {
    window.localStorage.removeItem('world.test.default');
    writePreference('world.test.default', false);
    expect(window.localStorage.getItem('world.test.default')).toBe('false');
    expect(readPreference('world.test.default', true)).toBe(false);
    window.localStorage.removeItem('world.test.default');
  });
});
