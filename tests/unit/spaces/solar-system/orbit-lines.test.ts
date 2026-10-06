import { LineBasicMaterial, LineLoop, Raycaster, Vector3, type BufferAttribute, type Group } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BODIES, REAL_UNIT_KM } from '../../../../src/spaces/solar-system/data';
import { moonPosition, planetPosition, toScene } from '../../../../src/spaces/solar-system/orbit';
import { createOrbitLines } from '../../../../src/spaces/solar-system/orbit-lines';
import { layout } from '../../../../src/spaces/solar-system/scale';
import { buildSystem } from '../../../../src/spaces/solar-system/scene';
import type { BodyData } from '../../../../src/spaces/solar-system/types';

// Spec 021, AC-11 (Q5, plan §5): a faint line for every orbit at both scales, matching the path the body
// travels; prebuilt sets toggled by visibility. Spec 023 (D-037, D-038): planets' real lines have 4 096 points,
// and a real line is rebuilt whenever its body strays more than a quarter of its radius from it.

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

/** The body's drawn radius at real scale, in scene units. */
const radiusOf = (b: BodyData) => b.radiusKm / REAL_UNIT_KM;
/** Distance (scene units) from `p` to the closed polyline, straight from the position array (fast). */
const fromLine = (line: LineLoop, p: Vector3) => {
  const a = line.geometry.getAttribute('position').array as Float32Array;
  const n = a.length / 3;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = a[3 * i]!,
      ay = a[3 * i + 1]!,
      az = a[3 * i + 2]!;
    const bx = a[3 * j]! - ax,
      by = a[3 * j + 1]! - ay,
      bz = a[3 * j + 2]! - az;
    const px = p.x - ax,
      py = p.y - ay,
      pz = p.z - az;
    const t = Math.min(1, Math.max(0, (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz)));
    best = Math.min(best, Math.hypot(px - t * bx, py - t * by, pz - t * bz));
  }
  return best;
};

describe('createOrbitLines', () => {
  it('draws 15 line loops per scale, faint and not writing depth: 4 096 points for planets at real scale, else 256', () => {
    const { lines } = setup();
    for (const mode of ['real', 'stylised'] as const) {
      const set = orbiting.map((b) => lines.line(b.id, mode));
      expect(set).toHaveLength(15);
      for (const [i, line] of set.entries()) {
        expect(line).toBeInstanceOf(LineLoop);
        const planetReal = mode === 'real' && orbiting[i]!.kind === 'planet';
        expect(line.geometry.getAttribute('position').count).toBe(planetReal ? 4096 : 256);
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

  it('straight segments sag less than an eighth of the body’s radius anywhere on its orbit (D-038)', () => {
    // Half the rebuild threshold, so a freshly built line never triggers another rebuild.
    const { lines } = setup(9400);
    for (const b of orbiting) {
      let worst = 0;
      for (let k = 0; k < 720; k++) {
        const M = ((k + 0.5) / 720) * 2 * Math.PI;
        const out = new Vector3();
        if (b.kind === 'planet') planetPosition(b, 9400, out, M);
        else moonPosition(b, byId.get(b.parent!)!, 9400, out, M);
        worst = Math.max(
          worst,
          fromLine(lines.line(b.id, 'real'), (toScene(out) as Vector3).divideScalar(REAL_UNIT_KM)),
        );
      }
      expect(worst / radiusOf(b), b.id).toBeLessThan(0.125);
    }
  });

  it('keeps every body within a quarter of its radius of its own line as time runs (D-038)', () => {
    const { lines } = setup(9400);
    const check = (days: number, ids: readonly BodyData[]) => {
      for (const b of ids) {
        expect(
          fromLine(lines.line(b.id, 'real'), trueOffset(b, days)) / radiusOf(b),
          `${b.id} @ ${days}`,
        ).toBeLessThan(0.25);
      }
    };
    const planets = orbiting.filter((b) => b.kind === 'planet');
    const moons = orbiting.filter((b) => b.kind === 'moon');
    // Moons: a day per frame for a year. Planets: a week per frame for 20 years (as 1 year/s at ~50 fps).
    for (let day = 9400; day <= 9400 + 365; day += 1) {
      lines.update(day);
      check(day, moons);
    }
    for (let day = 9400; day <= 9400 + 20 * 365.25; day += 7) {
      lines.update(day);
      check(day, planets);
    }
  });

  it('backwards too, and after a jump in date (setSimTime)', () => {
    const { lines } = setup(9400);
    lines.update(-50_000);
    for (const b of orbiting) {
      expect(fromLine(lines.line(b.id, 'real'), trueOffset(b, -50_000)) / radiusOf(b), b.id).toBeLessThan(
        0.25,
      );
    }
  });

  it('rebuilds in place, and only when needed: a still date changes nothing', () => {
    const { lines } = setup(9400);
    const marsLine = lines.line('mars', 'real');
    const geometry = marsLine.geometry;
    const attr = geometry.getAttribute('position') as BufferAttribute;
    const version = attr.version;
    for (let i = 0; i < 50; i++) lines.update(9400);
    expect(attr.version).toBe(version);
    lines.update(9400 + 3650); // ten years on: Mars's path has drifted ~4 of its radii
    expect(marsLine.geometry).toBe(geometry);
    expect(geometry.getAttribute('position')).toBe(attr);
    expect(attr.version).toBeGreaterThan(version);
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

  describe('real-scale level of detail (D-040)', () => {
    const planets = orbiting.filter((b) => b.kind === 'planet');
    /** Radians per CSS px at the view's centre: 50° vertical field of view, 720 px tall. */
    const PIXEL = (2 * Math.tan((25 * Math.PI) / 180)) / 720;
    /** Worst distance from the fine line's vertices to the far copy: what drawing the copy instead would move. */
    const worstSag = (lines: ReturnType<typeof setup>['lines'], id: string) =>
      Math.max(...pointsOf(lines.line(id, 'real')).map((p) => fromLine(lines.coarse(id)!, p)));
    const drawn = (lines: ReturnType<typeof setup>['lines'], id: string) => ({
      fine: lines.line(id, 'real').visible,
      far: lines.coarse(id)!.visible,
    });
    const expectEveryOtherFineVertex = (lines: ReturnType<typeof setup>['lines'], id: string) => {
      const fine = lines.line(id, 'real').geometry.getAttribute('position').array;
      const far = lines.coarse(id)!.geometry.getAttribute('position').array;
      expect(far.length, id).toBe(256 * 3);
      for (let i = 0; i < 256; i++)
        for (let k = 0; k < 3; k++) expect(far[3 * i + k], id).toBe(fine[3 * 16 * i + k]);
    };

    it('each planet has a 256-point far copy made of every 16th vertex of its fine line; moons have none', () => {
      const { lines, system } = setup(9400);
      for (const b of planets) {
        expectEveryOtherFineVertex(lines, b.id);
        expect(lines.coarse(b.id)!.parent, b.id).toBe(system.root);
        expect(lines.coarse(b.id)!.material, b.id).toBe(lines.line(b.id, 'real').material);
      }
      for (const b of orbiting.filter((m) => m.kind === 'moon')) expect(lines.coarse(b.id), b.id).toBeNull();
    });

    it('a rebuild rewrites the far copy too, in place', () => {
      const { lines } = setup(9400);
      const geometry = lines.coarse('mars')!.geometry;
      lines.update(9400 + 3650);
      expect(lines.coarse('mars')!.geometry).toBe(geometry);
      for (const b of planets) expectEveryOtherFineVertex(lines, b.id);
    });

    it('far from every orbit, planets draw their far copies; moons keep their only line', () => {
      const { lines } = setup(9400);
      lines.setMode('real');
      lines.setView({ x: 0, y: 1e5, z: 0 }, PIXEL); // ~670 AU above the Sun
      for (const b of planets) expect(drawn(lines, b.id), b.id).toEqual({ fine: false, far: true });
      for (const b of orbiting.filter((m) => m.kind === 'moon'))
        expect(lines.line(b.id, 'real').visible, b.id).toBe(true);
    });

    it('beside a planet, that planet draws its fine line', () => {
      const { lines } = setup(9400);
      lines.setMode('real');
      const earth = trueOffset(byId.get('earth')!, 9400).add(new Vector3(0, 0.05, 0));
      lines.setView(earth, PIXEL);
      expect(drawn(lines, 'earth')).toEqual({ fine: true, far: false });
      expect(drawn(lines, 'neptune')).toEqual({ fine: false, far: true });
    });

    it('switches exactly where the far copy’s worst sag would be half a pixel, nearer in a smaller view', () => {
      const { lines } = setup(9400);
      lines.setMode('real');
      for (const b of planets) {
        const sag = worstSag(lines, b.id);
        const at = sag / (0.5 * PIXEL); // the switch distance
        const vertex = pointsOf(lines.coarse(b.id)!)[0]!;
        for (const [factor, fine] of [
          [0.9, true],
          [1.1, false],
        ] as const) {
          // Straight up from a vertex: the line's nearest point (the orbits are within 18° of the plane).
          const eye = vertex.clone().add(new Vector3(0, at * factor, 0));
          const distance = fromLine(lines.coarse(b.id)!, eye);
          lines.setView(eye, PIXEL);
          expect(drawn(lines, b.id).fine, `${b.id} ×${factor}`).toBe(distance < at);
          if (factor === 0.9) expect(drawn(lines, b.id).fine, b.id).toBe(fine);
        }
        // A view a tenth as tall makes each pixel 10× wider: 0.9 of the full-size switch distance is far.
        lines.setView(vertex.clone().add(new Vector3(0, at * 0.9, 0)), PIXEL * 10);
        expect(drawn(lines, b.id), b.id).toEqual({ fine: false, far: true });
      }
    });

    it('stylised scale draws no real line, fine or far, wherever the eye is; switching back keeps the choice', () => {
      const { lines } = setup(9400);
      lines.setMode('stylised');
      lines.setView(trueOffset(byId.get('earth')!, 9400), PIXEL);
      for (const b of planets) expect(drawn(lines, b.id), b.id).toEqual({ fine: false, far: false });
      lines.setMode('real');
      expect(drawn(lines, 'earth')).toEqual({ fine: true, far: false });
      expect(drawn(lines, 'neptune')).toEqual({ fine: false, far: true });
    });
  });

  it('dispose removes every line and frees their geometries and material', () => {
    const { system, lines } = setup();
    const all = orbiting.flatMap((b) => [
      lines.line(b.id, 'real'),
      lines.line(b.id, 'stylised'),
      ...(lines.coarse(b.id) ? [lines.coarse(b.id)!] : []),
    ]);
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
