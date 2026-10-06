import {
  Mesh,
  MeshStandardMaterial,
  Vector2,
  Vector3,
  type Material,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';

/**
 * Materials for the Solar System's surfaces (spec 022): shader patches on three's own materials, so its lighting
 * stays intact. Each patch replaces a named chunk and throws if the chunk is missing (a three upgrade renamed it),
 * rather than silently drawing without it. The pure maths the shaders mirror is exported for tests.
 */

/**
 * Earth's night lights (AC-5): they show where the Sun is below the horizon, fading across the terminator.
 * `fade` is the cosine half-width of the fade, ±~6° about the day/night line.
 */
export const NIGHT = { fade: 0.1 } as const;

/**
 * 0 on the day side, 1 deep in the night, a smoothstep across the terminator. `cosSun` is the cosine of the angle
 * between the surface normal and the direction to the Sun. The GLSL gate is `1.0 - smoothstep(-fade, fade, c)`.
 */
export function nightFactor(cosSun: number): number {
  const t = Math.min(1, Math.max(0, (cosSun + NIGHT.fade) / (2 * NIGHT.fade)));
  return 1 - t * t * (3 - 2 * t);
}

/** Oceans' roughness (AC-6): low enough for the Sun to leave a highlight on water; land stays at 1 (matte). */
export const OCEAN_ROUGHNESS = 0.35;
/** Clouds sit this far above the surface, as a fraction of the radius (~40 km on Earth; AC-4). */
const CLOUD_HEIGHT = 1.006;

type Shader = WebGLProgramParametersWithUniforms;
type Replace = (
  shader: Shader,
  stage: 'vertexShader' | 'fragmentShader',
  anchor: string,
  text: string,
) => void;
type Patch = { name: string; apply: (shader: Shader, replace: Replace) => void };

const glsl = (n: number) => n.toFixed(2);

/**
 * Adds a named shader patch to `material`. Patches run in order on compile, and the program cache key lists them,
 * so materials with the same patches share one program.
 */
export function addPatch(material: Material, name: string, apply: Patch['apply']): void {
  const patches = (material.userData.patches ??= []) as Patch[];
  patches.push({ name, apply });
  material.customProgramCacheKey = () => patches.map((p) => p.name).join('|');
  material.onBeforeCompile = (shader) => {
    for (const patch of patches) {
      patch.apply(shader, (target, stage, anchor, text) => {
        if (!target[stage].includes(anchor))
          throw new Error(`shader patch "${patch.name}": no ${anchor} in ${stage}`);
        target[stage] = target[stage].replace(anchor, text);
      });
    }
  };
}

/**
 * The image fade-in (AC-1, AC-11): the surface shows `mix(colour, image, uImageMix)`, so a map fades in from the
 * body's 020 colour instead of being tinted by it. Returns the uniform; 0 until its image arrives.
 */
export function withImageFade(material: Material): { value: number } {
  const imageMix = { value: 0 };
  addPatch(material, 'image-fade', (shader, replace) => {
    shader.uniforms.uImageMix = imageMix;
    replace(shader, 'fragmentShader', '#include <common>', '#include <common>\nuniform float uImageMix;');
    replace(
      shader,
      'fragmentShader',
      '#include <map_fragment>',
      `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  diffuseColor.rgb = mix( diffuseColor.rgb, sampledDiffuseColor.rgb, uImageMix );
#endif`,
    );
  });
  return imageMix;
}

/**
 * Earth (Q4): a matte surface whose roughness comes from the ocean mask (`roughnessMap`, white = water), and night
 * lights (`emissiveMap`) gated by the night factor towards the Sun. `sunView` is the Sun's position in view space,
 * set each frame (positions in view space stay small, so float precision holds at real scale).
 */
export function createEarthMaterial(colour: number): {
  material: MeshStandardMaterial;
  imageMix: { value: number };
  sunView: { value: Vector3 };
} {
  const material = new MeshStandardMaterial({
    color: colour,
    roughness: 1,
    metalness: 0,
    emissive: 0xffffff,
    emissiveIntensity: 0, // until the night lights arrive
  });
  const imageMix = withImageFade(material);
  const sunView = { value: new Vector3() };
  addPatch(material, 'earth-ocean', (shader, replace) => {
    replace(
      shader,
      'fragmentShader',
      '#include <roughnessmap_fragment>',
      `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  roughnessFactor = mix( 1.0, ${glsl(OCEAN_ROUGHNESS)}, texture2D( roughnessMap, vRoughnessMapUv ).g );
#endif`,
    );
  });
  addPatch(material, 'earth-night', (shader, replace) => {
    shader.uniforms.uSunView = sunView;
    replace(shader, 'fragmentShader', '#include <common>', '#include <common>\nuniform vec3 uSunView;');
    replace(
      shader,
      'fragmentShader',
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
float nightGate = 1.0 - smoothstep( -${glsl(NIGHT.fade)}, ${glsl(NIGHT.fade)}, dot( normal, normalize( uSunView + vViewPosition ) ) );
totalEmissiveRadiance *= nightGate;`,
    );
  });
  return { material, imageMix, sunView };
}

/** City lights' strength on the night side once their map arrives (AC-5), over the 0.1 ambient (D-028). */
export const EARTH_NIGHT_INTENSITY = 1.6;

/**
 * Earth's cloud layer (AC-4): a child of Earth's mesh (so it turns with Earth and takes its drawn size), sharing
 * its sphere, slightly larger, lit, transparent by the cloud map (`alphaMap`). Hidden until the map arrives, then
 * faded in by opacity. Never a pointer target.
 */
export function createCloudLayer(earth: Mesh): Mesh {
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const clouds = new Mesh(earth.geometry, material);
  clouds.name = 'earth-clouds';
  clouds.scale.setScalar(CLOUD_HEIGHT);
  clouds.visible = false;
  clouds.raycast = () => {};
  earth.add(clouds);
  return clouds;
}

/**
 * Saturn's body (AC-8): the rings' shadow. In Saturn's local frame (the unit sphere, ring plane y = 0), a fragment
 * is shaded by the ring opacity where its ray towards the Sun crosses the ring plane between the inner and outer
 * radii, as `ringShadowRadius` (ring-shadows.ts) computes. `sunLocal` is the Sun's direction in Saturn's frame, set
 * each frame; `profile` the rings' radial strip (opacity in alpha), read between `profileU` as the ring mesh does
 * (`profileSpanU`, rings.ts).
 */
export function patchRingShadow(
  material: MeshStandardMaterial,
  rings: { inner: number; outer: number; profile: Texture; profileU: [number, number] },
): { sunLocal: { value: Vector3 }; profile: { value: Texture } } {
  const sunLocal = { value: new Vector3(1, 0, 0) };
  const profile = { value: rings.profile };
  addPatch(material, 'ring-shadow', (shader, replace) => {
    Object.assign(shader.uniforms, {
      uSunLocal: sunLocal,
      uRingProfile: profile,
      uRingProfileU: { value: new Vector2(...rings.profileU) },
      uRingInner: { value: rings.inner },
      uRingOuter: { value: rings.outer },
    });
    replace(shader, 'vertexShader', '#include <common>', '#include <common>\nvarying vec3 vLocalPos;');
    replace(
      shader,
      'vertexShader',
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvLocalPos = position;',
    );
    replace(
      shader,
      'fragmentShader',
      '#include <common>',
      `#include <common>
varying vec3 vLocalPos;
uniform vec3 uSunLocal;
uniform sampler2D uRingProfile;
uniform vec2 uRingProfileU;
uniform float uRingInner;
uniform float uRingOuter;`,
    );
    replace(
      shader,
      'fragmentShader',
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
float ringShade = 0.0;
if ( abs( uSunLocal.y ) > 1e-4 ) {
  float t = -vLocalPos.y / uSunLocal.y;
  if ( t > 0.0 ) {
    float r = length( vLocalPos.xz + t * uSunLocal.xz );
    if ( r > uRingInner && r < uRingOuter ) {
      float along = ( r - uRingInner ) / ( uRingOuter - uRingInner );
      ringShade = texture2D( uRingProfile, vec2( mix( uRingProfileU.x, uRingProfileU.y, along ), 0.5 ) ).a;
    }
  }
}
reflectedLight.directDiffuse *= 1.0 - ringShade;
reflectedLight.directSpecular *= 1.0 - ringShade;`,
    );
  });
  return { sunLocal, profile };
}
