import { describe, expect, it, vi } from 'vitest';
import {
  AmbientLight,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { BODIES, SOLAR_SYSTEM } from '../../../../src/spaces/solar-system/data';
import { layout, worldPositions } from '../../../../src/spaces/solar-system/scale';
import { buildSystem } from '../../../../src/spaces/solar-system/scene';

// Spec 020: the scene graph 021 will animate (plan: pivots), lit by the Sun (AC-10). A scale switch moves
// groups and rescales meshes, never rebuilding geometry (AC-8, NFR).

const meshesOf = (root: Group) => {
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof Mesh) meshes.push(o);
  });
  return meshes;
};
const byName = (root: Group, name: string) => {
  const found = root.getObjectByName(name);
  if (!found) throw new Error(`no ${name}`);
  return found;
};

describe('buildSystem (no rendering)', () => {
  it('makes system → Sun; orbit group → planet mesh + moon groups → moon meshes', () => {
    const { root } = buildSystem(BODIES);
    expect(root.name).toBe('system');
    expect(byName(root, 'sun').parent).toBe(root);
    for (const body of BODIES.filter((b) => b.kind === 'planet')) {
      const orbit = byName(root, `${body.id}-orbit`);
      expect(orbit.parent, body.id).toBe(root);
      expect(byName(root, body.id).parent, body.id).toBe(orbit);
    }
    for (const moon of BODIES.filter((b) => b.kind === 'moon')) {
      const orbit = byName(root, `${moon.id}-orbit`);
      // Under the planet's orbit group, not its scaled mesh, so a moon never inherits the planet's size.
      expect(orbit.parent, moon.id).toBe(byName(root, `${moon.parent}-orbit`));
      expect(byName(root, moon.id).parent, moon.id).toBe(orbit);
    }
  });

  it('rejects a body whose parent is unknown', () => {
    const orphan = { ...BODIES.find((b) => b.id === 'moon')!, id: 'orphan', parent: 'vulcan' };
    expect(() => buildSystem([...BODIES, orphan])).toThrow(/vulcan/);
  });

  it('draws 16 bodies with one shared sphere geometry', () => {
    const meshes = meshesOf(buildSystem(BODIES).root);
    expect(meshes.map((m) => m.name).sort()).toEqual(BODIES.map((b) => b.id).sort());
    expect(new Set(meshes.map((m) => m.geometry)).size).toBe(1);
  });

  it('lights the bodies from the Sun: a self-lit Sun, a decay-free point light at its centre, faint ambient (AC-10)', () => {
    const { root } = buildSystem(BODIES);
    const sun = byName(root, 'sun') as Mesh;
    expect(sun.material).toBeInstanceOf(MeshBasicMaterial);
    const light = root.children.find((c): c is PointLight => c instanceof PointLight);
    expect(light?.position.toArray()).toEqual([0, 0, 0]);
    expect(light?.decay).toBe(0); // outer planets aren't left in the dark at real scale
    expect(light?.distance).toBe(0);
    expect(light?.intensity).toBe(SOLAR_SYSTEM.light.sun);
    const ambient = root.children.find((c): c is AmbientLight => c instanceof AmbientLight);
    expect(ambient?.intensity).toBe(SOLAR_SYSTEM.light.ambient);
  });

  it('gives planets and moons a matte material in their data colour', () => {
    const { root } = buildSystem(BODIES);
    for (const body of BODIES.filter((b) => b.kind !== 'star')) {
      const material = (byName(root, body.id) as Mesh).material as MeshStandardMaterial;
      expect(material, body.id).toBeInstanceOf(MeshStandardMaterial);
      expect(material.color.getHex(), body.id).toBe(new Color(body.colour).getHex());
      expect(material.roughness).toBe(1);
      expect(material.metalness).toBe(0);
    }
  });
});

describe('applyLayout (AC-8)', () => {
  for (const mode of ['stylised', 'real'] as const) {
    it(`${mode}: puts each body at its world position and draws it at its radius`, () => {
      const system = buildSystem(BODIES);
      const target = layout(BODIES, mode);
      system.applyLayout(target);
      const expected = worldPositions(BODIES, target);
      for (const body of BODIES) {
        const mesh = byName(system.root, body.id);
        const world = mesh.getWorldPosition(new Vector3()).toArray();
        world.forEach((c, i) => expect(c, `${body.id}[${i}]`).toBeCloseTo(expected.get(body.id)![i]!, 6));
        // World scale = its own radius: moons don't inherit their planet's scale.
        expect(mesh.getWorldScale(new Vector3()).x, body.id).toBeCloseTo(target.get(body.id)!.radius, 9);
      }
    });
  }

  it('switching scale moves and rescales only: no new geometry or material', () => {
    const system = buildSystem(BODIES);
    system.applyLayout(layout(BODIES, 'stylised'));
    const before = meshesOf(system.root).map((m) => [m.geometry, m.material]);
    const earthBefore = byName(system.root, 'earth').getWorldPosition(new Vector3());
    system.applyLayout(layout(BODIES, 'real'));
    expect(meshesOf(system.root).map((m) => [m.geometry, m.material])).toEqual(before);
    expect(
      byName(system.root, 'earth').getWorldPosition(new Vector3()).distanceTo(earthBefore),
    ).toBeGreaterThan(1);
  });
});

describe('dispose (AC-12)', () => {
  it('frees the shared geometry once and every material', () => {
    const system = buildSystem(BODIES);
    const meshes = meshesOf(system.root);
    const geometry = meshes[0]!.geometry as BufferGeometry;
    const geometrySpy = vi.spyOn(geometry, 'dispose');
    const materialSpies = meshes.map((m) => vi.spyOn(m.material as Material, 'dispose'));
    system.dispose();
    expect(geometrySpy).toHaveBeenCalledTimes(1);
    materialSpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  });
});
