import { describe, expect, it, vi } from 'vitest';
import { Light, Mesh, PerspectiveCamera, Texture, type MeshStandardMaterial } from 'three';
import { FakeClock } from '../../../src/core/clock';
import createDemoCube, { DEMO_CUBE } from '../../../src/spaces/demo-cube';
import type { SpaceInstance } from '../../../src/core/types';
import { createFakeContext } from '../../helpers/fakes';

const findCube = (instance: SpaceInstance) => {
  const cube = instance.scene.getObjectByName(DEMO_CUBE.name);
  if (!(cube instanceof Mesh)) throw new Error('demo-cube mesh not found');
  return cube as Mesh<never, MeshStandardMaterial>;
};

describe('demo-cube Space', () => {
  it('builds a scene with the cube and at least one light (AC-9)', async () => {
    const instance = await createDemoCube(createFakeContext());
    expect(findCube(instance)).toBeInstanceOf(Mesh);
    const lights: Light[] = [];
    instance.scene.traverse((o) => o instanceof Light && lights.push(o));
    expect(lights.length).toBeGreaterThan(0);
  });

  it('textures the cube so disposal of textures is exercised (AC-4)', async () => {
    const instance = await createDemoCube(createFakeContext());
    expect(findCube(instance).material.map).toBeInstanceOf(Texture);
  });

  it('uses a perspective camera that resize() keeps at the viewport aspect (AC-5)', async () => {
    const instance = await createDemoCube(createFakeContext());
    expect(instance.camera).toBeInstanceOf(PerspectiveCamera);

    instance.resize(1600, 800);

    expect((instance.camera as PerspectiveCamera).aspect).toBe(2);
  });

  it('holds the cube still: the camera moves instead (spec 004, D-009)', async () => {
    const instance = await createDemoCube(createFakeContext());
    for (let i = 0; i < 120; i++) instance.update(1 / 60, i / 60);
    expect(findCube(instance).rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('turntable: identical deltas give identical camera positions (001 AC-7, 004 AC-11)', async () => {
    const steps = [0.016, 0.016, 0.5, 0.033, 0.2];
    const run = async () => {
      const instance = await createDemoCube(createFakeContext());
      const clock = new FakeClock();
      clock.step(0);
      for (const s of steps) {
        const { delta, elapsed } = clock.step(s);
        instance.update(delta, elapsed);
      }
      const position = instance.camera.position.toArray();
      instance.dispose();
      return position;
    };

    const a = await run();
    expect(a).toEqual(await run());
    expect(a[0]).not.toBeCloseTo(0); // the turntable actually moved it
  });

  it('keeps the camera still with reduced motion (004 AC-7)', async () => {
    const instance = await createDemoCube(createFakeContext({ reducedMotion: true }));
    const start = instance.camera.position.clone();
    for (let i = 0; i < 600; i++) instance.update(1 / 60, i / 60);
    expect(instance.camera.position.distanceTo(start)).toBeCloseTo(0, 9);
  });

  it('opts in to camera controls: the 3D view is focusable with controls UI (004 AC-6)', async () => {
    const ctx = createFakeContext();
    const instance = await createDemoCube(ctx);
    expect(ctx.canvas.getAttribute('tabindex')).toBe('0');
    expect(ctx.canvas.getAttribute('aria-label')).toMatch(/Demo Cube/);
    expect(ctx.overlay.querySelector('button.controls-reset')).not.toBeNull();
    instance.dispose();
  });

  it('puts keyboard focus on its 3D view when opened from another view (004 AC-13)', async () => {
    const ctx = createFakeContext();
    const instance = await createDemoCube(ctx);
    expect(instance.focusTarget?.({ previousSpaceId: null })).toBe(ctx.canvas);
    instance.dispose();
  });

  it('dispose() removes the camera controls (004 AC-8)', async () => {
    const ctx = createFakeContext();
    const instance = await createDemoCube(ctx);
    instance.dispose();
    expect(ctx.canvas.hasAttribute('tabindex')).toBe(false);
    expect(ctx.overlay.children).toHaveLength(0);
  });

  it('dispose() frees the geometry, material and texture', async () => {
    const instance = await createDemoCube(createFakeContext());
    const cube = findCube(instance);
    const spies = [cube.geometry, cube.material, cube.material.map as Texture].map((r) =>
      vi.spyOn(r, 'dispose'),
    );

    instance.dispose();

    spies.forEach((s) => expect(s).toHaveBeenCalledOnce());
  });
});
