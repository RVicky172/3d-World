import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineLoop, type Object3D } from 'three';
import { REAL_UNIT_KM } from './data';
import { moonPosition, planetPosition, toScene, type Vector3Like } from './orbit';
import type { BodyData, BodyLayout, ScaleMode } from './types';

export interface OrbitLines {
  /** Shows one prebuilt set and hides the other: no new geometry on a switch (020 NFR). */
  setMode(mode: ScaleMode): void;
  /** Refreshes any real ellipse whose elements have drifted since it was built (D-027), in place. */
  update(days: number): void;
  /** A body's line at a scale (tests and E2E). */
  line(id: string, mode: ScaleMode): LineLoop;
  dispose(): void;
}

/** Points per orbit: smooth at any zoom the controls allow (the chord sags < 0.01 % of the radius). */
const POINTS = 256;
const DAYS_PER_YEAR = 365.25;
/** A planet's elements drift slowly: ten years moves its ellipse by well under a pixel (plan §5). */
const PLANET_REFRESH_DAYS = 10 * DAYS_PER_YEAR;
/** A moon's ellipse is rebuilt after 1 % of its fastest precession (the Moon's apsis: ~22 days), D-027. */
const MOON_REFRESH_SHARE = 0.01;

/**
 * Faint orbit paths for every planet and moon at both scales (spec 021, AC-11, Q5): the true ellipse at real
 * scale (from the elements on the date it was built) and the 020 ring at stylised scale. Planet lines hang off
 * `root` (the system), moon lines off their planet's orbit group, so they move with it. Lines never catch pointer
 * events.
 */
export function createOrbitLines(
  root: Object3D,
  bodies: readonly BodyData[],
  stylised: Map<string, BodyLayout>,
  days: number,
): OrbitLines {
  const material = new LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const point: Vector3Like = { x: 0, y: 0, z: 0 };
  const lines = new Map<string, Record<ScaleMode, LineLoop>>();
  const builtAt = new Map<string, number>();

  const makeLine = (holder: Object3D, name: string) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(POINTS * 3), 3));
    const line = new LineLoop(geometry, material);
    line.name = name;
    line.raycast = () => {}; // never a pointer target
    holder.add(line);
    return line;
  };

  const traceReal = (body: BodyData, on: number) => {
    const line = lines.get(body.id)!.real;
    const attr = line.geometry.getAttribute('position') as BufferAttribute;
    const planet = body.kind === 'moon' ? byId.get(body.parent!)! : null;
    for (let i = 0; i < POINTS; i++) {
      const M = (2 * Math.PI * i) / POINTS;
      if (planet) moonPosition(body, planet, on, point, M);
      else planetPosition(body, on, point, M);
      toScene(point);
      attr.setXYZ(i, point.x / REAL_UNIT_KM, point.y / REAL_UNIT_KM, point.z / REAL_UNIT_KM);
    }
    attr.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    builtAt.set(body.id, on);
  };

  const refreshAfter = (body: BodyData) => {
    if (body.kind !== 'moon') return PLANET_REFRESH_DAYS;
    const periods = [body.orbit!.apsisPeriodYears, body.orbit!.nodePeriodYears].filter(
      (p): p is number => !!p,
    );
    return Math.min(PLANET_REFRESH_DAYS, ...periods.map((p) => p * DAYS_PER_YEAR * MOON_REFRESH_SHARE));
  };

  for (const body of bodies) {
    if (!body.parent) continue;
    const holder = body.kind === 'moon' ? root.getObjectByName(`${body.parent}-orbit`) : root;
    if (!holder) throw new Error(`${body.id}: no orbit group for ${body.parent}`);
    const real = makeLine(holder, `${body.id}-path-real`);
    const ring = makeLine(holder, `${body.id}-path-stylised`);
    lines.set(body.id, { real, stylised: ring });
    traceReal(body, days);
    const attr = ring.geometry.getAttribute('position') as BufferAttribute;
    const radius = stylised.get(body.id)!.distance;
    for (let i = 0; i < POINTS; i++) {
      const angle = (2 * Math.PI * i) / POINTS;
      attr.setXYZ(i, radius * Math.cos(angle), 0, -radius * Math.sin(angle));
    }
    ring.geometry.computeBoundingSphere();
  }
  const refresh = new Map([...lines.keys()].map((id) => [id, refreshAfter(byId.get(id)!)]));

  return {
    setMode(mode) {
      for (const pair of lines.values()) {
        pair.real.visible = mode === 'real';
        pair.stylised.visible = mode === 'stylised';
      }
    },
    update(on) {
      for (const [id, every] of refresh) {
        if (Math.abs(on - builtAt.get(id)!) > every) traceReal(byId.get(id)!, on);
      }
    },
    line(id, mode) {
      const pair = lines.get(id);
      if (!pair) throw new Error(`no orbit line for ${id}`);
      return pair[mode];
    },
    dispose() {
      for (const pair of lines.values()) {
        for (const line of [pair.real, pair.stylised]) {
          line.removeFromParent();
          line.geometry.dispose();
        }
      }
      material.dispose();
      lines.clear();
    },
  };
}
