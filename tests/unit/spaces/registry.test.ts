import { describe, expect, it } from 'vitest';
import { findSpace, spaces } from '../../../src/spaces/registry';

const URL_SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('space registry', () => {
  it('has at least the demo-cube Space (AC-9)', () => {
    expect(spaces.map((s) => s.id)).toContain('demo-cube');
  });

  it('uses unique ids', () => {
    const ids = spaces.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(spaces.map((s) => [s.id, s] as const))(
    '%s has a URL-safe id and readable metadata',
    (_id, space) => {
      expect(space.id).toMatch(URL_SAFE_ID);
      expect(space.title.trim()).not.toBe('');
      expect(space.description.trim()).not.toBe('');
      expect(['single', 'multi']).toContain(space.kind);
    },
  );

  it.each(spaces.map((s) => [s.id, s] as const))(
    '%s lazy-loads a module whose default export is a factory',
    async (_id, space) => {
      const module = await space.load();
      expect(typeof module.default).toBe('function');
    },
  );

  it('findSpace() returns the entry for a known id and undefined otherwise', () => {
    expect(findSpace('demo-cube')?.id).toBe('demo-cube');
    expect(findSpace('nope')).toBeUndefined();
  });

  it('findSpace() does not match inherited object keys', () => {
    expect(findSpace('constructor')).toBeUndefined();
    expect(findSpace('__proto__')).toBeUndefined();
  });
});
