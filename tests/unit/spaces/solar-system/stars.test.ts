import { readFileSync } from 'node:fs';
import { Group, Points, Raycaster, Vector3, type ShaderMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createStarfield,
  decodeStars,
  starAlpha,
  starColour,
  starDirection,
  starSize,
  type Sky,
} from '../../../../src/spaces/solar-system/stars';

// Spec 022, AC-9: the real night sky from the shipped catalogue (T005): true directions in 021's scene axes and
// relative brightness and colour.

const file = readFileSync('public/assets/solar-system/stars.bin');
const sky = decodeStars(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const DEG = Math.PI / 180;

/** J2000 RA/Dec → scene axes, written out independently: equatorial → ecliptic (ε) → (x, z, −y). */
const expected = (raDeg: number, decDeg: number) => {
  const e = 23.4392911 * DEG;
  const [x, y, z] = [
    Math.cos(decDeg * DEG) * Math.cos(raDeg * DEG),
    Math.cos(decDeg * DEG) * Math.sin(raDeg * DEG),
    Math.sin(decDeg * DEG),
  ];
  const ecl = [x, y * Math.cos(e) + z * Math.sin(e), -y * Math.sin(e) + z * Math.cos(e)] as const;
  return new Vector3(ecl[0], ecl[2], -ecl[1]);
};

describe('decodeStars', () => {
  it('decodes all 9 096 stars with unit directions, magnitudes and colours', () => {
    expect(sky.count).toBe(9096);
    expect(sky.directions).toHaveLength(9096 * 3);
    expect(sky.magnitudes).toHaveLength(9096);
    expect(sky.colours).toHaveLength(9096 * 3);
    for (let i = 0; i < sky.count; i += 97) {
      expect(
        Math.hypot(sky.directions[3 * i]!, sky.directions[3 * i + 1]!, sky.directions[3 * i + 2]!),
      ).toBeCloseTo(1, 5);
    }
  });

  it('rejects a file that is not a star catalogue', () => {
    expect(() => decodeStars(new Uint8Array([1, 2, 3, 4, 0, 0, 0, 0]).buffer)).toThrow(
      /not a star catalogue/,
    );
  });

  it.each([
    ['Sirius', 101.2872, -16.7161, -1.46],
    ['Betelgeuse', 88.7929, 7.4071, 0.5],
    ['Polaris', 37.9546, 89.2641, 2.02],
  ])('%s is within 0.5° of its true direction, at its magnitude', (_name, ra, dec, mag) => {
    const truth = expected(ra, dec);
    let best = Infinity;
    let bestMag = NaN;
    for (let i = 0; i < sky.count; i++) {
      const d = new Vector3(sky.directions[3 * i], sky.directions[3 * i + 1], sky.directions[3 * i + 2]);
      const angle = d.angleTo(truth) / DEG;
      if (angle < best) [best, bestMag] = [angle, sky.magnitudes[i]!];
    }
    expect(best).toBeLessThan(0.5);
    expect(Math.abs(bestMag - mag)).toBeLessThan(0.15);
  });
});

describe('starDirection', () => {
  it('turns J2000 RA/Dec into scene axes (the ecliptic north pole is +y)', () => {
    const out = starDirection(37.9546, 89.2641, new Vector3()) as Vector3;
    expect(out.angleTo(expected(37.9546, 89.2641)) / DEG).toBeLessThan(1e-6);
    // The north ecliptic pole (RA 270°, Dec 66.56°) is straight up.
    expect(
      (starDirection(270, 90 - 23.4392911, new Vector3()) as Vector3).angleTo(new Vector3(0, 1, 0)),
    ).toBeLessThan(1e-6);
  });
});

describe('brightness and colour', () => {
  it('brighter stars (lower magnitude) are drawn larger and more opaque, within sane limits', () => {
    for (let m = -1.5; m < 7; m += 0.5) {
      expect(starSize(m)).toBeGreaterThanOrEqual(starSize(m + 0.5));
      expect(starAlpha(m)).toBeGreaterThanOrEqual(starAlpha(m + 0.5));
    }
    expect(starSize(-1.46)).toBeLessThanOrEqual(5);
    expect(starSize(6.5)).toBeGreaterThanOrEqual(1);
    expect(starAlpha(6.5)).toBeGreaterThan(0.05);
    expect(starAlpha(-1.46)).toBe(1);
  });

  it('colour goes from blue-white to orange-red as B−V rises', () => {
    const ratio = (bv: number) => {
      const c = starColour(bv, { x: 0, y: 0, z: 0 });
      return c.x / c.z;
    };
    for (let bv = -0.3; bv < 2; bv += 0.25) expect(ratio(bv + 0.25)).toBeGreaterThan(ratio(bv));
    const sun = starColour(0.65, { x: 0, y: 0, z: 0 });
    for (const c of [sun.x, sun.y, sun.z]) {
      expect(c).toBeGreaterThan(0.5);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

// T042 (AC-9): the sky as one `Points` at infinity: the vertex shader uses only the view's rotation and puts every
// star on the far plane, so panning, zooming and real-scale distances never move it; drawn first, no depth write.
describe('createStarfield', () => {
  const small: Sky = {
    count: 2,
    directions: new Float32Array([1, 0, 0, 0, 1, 0]),
    magnitudes: new Float32Array([-1.46, 6.5]),
    colours: new Float32Array([0.8, 0.9, 1, 1, 0.7, 0.5]),
  };

  it('is one Points with a vertex per star, sized and faded by magnitude, coloured by B−V', () => {
    const { points } = createStarfield(small);
    expect(points).toBeInstanceOf(Points);
    const geometry = points.geometry;
    expect(Array.from(geometry.getAttribute('position').array)).toEqual(Array.from(small.directions));
    const size = geometry.getAttribute('aSize');
    expect(size.getX(0)).toBeCloseTo(starSize(-1.46), 6);
    expect(size.getX(1)).toBeCloseTo(starSize(6.5), 6);
    const colour = geometry.getAttribute('aColour');
    expect(colour.itemSize).toBe(4);
    expect([colour.getX(1), colour.getY(1), colour.getZ(1)]).toEqual([1, 0.7, 0.5].map(Math.fround));
    expect(colour.getW(0)).toBeCloseTo(starAlpha(-1.46), 6);
    expect(colour.getW(1)).toBeCloseTo(starAlpha(6.5), 6);
  });

  it('sits at infinity: rotation-only view, far-plane depth, sizes in device pixels', () => {
    const { points, setPixelRatio } = createStarfield(small);
    const material = points.material as ShaderMaterial;
    expect(material.vertexShader).toContain('mat3( viewMatrix ) * position');
    expect(material.vertexShader).toContain('.xyww');
    expect(material.vertexShader).toContain('aSize * uPixelRatio');
    setPixelRatio(2);
    expect(material.uniforms.uPixelRatio!.value).toBe(2);
  });

  it('draws first and behind everything, is never culled, and never catches the pointer', () => {
    const { points } = createStarfield(small);
    const material = points.material as ShaderMaterial;
    expect(points.renderOrder).toBeLessThan(0);
    expect(material.depthWrite).toBe(false);
    expect(material.depthTest).toBe(true); // bodies in front hide the stars behind them
    expect(material.transparent).toBe(true);
    expect(points.frustumCulled).toBe(false);
    const hits: unknown[] = [];
    points.raycast(new Raycaster(new Vector3(), new Vector3(1, 0, 0)), hits as never);
    expect(hits).toHaveLength(0);
  });

  it('dispose() frees its geometry and material and leaves its parent', () => {
    const { points, dispose } = createStarfield(small);
    const parent = new Group().add(points);
    const spies = [
      vi.spyOn(points.geometry, 'dispose'),
      vi.spyOn(points.material as ShaderMaterial, 'dispose'),
    ];
    dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    expect(parent.children).toHaveLength(0);
  });
});
