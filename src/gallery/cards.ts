import { formatRoute } from '../core/routes';
import type { SpaceMeta } from '../core/types';

const SITE_HEADING = '3D World';
const SVG_NS = 'http://www.w3.org/2000/svg';

export function kindLabel(kind: SpaceMeta['kind']): string {
  return kind === 'multi' ? 'Multi-object' : 'Single object';
}

/** "Demo Cube" → "DC"; one word → its first two letters; nothing → "?". */
export function initialsOf(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const [first, second] = words;
  if (!first) return '?';
  const initials = second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2);
  return initials.toUpperCase();
}

/** Joins a `public/` path onto Vite's base, so thumbnails work under a sub-path (e.g. /3d-World/). */
export function thumbnailUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return base + path.replace(/^\/+/, '');
}

/**
 * The gallery's DOM (spec 003): a heading and one card link per Space, built from registry
 * metadata only. Cards are real links, so click, tap, Enter and history all work natively.
 */
export function renderGallery(
  spaces: readonly SpaceMeta[],
  options: { baseUrl: string; signal: AbortSignal },
): HTMLElement {
  const root = document.createElement('section');
  root.className = 'gallery';

  const heading = document.createElement('h1');
  heading.textContent = SITE_HEADING;
  heading.tabIndex = -1; // focus fallback when returning from a Space (spec 004, AC-13)
  const list = document.createElement('ul');
  list.className = 'gallery-grid';

  for (const space of spaces) {
    const item = document.createElement('li');
    item.append(createCard(space, options));
    list.append(item);
  }

  root.append(heading, list);
  return root;
}

function createCard(space: SpaceMeta, { baseUrl, signal }: { baseUrl: string; signal: AbortSignal }) {
  const card = document.createElement('a');
  card.className = 'card';
  card.href = formatRoute({ name: 'space', id: space.id });

  const preview = document.createElement('div');
  preview.className = 'card-preview';
  if (space.thumbnail) {
    const img = document.createElement('img');
    img.src = thumbnailUrl(baseUrl, space.thumbnail);
    img.setAttribute('loading', 'lazy'); // attribute, not property: jsdom lacks HTMLImageElement.loading
    img.alt = ''; // decorative: the card's title already names it
    img.addEventListener('error', () => img.replaceWith(createPlaceholder(space)), { once: true, signal });
    preview.append(img);
  } else {
    preview.append(createPlaceholder(space));
  }

  const title = document.createElement('h2');
  title.textContent = space.title;
  const description = document.createElement('p');
  description.textContent = space.description;
  const kind = document.createElement('span');
  kind.className = 'card-kind';
  kind.textContent = kindLabel(space.kind);

  card.append(preview, title, description, kind);
  return card;
}

/** Generated preview: an icon for the Space's kind plus its initials. No asset files. */
function createPlaceholder(space: SpaceMeta): HTMLElement {
  const placeholder = document.createElement('div');
  placeholder.className = 'card-placeholder';
  placeholder.dataset.kind = space.kind;

  const initials = document.createElement('span');
  initials.className = 'card-initials';
  initials.textContent = initialsOf(space.title);

  placeholder.append(kindIcon(space.kind), initials);
  return placeholder;
}

function kindIcon(kind: SpaceMeta['kind']): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'card-icon');
  const add = (tag: string, attrs: Record<string, string>) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    svg.append(el);
  };
  if (kind === 'multi') {
    // A body with an orbit and a moon.
    add('circle', { cx: '24', cy: '24', r: '6' });
    add('ellipse', { cx: '24', cy: '24', rx: '19', ry: '9', fill: 'none' });
    add('circle', { cx: '41', cy: '20', r: '3' });
  } else {
    // An isometric cube.
    add('path', { d: 'M24 6 40 15v18L24 42 8 33V15Z', fill: 'none' });
    add('path', { d: 'M8 15l16 9 16-9M24 24v18', fill: 'none' });
  }
  return svg;
}
