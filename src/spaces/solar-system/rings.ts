import {
  Color,
  DataTexture,
  DoubleSide,
  Mesh,
  RingGeometry,
  ShaderMaterial,
  Vector2,
  type Texture,
  type Vector3,
} from 'three';
import type { BodyData, Rings } from './types';

/** Around the ring: smooth at any zoom the controls allow. */
const SEGMENTS = 256;
/** Before its profile arrives (and while fading in), the ring is a plain band of this opacity in Saturn's colour. */
export const PLAIN_OPACITY = 0.35;
/** The face turned away from the Sun is lit only by light scattered through the ring (AC-8). */
const UNLIT_FACE = 0.3;
/** The ring in Saturn's shadow keeps a little scattered light. */
const IN_SHADOW = 0.12;

/** Where the ring band (C inner → A outer) falls in the profile strip's u (0–1), from its calibrated span. */
export function profileSpanU(rings: Rings): [number, number] {
  const [from, to] = rings.profile.spanKm;
  return [(rings.innerKm - from) / (to - from), (rings.outerKm - from) / (to - from)];
}

export interface SaturnRings {
  mesh: Mesh;
  /** 0 → 1 as the profile fades in (the Space advances it). */
  imageMix: { value: number };
  setProfile(texture: Texture): void;
  /** Frees the geometry, material, placeholder and the profile texture set by `setProfile`. */
  dispose(): void;
}

/**
 * Saturn's rings (spec 022, AC-7/AC-8): a flat annulus from the C ring's inner edge to the A ring's outer edge, in
 * Saturn radii, a child of Saturn's mesh, so it lies in Saturn's equatorial plane (local y = 0) and takes its drawn
 * size at both scales. Its own simple lighting: the face the Sun shines on is bright, the other dim, and the part
 * behind the planet is shadowed (`inPlanetShadow`, ring-shadows.ts, mirrored). `sunLocal` is the Sun's direction
 * in Saturn's frame, shared with Saturn's own ring-shadow patch and set each frame.
 */
export function createRings(saturn: BodyData, saturnMesh: Mesh, sunLocal: { value: Vector3 }): SaturnRings {
  const rings = saturn.rings!;
  const inner = rings.innerKm / saturn.radiusKm;
  const outer = rings.outerKm / saturn.radiusKm;
  const geometry = new RingGeometry(inner, outer, SEGMENTS, 1);
  geometry.rotateX(-Math.PI / 2); // XY plane facing +z → XZ plane facing +y (Saturn's pole)

  const placeholder = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  placeholder.needsUpdate = true;
  const imageMix = { value: 0 };
  const material = new ShaderMaterial({
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uProfile: { value: placeholder as Texture },
      uProfileU: { value: new Vector2(...profileSpanU(rings)) },
      uInner: { value: inner },
      uOuter: { value: outer },
      uImageMix: imageMix,
      uSunLocal: sunLocal,
      uColour: { value: new Color(saturn.colour) }, // sRGB hex → linear, as the profile samples
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uProfile;
      uniform vec2 uProfileU;
      uniform float uInner;
      uniform float uOuter;
      uniform float uImageMix;
      uniform vec3 uSunLocal;
      uniform vec3 uColour;
      varying vec3 vLocal;
      void main() {
        float along = ( length( vLocal.xz ) - uInner ) / ( uOuter - uInner );
        vec4 profile = texture2D( uProfile, vec2( mix( uProfileU.x, uProfileU.y, along ), 0.5 ) );
        vec3 colour = mix( uColour, profile.rgb, uImageMix );
        float alpha = mix( ${PLAIN_OPACITY.toFixed(2)}, profile.a, uImageMix );
        // The face the Sun shines on (front = +y) is bright; the other gets scattered light.
        float light = ( gl_FrontFacing == ( uSunLocal.y > 0.0 ) ) ? 1.0 : ${UNLIT_FACE.toFixed(2)};
        // In Saturn's shadow: the ray towards the Sun hits the unit sphere (inPlanetShadow).
        float b = dot( vLocal, uSunLocal );
        float c = dot( vLocal, vLocal ) - 1.0;
        if ( b < 0.0 && b * b - c > 0.0 ) light *= ${IN_SHADOW.toFixed(2)};
        gl_FragColor = vec4( colour * light, alpha );
        #include <colorspace_fragment>
      }`,
  });

  const mesh = new Mesh(geometry, material);
  mesh.name = 'saturn-rings';
  mesh.raycast = () => {};
  saturnMesh.add(mesh);

  return {
    mesh,
    imageMix,
    setProfile(texture) {
      material.uniforms.uProfile!.value = texture;
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      // The placeholder, and the profile that replaced it (which `setProfile` handed over).
      for (const texture of new Set([placeholder, material.uniforms.uProfile!.value as Texture]))
        texture.dispose();
    },
  };
}
