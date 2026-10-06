import {
  Color,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BODIES } from '../../../../src/spaces/solar-system/data';
import { createRings, profileSpanU } from '../../../../src/spaces/solar-system/rings';

// Spec 022, AC-7/AC-8: Saturn's rings at their sourced radii, in Saturn's equatorial plane (its local frame), with
// their radial profile mapped to true radii, lit on the Sun's face and shadowed by the planet.

const saturn = BODIES.find((b) => b.id === 'saturn')!;
const rings = saturn.rings!;
const setup = () => {
  const mesh = new Mesh(new SphereGeometry(1, 8, 4), new MeshStandardMaterial());
  const sunLocal = { value: new Vector3(1, 0.3, 0).normalize() };
  return { mesh, sunLocal, ring: createRings(saturn, mesh, sunLocal) };
};

describe('profileSpanU', () => {
  it('maps the C ring’s inner edge and the A ring’s outer edge into the profile strip (calibrated span)', () => {
    const [u0, u1] = profileSpanU(rings);
    expect(u0).toBeCloseTo(
      (rings.innerKm - rings.profile.spanKm[0]) / (rings.profile.spanKm[1] - rings.profile.spanKm[0]),
      12,
    );
    expect(u0).toBeGreaterThan(0.05);
    expect(u1).toBeLessThan(0.95);
    // The Cassini Division's inner edge (117 580 km) falls where the strip's B ring ends (~0.67, T041 fit).
    const cassini = u0 + ((117_580 - rings.innerKm) / (rings.outerKm - rings.innerKm)) * (u1 - u0);
    expect(cassini).toBeGreaterThan(0.65);
    expect(cassini).toBeLessThan(0.69);
  });
});

describe('createRings', () => {
  it('is a flat annulus from the C ring’s inner edge to the A ring’s outer edge, in Saturn radii', () => {
    const { ring } = setup();
    const position = ring.mesh.geometry.getAttribute('position');
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < position.count; i++) {
      expect(position.getY(i)).toBeCloseTo(0, 12); // the ring plane: Saturn's equator, local y = 0
      const r = Math.hypot(position.getX(i), position.getZ(i));
      [min, max] = [Math.min(min, r), Math.max(max, r)];
    }
    expect(min).toBeCloseTo(rings.innerKm / saturn.radiusKm, 6); // float32 vertices
    expect(max).toBeCloseTo(rings.outerKm / saturn.radiusKm, 6);
  });

  it('hangs off Saturn’s mesh, so it takes Saturn’s pole and drawn size at both scales', () => {
    const { mesh, ring } = setup();
    expect(ring.mesh.parent).toBe(mesh);
    expect(ring.mesh.position.length()).toBe(0);
    expect(ring.mesh.quaternion.w).toBe(1);
  });

  it('draws both faces, transparent, without writing depth, and is never a pointer target', () => {
    const { ring } = setup();
    const material = ring.mesh.material as ShaderMaterial;
    expect(material.side).toBe(DoubleSide);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(() => ring.mesh.raycast(undefined as never, [])).not.toThrow();
  });

  it('lights the Sun’s face, darkens behind the planet, and shares the Sun direction with Saturn’s shadow', () => {
    const { ring, sunLocal } = setup();
    const material = ring.mesh.material as ShaderMaterial;
    expect(material.uniforms.uSunLocal).toBe(sunLocal);
    expect(material.fragmentShader).toContain('gl_FrontFacing');
    expect(material.fragmentShader).toContain('b * b - c > 0.0'); // inPlanetShadow, mirrored
    expect(material.fragmentShader).toContain('#include <colorspace_fragment>');
    expect(material.uniforms.uProfileU!.value.toArray()).toEqual(profileSpanU(rings));
  });

  it('fades from a plain band to the profile when it arrives', () => {
    const { ring } = setup();
    const material = ring.mesh.material as ShaderMaterial;
    // The plain band is Saturn's colour in the working (linear) space, as the profile texture samples, so the
    // shader's output conversion doesn't wash it out.
    expect(material.uniforms.uColour!.value).toBeInstanceOf(Color);
    expect(material.uniforms.uColour!.value.equals(new Color(saturn.colour))).toBe(true);
    expect(ring.imageMix.value).toBe(0);
    expect(material.uniforms.uImageMix).toBe(ring.imageMix);
    const profile = new Texture();
    ring.setProfile(profile);
    expect(material.uniforms.uProfile!.value).toBe(profile);
  });

  it('dispose() frees its geometry, material and placeholder, and leaves Saturn', () => {
    const { mesh, ring } = setup();
    const material = ring.mesh.material as ShaderMaterial;
    const spies = [
      vi.spyOn(ring.mesh.geometry, 'dispose'),
      vi.spyOn(material, 'dispose'),
      vi.spyOn(material.uniforms.uProfile!.value as Texture, 'dispose'),
    ];
    ring.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    expect(mesh.children).not.toContain(ring.mesh);
  });
});

describe('createRings dispose with a profile', () => {
  it('also frees the profile texture it was handed, once', () => {
    const { ring } = setup();
    const profile = new Texture();
    const spy = vi.spyOn(profile, 'dispose');
    ring.setProfile(profile);
    ring.dispose();
    expect(spy).toHaveBeenCalledOnce();
  });
});
