import { describe, expect, it } from 'vitest';
import { formatRoute, HOME_ROUTE, parseHash, type Route, type SpaceRoute } from '../../../src/core/routes';

const space = (id: string): SpaceRoute => ({ name: 'space', id });
const UNKNOWN: Route = { name: 'unknown' };

describe('parseHash', () => {
  it.each<[string, Route]>([
    // Home (AC-5)
    ['', HOME_ROUTE],
    ['#', HOME_ROUTE],
    ['#/', HOME_ROUTE],
    // Spaces (AC-1); trailing slash ignored (AC-7)
    ['#/space/demo-cube', space('demo-cube')],
    ['#/space/demo-cube/', space('demo-cube')],
    // Percent-encoded ids are decoded (AC-7)
    ['#/space/demo%2Dcube', space('demo-cube')],
    ['#/space/caf%C3%A9', space('café')],
    // Malformed encoding → raw id → "Space not found", not a throw (AC-7)
    ['#/space/%E0%A4%A', space('%E0%A4%A')],
    ['#/space/%', space('%')],
    // Ids are case-sensitive: no normalisation
    ['#/space/Demo-Cube', space('Demo-Cube')],
    // Unknown routes → redirect home (AC-6)
    ['#/foo', UNKNOWN],
    ['#/space', UNKNOWN],
    ['#/space/', UNKNOWN],
    ['#/space/a/b', UNKNOWN],
    ['#//space/x', UNKNOWN],
    ['#space/x', UNKNOWN],
    ['#/SPACE/x', UNKNOWN],
  ])('%j → %j', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });

  it('accepts a hash without the leading "#" (as in URL fragments)', () => {
    expect(parseHash('/space/demo-cube')).toEqual(space('demo-cube'));
  });

  it.each([
    '%',
    '#%',
    '#/%',
    '#/space/%%%',
    '#/space/\u0000',
    `#/space/${'%'.repeat(10_000)}`,
    `#/${'a/'.repeat(10_000)}`,
    '#/space/<script>alert(1)</script>',
    '#/__proto__',
    '#/space/__proto__',
  ])('never throws on hostile input %#', (hash) => {
    expect(() => parseHash(hash)).not.toThrow();
  });
});

describe('formatRoute', () => {
  it('formats home as "#/"', () => {
    expect(formatRoute(HOME_ROUTE)).toBe('#/');
  });

  it('formats a Space route', () => {
    expect(formatRoute(space('demo-cube'))).toBe('#/space/demo-cube');
  });

  it.each(['demo-cube', 'a b', 'café', '100%', 'x/y', '#hash', '?q=1'])(
    'round-trips id %j through parseHash',
    (id) => {
      expect(parseHash(formatRoute(space(id)))).toEqual(space(id));
    },
  );

  it('round-trips home', () => {
    expect(parseHash(formatRoute(HOME_ROUTE))).toEqual(HOME_ROUTE);
  });
});
