import { LineBasicMaterial, LineLoop, Raycaster, Vector3, type Group } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BODIES, REAL_UNIT_KM } from '../../../../src/spaces/solar-system/data';
import { moonPosition, planetPosition, toScene } from '../../../../src/spaces/solar-system/orbit';
import { createOrbitLines } from '../../../../src/spaces/solar-system/orbit-lines';
import { layout } from '../../../../src/spaces/solar-system/scale';
import { buildSystem } from '../../../../src/spaces/solar-system/scene';
import type { BodyData } from '../../../../src/spaces/solar-system/types';

// Spec 021, AC-11 (Q5, plan §5): a faint line for every orbit at both scales, matching the path the body
// travels; prebuilt sets toggled by visibility; real ellipses refreshed as their elements drift (D-027).

const byId = new Map(BODIES.map((b) => [b.id, b]));
const orbiting = BODIES.filter((b) => b.parent);
const styl = layout(BODIES, 'stylised');
const setup = (days = 0) => {
  const system = buildSystem(BODIES);
  const lines = createOrbitLines(system.root, BODIES, styl, days);
  return { system, lines };
};
const pointsOf = (line: LineLoop) => {
  const attr = line.geometry.getAttribute('position');
  return Array.from({ length: attr.count }, (_, i) => new Vector3().fromBufferAttribute(attr, i));
};
/** The body's true offset from its parent, in real-scale scene units. */
const trueOffset = (b: BodyData, days: number) => {
  const out = new Vector3();
  if (b.kind === 'planet') planetPosition(b, days, out);
  else moonPosition(b, byId.get(b.parent!)!, days, out);
  return (toScene(out) as Vector3).divideScalar(REAL_UNIT_KM);
};
/** Distance from a point to the closed polyline, relative to the orbit's size. */
const offLine = (line: LineLoop, p: Vector3, size: number) => {
  const points = pointsOf(line);
  let best = Infinity;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]!;
    const ab = b.clone().sub(a);
    const t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq()));
    best = Math.min(best, a.clone().addScaledVector(ab, t).distanceTo(p));
  });
  return best / size;
};

describe('createOrbitLines', () => {
  it('draws 15 line loops per scale, 256 points each, faint and not writing depth', () => {
    const { lines } = setup();
    for (const mode of ['real', 'stylised'] as const) {
      const set = orbiting.map((b) => lines.line(b.id, mode));
      expect(set).toHaveLength(15);
      for (const line of set) {
        expect(line).toBeInstanceOf(LineLoop);
        expect(line.geometry.getAttribute('position').count).toBe(256);
        const material = line.material as LineBasicMaterial;
        expect(material.transparent).toBe(true);
        expect(material.opacity).toBeLessThanOrEqual(0.3);
        expect(material.depthWrite).toBe(false);
      }
    }
  });

  it('hangs planet lines off the system and moon lines off their planet’s orbit group', () => {
    const { system, lines } = setup();
    for (const b of orbiting) {
      const holder = b.kind === 'planet' ? system.root : system.root.getObjectByName(`${b.parent}-orbit`);
      expect(lines.line(b.id, 'real').parent, b.id).toBe(holder);
      expect(lines.line(b.id, 'stylised').parent, b.id).toBe(holder);
    }
  });

  it('real: each line is the true ellipse the body travels, for a full orbit from the build date', () => {
    const { lines } = setup(9000);
    for (const b of orbiting) {
      const line = lines.line(b.id, 'real');
      const size = b.orbit!.semiMajorAxisKm / REAL_UNIT_KM;
      for (let k = 0; k <= 8; k++) {
        const days = 9000 + (b.orbit!.periodDays * k) / 8;
        // A moon's ellipse turns while it goes round (the Moon's: ~4° a month), within its refresh interval.
        expect(offLine(line, trueOffset(b, days), size), `${b.id} +${k}/8`).toBeLessThan(
          b.kind === 'moon' ? 0.005 : 0.002,
        );
      }
    }
  });

  it('stylised: each line is the body’s 020 ring, a circle in the XZ plane', () => {
    const { lines } = setup();
    for (const b of orbiting) {
      for (const p of pointsOf(lines.line(b.id, 'stylised'))) {
        expect(Math.hypot(p.x, p.z), b.id).toBeCloseTo(styl.get(b.id)!.distance, 5);
        expect(p.y, b.id).toBe(0);
      }
    }
  });

  it('a scale switch only toggles visibility: no new geometry or material', () => {
    const { lines } = setup();
    const before = orbiting.map((b) => [
      lines.line(b.id, 'real').geometry,
      lines.line(b.id, 'stylised').geometry,
    ]);
    lines.setMode('real');
    for (const b of orbiting) {
      expect(lines.line(b.id, 'real').visible).toBe(true);
      expect(lines.line(b.id, 'stylised').visible).toBe(false);
    }
    lines.setMode('stylised');
    for (const b of orbiting) {
      expect(lines.line(b.id, 'real').visible).toBe(false);
      expect(lines.line(b.id, 'stylised').visible).toBe(true);
    }
    expect(
      orbiting.map((b) => [lines.line(b.id, 'real').geometry, lines.line(b.id, 'stylised').geometry]),
    ).toEqual(before);
  });

  it('keeps each real line on its body as the elements drift: planets after 10 years, moons sooner (D-027)', () => {
    const { lines } = setup(0);
    const earthLine = lines.line('earth', 'real');
    const geometry = earthLine.geometry;
    const first = pointsOf(earthLine)[0]!.clone();
    lines.update(3000); // < 10 years: planets keep their line
    expect(pointsOf(earthLine)[0]).toEqual(first);
    // The Moon's ellipse turns once every ~6 years: step through 9 years, as frames would.
    for (let days = 0; days <= 3300; days += 1) lines.update(days);
    const moon = byId.get('moon')!;
    const size = moon.orbit!.semiMajorAxisKm / REAL_UNIT_KM;
    expect(offLine(lines.line('moon', 'real'), trueOffset(moon, 3300), size)).toBeLessThan(0.005);
    lines.update(3800); // > 10 years from the build: rebuilt in place
    expect(pointsOf(earthLine)[0]).not.toEqual(first);
    expect(earthLine.geometry).toBe(geometry);
    const earth = byId.get('earth')!;
    expect(
      offLine(earthLine, trueOffset(earth, 3800), earth.orbit!.semiMajorAxisKm / REAL_UNIT_KM),
    ).toBeLessThan(0.002);
  });

  it('never catches pointer events (raycasts pass through)', () => {
    const { system, lines } = setup();
    lines.setMode('stylised');
    const ring = styl.get('earth')!.distance;
    const ray = new Raycaster(new Vector3(ring, 5, 0), new Vector3(0, -1, 0));
    ray.params.Line = { threshold: 1 };
    const hits = ray.intersectObject(system.root, true).filter((h) => h.object instanceof LineLoop);
    expect(hits).toEqual([]);
  });

  it('dispose removes every line and frees their geometries and material', () => {
    const { system, lines } = setup();
    const all = orbiting.flatMap((b) => [lines.line(b.id, 'real'), lines.line(b.id, 'stylised')]);
    const spies = all.map((l) => vi.spyOn(l.geometry, 'dispose'));
    const material = vi.spyOn(all[0]!.material as LineBasicMaterial, 'dispose');
    lines.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalled();
    const left: Group[] = [];
    system.root.traverse((o) => {
      if (o instanceof LineLoop) left.push(o as unknown as Group);
    });
    expect(left).toEqual([]);
  });
});
