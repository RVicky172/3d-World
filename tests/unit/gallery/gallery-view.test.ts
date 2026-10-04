import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Points } from 'three';
import { createGalleryView } from '../../../src/gallery';
import type { SpaceFactory, SpaceMeta } from '../../../src/core/types';
import { createFakeContext } from '../../helpers/fakes';

const testRegistry: SpaceMeta[] = ['one', 'two'].map((id) => ({
  id,
  title: `Space ${id}`,
  description: id,
  kind: 'single',
  load: async () => ({ default: (async () => ({})) as unknown as SpaceFactory }),
}));

const findStarfield = (scene: { getObjectByName(name: string): unknown }) => {
  const stars = scene.getObjectByName('starfield');
  if (!(stars instanceof Points)) throw new Error('starfield missing');
  return stars;
};

describe('createGalleryView', () => {
  it('mounts the cards in the overlay and the starfield in the scene (AC-1, AC-13)', async () => {
    const ctx = createFakeContext();
    const view = await createGalleryView({ spaces: testRegistry, baseUrl: '/' })(ctx);

    expect(ctx.overlay.querySelectorAll('a.card')).toHaveLength(2);
    expect(findStarfield(view.scene)).toBeInstanceOf(Points);
  });

  it('builds cards from whatever registry it is given (AC-12)', async () => {
    const ctx = createFakeContext();
    await createGalleryView({ spaces: testRegistry.slice(0, 1), baseUrl: '/' })(ctx);
    expect(ctx.overlay.querySelectorAll('a.card')).toHaveLength(1);
  });

  it('drifts the starfield from update(), and holds it still with reduced motion', async () => {
    const moving = await createGalleryView({ spaces: testRegistry, baseUrl: '/' })(createFakeContext());
    const still = await createGalleryView({ spaces: testRegistry, baseUrl: '/' })(
      createFakeContext({ reducedMotion: true }),
    );
    moving.update(0.016, 30);
    still.update(0.016, 30);
    expect(findStarfield(moving.scene).rotation.y).not.toBe(0);
    expect(findStarfield(still.scene).rotation.y).toBe(0);
  });

  it('keeps its perspective camera at the viewport aspect', async () => {
    const view = await createGalleryView({ spaces: testRegistry, baseUrl: '/' })(createFakeContext());
    view.resize(1200, 600);
    expect((view.camera as PerspectiveCamera).aspect).toBe(2);
  });

  it('dispose() removes its DOM and frees the starfield (AC-6)', async () => {
    const ctx = createFakeContext();
    const other = document.createElement('div');
    ctx.overlay.append(other);
    const view = await createGalleryView({ spaces: testRegistry, baseUrl: '/' })(ctx);
    const stars = findStarfield(view.scene);
    const spies = [
      vi.spyOn(stars.geometry, 'dispose'),
      vi.spyOn(stars.material as { dispose(): void }, 'dispose'),
    ];

    view.dispose();

    expect(ctx.overlay.querySelector('.gallery')).toBeNull();
    expect(ctx.overlay.contains(other)).toBe(true);
    spies.forEach((s) => expect(s).toHaveBeenCalledOnce());
  });
});
