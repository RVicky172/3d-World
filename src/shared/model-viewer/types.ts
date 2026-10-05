type Vec3 = readonly [number, number, number];

/** Licences Constitution IX allows. */
export type AssetLicense = 'CC0-1.0' | 'CC-BY-4.0' | 'Public domain';

/** Where an asset came from (spec 010, AC-13); mirrored by a row in `public/assets/CREDITS.md`. */
export interface AssetCredit {
  /** Under `public/`, e.g. `assets/sheen-chair/SheenChair.glb`. */
  path: string;
  title: string;
  author: string;
  license: AssetLicense;
  source: string;
}

/** Everything a model Space shows, as data (Constitution VII, spec 010 AC-14). */
export interface ModelViewerConfig {
  /** Also the 3D view's accessible label. */
  title: string;
  /** The GLB, relative to the site's base URL. */
  model: { path: string };
  /** Vertical field of view in degrees; `direction` points from the model towards the initial camera. */
  camera: { fov: number; direction: Vec3 };
  /** Share of the smaller viewport dimension the model fills when framed (default 0.75, AC-2). */
  fill?: number;
  /** `speed` is OrbitControls' autoRotateSpeed; `idleDelay` in seconds (spec 004). */
  turntable: { speed: number; idleDelay: number };
  /** Every file the Space loads (AC-13). */
  assets: readonly AssetCredit[];
}
