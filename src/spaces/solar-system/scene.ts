import {
  AmbientLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  type Object3D,
} from 'three';
import { disposeObject3D } from '../../shared/dispose';
import { SOLAR_SYSTEM } from './data';
import { placeBodies } from './scale';
import type { BodyData, BodyLayout } from './types';

export interface SolarSystemScene {
  /** `system`: the Sun, its light, and one orbit group per planet. */
  root: Group;
  /** Moves each orbit group to its offset and scales each mesh to its radius: no new geometry (AC-8). */
  applyLayout(layout: Map<string, BodyLayout>): void;
  /** The body's mesh, by id. */
  mesh(id: string): Mesh;
  dispose(): void;
}

/** Segments of the shared sphere: smooth enough for a planet filling the screen (~2.3 k triangles each). */
const SEGMENTS = { width: 48, height: 24 };

/**
 * The scene graph (spec 020, plan: pivots for 021): `system` → Sun mesh + lights; for each planet an orbit
 * group (placed at the planet) holding the planet mesh and one orbit group per moon, each holding the moon
 * mesh. Moons hang off the planet's orbit group, not its scaled mesh, so they never inherit its size. Every body
 * is its own mesh, sharing one unit sphere: instancing would put real-scale positions (up to ~4 500 units) into
 * float32 instance matrices and jitter, while separate meshes get float64 model-view matrices from three.
 */
export function buildSystem(bodies: readonly BodyData[]): SolarSystemScene {
  const root = new Group();
  root.name = 'system';
  const geometry = new SphereGeometry(1, SEGMENTS.width, SEGMENTS.height);
  const meshes = new Map<string, Mesh>();
  const orbits = new Map<string, Group>();

  for (const body of bodies) {
    const material =
      body.kind === 'star'
        ? new MeshBasicMaterial({ color: body.colour }) // self-lit
        : new MeshStandardMaterial({ color: body.colour, roughness: 1, metalness: 0 });
    const mesh = new Mesh(geometry, material);
    mesh.name = body.id;
    meshes.set(body.id, mesh);
    if (!body.parent) {
      root.add(mesh);
      continue;
    }
    const orbit = new Group();
    orbit.name = `${body.id}-orbit`;
    orbit.add(mesh);
    orbits.set(body.id, orbit);
  }
  // Attach orbit groups once all exist, so data order doesn't matter.
  for (const body of bodies) {
    if (!body.parent) continue;
    const parentBody = bodies.find((b) => b.id === body.parent);
    if (!parentBody) throw new Error(`${body.id}: unknown parent ${body.parent}`);
    // A planet hangs off the system root (the Sun doesn't move); a moon off its planet's orbit group.
    const parent: Object3D = parentBody.parent ? orbits.get(parentBody.id)! : root;
    parent.add(orbits.get(body.id)!);
  }

  // The Sun lights everything: no fall-off (decay 0), or outer planets go black at real scale (AC-10).
  root.add(
    new PointLight(0xffffff, SOLAR_SYSTEM.light.sun, 0, 0),
    new AmbientLight(0xffffff, SOLAR_SYSTEM.light.ambient),
  );

  return {
    root,
    applyLayout(layout) {
      const offsets = placeBodies(bodies, layout);
      for (const body of bodies) {
        meshes.get(body.id)!.scale.setScalar(layout.get(body.id)!.radius);
        orbits.get(body.id)?.position.set(...offsets.get(body.id)!);
      }
      root.updateMatrixWorld(true);
    },
    mesh(id) {
      const mesh = meshes.get(id);
      if (!mesh) throw new Error(`no body ${id}`);
      return mesh;
    },
    dispose() {
      disposeObject3D(root); // the shared sphere once, every material
    },
  };
}
