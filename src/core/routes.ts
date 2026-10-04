/**
 * URL-hash routes (spec 002). Pure: no DOM access, never throws.
 *
 *   "" | "#" | "#/"          → home
 *   "#/space/<id>[/]"        → space (id percent-decoded; malformed encoding keeps the raw id)
 *   anything else            → unknown (the router redirects it home)
 */
export type HomeRoute = { name: 'home' };
export type SpaceRoute = { name: 'space'; id: string };
/** Routes that have an address of their own (everything but 'unknown'). */
export type NavigableRoute = HomeRoute | SpaceRoute;
export type Route = NavigableRoute | { name: 'unknown' };

export const HOME_ROUTE: HomeRoute = { name: 'home' };
const UNKNOWN_ROUTE: Route = { name: 'unknown' };

export function parseHash(hash: string): Route {
  let path = hash.startsWith('#') ? hash.slice(1) : hash;
  if (path === '' || path === '/') return HOME_ROUTE;
  if (!path.startsWith('/')) return UNKNOWN_ROUTE;
  if (path.endsWith('/')) path = path.slice(0, -1);

  const segments = path.slice(1).split('/');
  if (segments.length === 2 && segments[0] === 'space' && segments[1]) {
    return { name: 'space', id: safeDecode(segments[1]) };
  }
  return UNKNOWN_ROUTE;
}

export function formatRoute(route: NavigableRoute): string {
  return route.name === 'home' ? '#/' : `#/space/${encodeURIComponent(route.id)}`;
}

/** Malformed encoding (e.g. "%E0%A4%A") keeps the raw text, which then shows "Space not found". */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
