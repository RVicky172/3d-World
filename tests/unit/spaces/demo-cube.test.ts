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

  it('rotation depends only on elapsed time: identical clocks give identical scenes (AC-7)', async () => {
    const steps = [0, 0.016, 0.016, 0.5, 0.033, 0.2];
    const run = async () => {
      const instance = await createDemoCube(createFakeContext());
      const clock = new FakeClock();
      for (const s of steps) {
        const { delta, elapsed } = clock.step(s);
        instance.update(delta, elapsed);
      }
      return { rotation: findCube(instance).rotation.toArray(), elapsed: clock.step(0).elapsed };
    };

    const a = await run();
    const b = await run();

    expect(a.rotation).toEqual(b.rotation);
    expect(a.rotation[1]).toBeCloseTo(a.elapsed * DEMO_CUBE.rotationSpeed.y);
  });

  it('spins slower with reduced motion', async () => {
    const normal = await createDemoCube(createFakeContext());
    const reduced = await createDemoCube(createFakeContext({ reducedMotion: true }));
    normal.update(0.016, 1);
    reduced.update(0.016, 1);
    expect(Math.abs(findCube(reduced).rotation.y)).toBeLessThan(Math.abs(findCube(normal).rotation.y));
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
