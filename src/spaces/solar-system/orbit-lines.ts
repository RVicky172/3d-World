import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineLoop, type Object3D } from 'three';
import { REAL_UNIT_KM } from './data';
import { moonPosition, planetPosition, toScene, type Vector3Like } from './orbit';
import type { BodyData, BodyLayout, ScaleMode } from './types';

export interface OrbitLines {
  /** Shows one prebuilt set and hides the other: no new geometry on a switch (020 NFR). */
  setMode(mode: ScaleMode): void;
  /**
   * Rebuilds, in place, any real ellipse whose body has strayed more than a quarter of its radius from it as the
   * elements drift (D-038; replaces D-027's fixed intervals). Cheap when nothing moved.
   */
  update(days: number): void;
  /**
   * Per frame, after the camera moves: each planet draws its fine real line only when its far copy's worst chord
   * sag would show as half a CSS px or more from `eye` (world units); otherwise the far copy (D-040).
   * `pixelAngle` is radians per CSS px at the view's centre.
   */
  setView(eye: Vector3Like, pixelAngle: number): void;
  /** A body's line at a scale (tests and E2E); for a planet's real line, the fine one. */
  line(id: string, mode: ScaleMode): LineLoop;
  /** A planet's 256-point far copy of its real line, or null for a moon (tests). */
  coarse(id: string): LineLoop | null;
  dispose(): void;
}

/** Points per orbit: a moon's orbit or a stylised ring is smooth with this many. */
const POINTS = 256;
/**
 * A planet's real ellipse needs more (spec 023, D-037): its straight segments must stay inside its own disc in a
 * close-up. At 256 they sagged up to 8 planet radii (Uranus); at 4 096 under 1/8 of a radius (2 048 left Uranus at
 * 0.15), half the rebuild threshold, so a fresh line never needs rebuilding (D-038).
 */
const PLANET_REAL_POINTS = 4096;
/** Fine vertices per far-copy vertex: the far copy has POINTS of them, the same dates and anomalies (D-040). */
const STRIDE = PLANET_REAL_POINTS / POINTS;
/** The far copy is drawn while its worst sag would move the line less than this, in CSS px (D-040). */
const SAG_PX = 0.5;
/** A real line is rebuilt once its body is this far from it, in the body's radii (D-038): still inside its disc. */
const STRAY = 0.25;

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
  /** Planets' far copies, with the worst distance (scene units) from a fine vertex to the copy's chord. */
  const far = new Map<string, { line: LineLoop; sag: number; near: boolean }>();
  let mode: ScaleMode = 'stylised';

  const makeLine = (holder: Object3D, name: string, points: number) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(points * 3), 3));
    const line = new LineLoop(geometry, material);
    line.name = name;
    line.raycast = () => {}; // never a pointer target
    holder.add(line);
    return line;
  };

  /** Squared distance from (px, py, pz) to segment i → j of a position array. */
  const segmentSq = (a: ArrayLike<number>, i: number, j: number, px: number, py: number, pz: number) => {
    const ax = a[3 * i]!;
    const ay = a[3 * i + 1]!;
    const az = a[3 * i + 2]!;
    const bx = a[3 * j]! - ax;
    const by = a[3 * j + 1]! - ay;
    const bz = a[3 * j + 2]! - az;
    const dx = px - ax;
    const dy = py - ay;
    const dz = pz - az;
    const t = Math.min(1, Math.max(0, (dx * bx + dy * by + dz * bz) / (bx * bx + by * by + bz * bz)));
    const ex = dx - t * bx;
    const ey = dy - t * by;
    const ez = dz - t * bz;
    return ex * ex + ey * ey + ez * ez;
  };
  /** Distance (scene units) from a point to a closed polyline: every segment, no allocation. */
  const fromPolyline = (a: ArrayLike<number>, px: number, py: number, pz: number) => {
    const n = a.length / 3;
    let best = Infinity;
    for (let i = 0; i < n; i++) best = Math.min(best, segmentSq(a, i, i + 1 === n ? 0 : i + 1, px, py, pz));
    return Math.sqrt(best);
  };

  /** Copies every STRIDE-th fine vertex into the far copy and measures how far the fine line bulges from it. */
  const traceFar = (id: string, fine: BufferAttribute) => {
    const copy = far.get(id);
    if (!copy) return;
    const attr = copy.line.geometry.getAttribute('position') as BufferAttribute;
    const a = fine.array;
    for (let i = 0; i < POINTS; i++)
      attr.setXYZ(i, a[3 * STRIDE * i]!, a[3 * STRIDE * i + 1]!, a[3 * STRIDE * i + 2]!);
    attr.needsUpdate = true;
    copy.line.geometry.computeBoundingSphere();
    let worst = 0;
    for (let k = 0; k < fine.count; k++) {
      const i = Math.floor(k / STRIDE);
      const d = segmentSq(
        attr.array,
        i,
        i + 1 === POINTS ? 0 : i + 1,
        a[3 * k]!,
        a[3 * k + 1]!,
        a[3 * k + 2]!,
      );
      worst = Math.max(worst, d);
    }
    copy.sag = Math.sqrt(worst);
  };

  const traceReal = (body: BodyData, on: number) => {
    const line = lines.get(body.id)!.real;
    const attr = line.geometry.getAttribute('position') as BufferAttribute;
    const planet = body.kind === 'moon' ? byId.get(body.parent!)! : null;
    for (let i = 0; i < attr.count; i++) {
      const M = (2 * Math.PI * i) / attr.count;
      if (planet) moonPosition(body, planet, on, point, M);
      else planetPosition(body, on, point, M);
      toScene(point);
      attr.setXYZ(i, point.x / REAL_UNIT_KM, point.y / REAL_UNIT_KM, point.z / REAL_UNIT_KM);
    }
    attr.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    traceFar(body.id, attr);
    builtAt.set(body.id, on);
  };

  /** Distance (scene units) from the body's true position on `on` to its real line: every segment, no allocation. */
  const strayed = (body: BodyData, on: number) => {
    const planet = body.kind === 'moon' ? byId.get(body.parent!)! : null;
    if (planet) moonPosition(body, planet, on, point);
    else planetPosition(body, on, point);
    toScene(point);
    const px = point.x / REAL_UNIT_KM;
    const py = point.y / REAL_UNIT_KM;
    const pz = point.z / REAL_UNIT_KM;
    const a = (lines.get(body.id)!.real.geometry.getAttribute('position') as BufferAttribute).array;
    return fromPolyline(a, px, py, pz);
  };

  for (const body of bodies) {
    if (!body.parent) continue;
    const holder = body.kind === 'moon' ? root.getObjectByName(`${body.parent}-orbit`) : root;
    if (!holder) throw new Error(`${body.id}: no orbit group for ${body.parent}`);
    const real = makeLine(
      holder,
      `${body.id}-path-real`,
      body.kind === 'planet' ? PLANET_REAL_POINTS : POINTS,
    );
    const ring = makeLine(holder, `${body.id}-path-stylised`, POINTS);
    lines.set(body.id, { real, stylised: ring });
    if (body.kind === 'planet') {
      far.set(body.id, { line: makeLine(holder, `${body.id}-path-real-far`, POINTS), sag: 0, near: true });
    }
    traceReal(body, days);
    const attr = ring.geometry.getAttribute('position') as BufferAttribute;
    const radius = stylised.get(body.id)!.distance;
    for (let i = 0; i < POINTS; i++) {
      const angle = (2 * Math.PI * i) / POINTS;
      attr.setXYZ(i, radius * Math.cos(angle), 0, -radius * Math.sin(angle));
    }
    ring.geometry.computeBoundingSphere();
  }
  /** Visibility for the scale and, for planets at real scale, the level of detail. */
  function show() {
    for (const [id, pair] of lines) {
      const copy = far.get(id);
      pair.real.visible = mode === 'real' && (copy?.near ?? true);
      pair.stylised.visible = mode === 'stylised';
      if (copy) copy.line.visible = mode === 'real' && !copy.near;
    }
  }
  show();

  const limits = new Map(
    [...lines.keys()].map((id) => [id, (STRAY * byId.get(id)!.radiusKm) / REAL_UNIT_KM]),
  );

  return {
    setMode(next) {
      mode = next;
      show();
    },
    setView(eye, pixelAngle) {
      // Planet lines hang off the system root, which sits untransformed at the origin: world = line space.
      for (const copy of far.values()) {
        const distance = fromPolyline(copy.line.geometry.getAttribute('position').array, eye.x, eye.y, eye.z);
        copy.near = copy.sag >= SAG_PX * pixelAngle * distance;
      }
      show();
    },
    update(on) {
      for (const [id, limit] of limits) {
        if (builtAt.get(id) === on) continue;
        const body = byId.get(id)!;
        if (strayed(body, on) > limit) traceReal(body, on);
      }
    },
    coarse(id) {
      return far.get(id)?.line ?? null;
    },
    line(id, mode) {
      const pair = lines.get(id);
      if (!pair) throw new Error(`no orbit line for ${id}`);
      return pair[mode];
    },
    dispose() {
      for (const line of [
        ...[...lines.values()].flatMap((p) => [p.real, p.stylised]),
        ...[...far.values()].map((c) => c.line),
      ]) {
        line.removeFromParent();
        line.geometry.dispose();
      }
      material.dispose();
      lines.clear();
      far.clear();
    },
  };
}
