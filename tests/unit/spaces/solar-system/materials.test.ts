import {
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderLib,
  SphereGeometry,
  UniformsUtils,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { describe, expect, it } from 'vitest';
import {
  addPatch,
  createCloudLayer,
  createEarthMaterial,
  NIGHT,
  nightFactor,
  OCEAN_ROUGHNESS,
  patchRingShadow,
  withImageFade,
} from '../../../../src/spaces/solar-system/materials';

// Spec 022, AC-5: Earth's city lights show only on the night side and fade across the day/night line. The
// shader's gate mirrors `nightFactor` (T040 adds the material tests).

describe('nightFactor (cosine of the Sun’s angle from the surface normal → 0 day … 1 night)', () => {
  it('is 0 on the day side and 1 deep in the night', () => {
    expect(nightFactor(1)).toBe(0);
    expect(nightFactor(0.5)).toBe(0);
    expect(nightFactor(-0.5)).toBe(1);
    expect(nightFactor(-1)).toBe(1);
  });

  it('fades smoothly across the terminator, half-way exactly on it', () => {
    expect(nightFactor(0)).toBeCloseTo(0.5, 12);
    let previous = 0;
    for (let c = NIGHT.fade; c >= -NIGHT.fade; c -= NIGHT.fade / 10) {
      const f = nightFactor(c);
      expect(f).toBeGreaterThanOrEqual(previous);
      previous = f;
    }
    expect(nightFactor(NIGHT.fade)).toBe(0);
    expect(nightFactor(-NIGHT.fade)).toBe(1);
  });

  it('fades over about ±6° of the terminator', () => {
    expect(Math.asin(NIGHT.fade) * (180 / Math.PI)).toBeGreaterThan(3);
    expect(Math.asin(NIGHT.fade) * (180 / Math.PI)).toBeLessThan(10);
  });
});

// Spec 022, T040 (AC-1, AC-4–AC-6, AC-8): the materials' shader patches, driven through three's real shader
// sources (no WebGL), so a renamed chunk in a future three fails here.

/** Runs a material's onBeforeCompile on a copy of three's real shader, as the renderer would. */
const compile = (material: Material, lib: 'standard' | 'basic' = 'standard') => {
  const shader = {
    vertexShader: ShaderLib[lib].vertexShader,
    fragmentShader: ShaderLib[lib].fragmentShader,
    uniforms: UniformsUtils.clone(ShaderLib[lib].uniforms),
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, undefined as never);
  return shader;
};

describe('addPatch', () => {
  it('runs every patch on compile and keys the program by the patch names', () => {
    const material = new MeshStandardMaterial();
    const seen: string[] = [];
    addPatch(material, 'a', () => seen.push('a'));
    addPatch(material, 'b', () => seen.push('b'));
    compile(material);
    expect(seen).toEqual(['a', 'b']);
    expect(material.customProgramCacheKey()).toBe('a|b');
  });

  it('throws when a patch’s anchor is missing (a three upgrade renamed a chunk)', () => {
    const material = new MeshStandardMaterial();
    addPatch(material, 'broken', (shader, replace) =>
      replace(shader, 'fragmentShader', '#include <no_such_chunk>', ''),
    );
    expect(() => compile(material)).toThrow(/broken.*no_such_chunk/);
  });
});

describe('withImageFade (AC-1, AC-11)', () => {
  it('mixes the body colour towards the image by a uniform starting at 0, for standard and basic materials', () => {
    for (const [material, lib] of [
      [new MeshStandardMaterial(), 'standard'],
      [new MeshBasicMaterial(), 'basic'],
    ] as const) {
      const mix = withImageFade(material);
      expect(mix.value).toBe(0);
      const shader = compile(material, lib);
      expect(shader.uniforms.uImageMix).toBe(mix);
      expect(shader.fragmentShader).toContain('mix( diffuseColor.rgb, sampledDiffuseColor.rgb, uImageMix )');
      expect(shader.fragmentShader).not.toContain('diffuseColor *= sampledDiffuseColor;');
    }
  });
});

describe('createEarthMaterial (AC-4–AC-6)', () => {
  it('reads roughness from the ocean mask: water shiny, land matte', () => {
    const { material } = createEarthMaterial(0x3d6fb6);
    const shader = compile(material);
    expect(shader.fragmentShader).toContain(
      `mix( 1.0, ${OCEAN_ROUGHNESS.toFixed(2)}, texture2D( roughnessMap, vRoughnessMapUv ).g )`,
    );
    expect(material.metalness).toBe(0);
    expect(OCEAN_ROUGHNESS).toBeLessThan(0.6);
  });

  it('gates the night lights by the night factor towards the Sun (uniform set per frame)', () => {
    const { material, sunView } = createEarthMaterial(0x3d6fb6);
    const shader = compile(material);
    expect(shader.uniforms.uSunView).toBe(sunView);
    expect(shader.fragmentShader).toContain(
      `1.0 - smoothstep( -${NIGHT.fade.toFixed(2)}, ${NIGHT.fade.toFixed(2)}`,
    );
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance *= nightGate');
    expect(material.emissive.getHex()).toBe(0xffffff);
  });

  it('fades its day map in too, and shares one program across Earth materials', () => {
    const a = createEarthMaterial(0x3d6fb6);
    const b = createEarthMaterial(0x3d6fb6);
    expect(compile(a.material).uniforms.uImageMix).toBe(a.imageMix);
    expect(a.material.customProgramCacheKey()).toBe(b.material.customProgramCacheKey());
  });
});

describe('createCloudLayer (AC-4)', () => {
  it('is a lit, transparent child sphere just above the surface that writes no depth and starts invisible', () => {
    const earth = new Mesh(new SphereGeometry(1, 8, 4), new MeshStandardMaterial());
    const clouds = createCloudLayer(earth);
    expect(clouds.parent).toBe(earth);
    expect(clouds.geometry).toBe(earth.geometry);
    expect(clouds.scale.x).toBeCloseTo(1.006, 9);
    const material = clouds.material as MeshStandardMaterial;
    expect(material).toBeInstanceOf(MeshStandardMaterial);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.opacity).toBe(0); // fades in when its image arrives
    expect(clouds.visible).toBe(false);
    expect(() => clouds.raycast(undefined as never, [])).not.toThrow();
  });
});

describe('patchRingShadow (AC-8)', () => {
  it('darkens Saturn where its ray to the Sun crosses the rings, in Saturn’s local frame', () => {
    const material = new MeshStandardMaterial();
    const profile = new DataTexture(new Uint8Array([255, 255, 255, 153]), 1, 1);
    const uniforms = patchRingShadow(material, {
      inner: 1.279,
      outer: 2.349,
      profile,
      profileU: [0.069, 0.93],
    });
    const shader = compile(material);
    expect(shader.uniforms.uSunLocal).toBe(uniforms.sunLocal);
    expect(shader.uniforms.uRingProfile!.value).toBe(profile);
    expect(shader.uniforms.uRingInner!.value).toBe(1.279);
    expect(shader.uniforms.uRingProfileU!.value.toArray()).toEqual([0.069, 0.93]); // same mapping as the ring mesh
    expect(shader.vertexShader).toContain('vLocalPos = position;');
    expect(shader.fragmentShader).toContain('-vLocalPos.y / uSunLocal.y');
    expect(shader.fragmentShader).toContain('reflectedLight.directDiffuse *= 1.0 - ringShade');
  });
});
