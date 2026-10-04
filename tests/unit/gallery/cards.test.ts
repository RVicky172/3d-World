import { beforeEach, describe, expect, it } from 'vitest';
import { initialsOf, kindLabel, renderGallery, thumbnailUrl } from '../../../src/gallery/cards';
import type { SpaceFactory, SpaceMeta } from '../../../src/core/types';

const noLoad = async () => ({ default: (async () => ({})) as unknown as SpaceFactory });
const meta = (overrides: Partial<SpaceMeta> & Pick<SpaceMeta, 'id' | 'title'>): SpaceMeta => ({
  description: `About ${overrides.title}`,
  kind: 'single',
  load: noLoad,
  ...overrides,
});

/** A registry the app has never seen: proves the gallery is data-driven (AC-12). */
const testRegistry: SpaceMeta[] = [
  meta({ id: 'cube', title: 'Demo Cube' }),
  meta({ id: 'solar-system', title: 'Solar System', kind: 'multi', thumbnail: 'assets/solar/thumb.webp' }),
  meta({ id: 'broken', title: 'Broken Thumb', thumbnail: 'assets/missing.webp' }),
];

describe('helpers', () => {
  it.each([
    ['Demo Cube', 'DC'],
    ['Solar System', 'SS'],
    ['galaxy', 'GA'],
    ['  the   inner planets ', 'TI'],
    ['Earth–Moon system', 'ES'],
    ['', '?'],
  ])('initialsOf(%j) → %j', (title, initials) => {
    expect(initialsOf(title)).toBe(initials);
  });

  it('labels kinds', () => {
    expect(kindLabel('single')).toBe('Single object');
    expect(kindLabel('multi')).toBe('Multi-object');
  });

  it.each([
    ['/', 'assets/a.webp', '/assets/a.webp'],
    ['/3d-World/', 'assets/a.webp', '/3d-World/assets/a.webp'],
    ['/3d-World/', '/assets/a.webp', '/3d-World/assets/a.webp'],
    ['/3d-World', 'assets/a.webp', '/3d-World/assets/a.webp'],
  ])('thumbnailUrl(%j, %j) → %j (sub-path hosting)', (base, path, url) => {
    expect(thumbnailUrl(base, path)).toBe(url);
  });
});

describe('renderGallery', () => {
  let controller: AbortController;
  let root: HTMLElement;
  const cards = () => [...root.querySelectorAll<HTMLAnchorElement>('ul > li > a.card')];
  const card = (id: string) => {
    const found = cards().find((a) => a.getAttribute('href') === `#/space/${id}`);
    if (!found) throw new Error(`no card for ${id}`);
    return found;
  };

  beforeEach(() => {
    controller = new AbortController();
    root = renderGallery(testRegistry, { baseUrl: '/3d-World/', signal: controller.signal });
  });

  it('has a level-1 heading and a list with one card link per Space, in registry order (AC-1, AC-9)', () => {
    expect(root.querySelector('h1')?.textContent).toBe('3D World');
    expect(root.querySelectorAll('ul > li')).toHaveLength(3);
    expect(cards().map((a) => a.getAttribute('href'))).toEqual([
      '#/space/cube',
      '#/space/solar-system',
      '#/space/broken',
    ]);
  });

  it('shows title, description and kind on each card (AC-2)', () => {
    const solar = card('solar-system');
    expect(solar.querySelector('h2')?.textContent).toBe('Solar System');
    expect(solar.textContent).toContain('About Solar System');
    expect(solar.querySelector('.card-kind')?.textContent).toBe('Multi-object');
    expect(card('cube').querySelector('.card-kind')?.textContent).toBe('Single object');
  });

  it('encodes ids into card links', () => {
    const root2 = renderGallery([meta({ id: 'a b', title: 'Spaced' })], {
      baseUrl: '/',
      signal: controller.signal,
    });
    expect(root2.querySelector('a.card')?.getAttribute('href')).toBe('#/space/a%20b');
  });

  it('shows a lazy, decorative thumbnail image when the Space has one (AC-3)', () => {
    const img = card('solar-system').querySelector('.card-preview img');
    expect(img?.getAttribute('src')).toBe('/3d-World/assets/solar/thumb.webp');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('alt')).toBe('');
    expect(card('solar-system').querySelector('.card-placeholder')).toBeNull();
  });

  it('shows a placeholder with kind icon and initials when there is no thumbnail (AC-3)', () => {
    const preview = card('cube').querySelector('.card-preview');
    expect(preview?.querySelector('img')).toBeNull();
    const placeholder = preview?.querySelector('.card-placeholder');
    expect(placeholder?.getAttribute('data-kind')).toBe('single');
    expect(placeholder?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(placeholder?.textContent).toContain('DC');
  });

  it('falls back to the placeholder when the image fails to load (AC-3)', () => {
    const preview = card('broken').querySelector('.card-preview');
    preview?.querySelector('img')?.dispatchEvent(new Event('error'));
    expect(preview?.querySelector('img')).toBeNull();
    expect(preview?.querySelector('.card-placeholder')?.textContent).toContain('BT');
  });

  it('keeps the preview box in place either way (layout does not depend on the image)', () => {
    for (const a of cards()) expect(a.firstElementChild?.classList.contains('card-preview')).toBe(true);
  });

  it('stops listening for image errors once its signal aborts', () => {
    controller.abort();
    const img = card('broken').querySelector('.card-preview img');
    img?.dispatchEvent(new Event('error'));
    expect(card('broken').querySelector('.card-preview img')).toBe(img);
  });

  it('renders titles and descriptions as text, never HTML', () => {
    const root2 = renderGallery([meta({ id: 'x', title: '<img src=x onerror=alert(1)>' })], {
      baseUrl: '/',
      signal: controller.signal,
    });
    expect(root2.querySelector('h2 img')).toBeNull();
  });
});
