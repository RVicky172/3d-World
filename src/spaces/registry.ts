import type { SpaceMeta } from '../core/types';

/**
 * Every Space the site knows about. `load` is a dynamic import, so each Space is its own
 * chunk and costs nothing until opened (Constitution III). Adding a Space = one folder + one entry here.
 */
export const spaces: readonly SpaceMeta[] = [
  {
    id: 'solar-system',
    title: 'Solar System',
    description: 'The Sun, the eight planets and their largest moons, at a readable scale or true to scale.',
    kind: 'multi',
    load: () => import('./solar-system'),
  },
  {
    id: 'sheen-chair',
    title: 'Sheen Chair',
    description: 'A velvet lounge chair to turn, zoom and inspect from every angle, lit like a photo studio.',
    kind: 'single',
    load: () => import('./sheen-chair'),
  },
  {
    id: 'demo-cube',
    title: 'Demo Cube',
    description: 'A textured, spinning cube that proves the Space framework works end to end.',
    kind: 'single',
    load: () => import('./demo-cube'),
  },
];

export function findSpace(id: string, registry: readonly SpaceMeta[] = spaces): SpaceMeta | undefined {
  return registry.find((space) => space.id === id);
}
