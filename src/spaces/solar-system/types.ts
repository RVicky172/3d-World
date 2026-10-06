/** Which scale the Space draws (spec 020, AC-5/AC-6). */
export type ScaleMode = 'stylised' | 'real';

/**
 * Orbital elements as the source gives them (spec 020, AC-2), complete enough for 021 to compute motion.
 * Planets: JPL approximate elements, mean ecliptic and equinox of J2000. Moons: JPL mean elements.
 */
export interface OrbitalElements {
  semiMajorAxisKm: number;
  /** Sidereal. */
  periodDays: number;
  eccentricity: number;
  /** Planets: to the ecliptic. Moons: to `plane`. */
  inclinationDeg: number;
  ascendingNodeDeg: number;
  /** Planets (ϖ). */
  perihelionLongitudeDeg?: number;
  /** Planets (L), at the epoch. */
  meanLongitudeDeg?: number;
  /** Moons (ω). */
  periapsisArgumentDeg?: number;
  /** Moons (M), at the epoch. */
  meanAnomalyDeg?: number;
  /** Reference plane of the angles. */
  plane: 'ecliptic' | 'laplace';
  epoch: 'J2000';
  /** Planets: how each element changes per Julian century (JPL Table 1, valid 1800–2050). */
  ratesPerCentury?: ElementRates;
  /** Moons: years for the periapsis to advance a full turn (0 = none given). */
  apsisPeriodYears?: number;
  /** Moons: years for the node to regress a full turn (0 = none given). */
  nodePeriodYears?: number;
}

/** Per Julian century (JPL Table 1). */
export interface ElementRates {
  semiMajorAxisKm: number;
  eccentricity: number;
  inclinationDeg: number;
  meanLongitudeDeg: number;
  perihelionLongitudeDeg: number;
  ascendingNodeDeg: number;
}

/**
 * Spin, from NAIF's PCK (IAU): the north pole in J2000 equatorial coordinates and the prime meridian angle
 * `W = W0 + Ẇ·d` (d = days since J2000). A negative Ẇ is a backwards spin. Only the constant and linear terms
 * are kept (NAIF's small precession terms for Neptune, Triton, the Moon and the Galileans are left out).
 */
export interface Rotation {
  /** [value, change per Julian century], degrees. */
  poleRaDeg: [number, number];
  poleDecDeg: [number, number];
  /** [W0, Ẇ per day], degrees. */
  primeMeridianDeg: [number, number];
}

/**
 * A map in `public/assets/solar-system/` (spec 022, D-031): KTX2, equirectangular, east to the right. The fetch
 * script brings every source to 0° longitude at the centre, so `leftEdgeLongitudeDeg` is −180 for all of them.
 */
export interface Imagery {
  file: string;
  leftEdgeLongitudeDeg: number;
  /** File size, for download progress; a unit test checks it against the file. */
  bytes: number;
}

/** Saturn's rings (spec 022, AC-7): sourced radii from the planet's centre, and a radial colour/opacity strip. */
export interface Rings {
  innerKm: number;
  outerKm: number;
  /**
   * A radial colour/opacity strip spanning `spanKm` from Saturn's centre (left → right), wider than the ring band:
   * calibrated in 022 T041 by fitting the C ring's inner edge, the Cassini Division and the A ring's outer edge.
   */
  profile: Imagery & { spanKm: [number, number] };
}

export interface BodyData {
  /** Kebab-case, unique. */
  id: string;
  name: string;
  kind: 'star' | 'planet' | 'moon';
  /** Null only for the Sun. */
  parent: string | null;
  /** Volumetric mean radius. */
  radiusKm: number;
  /** Standard gravitational parameter, for the Kepler check (AC-3). */
  gmKm3s2: number;
  /** Sidereal, always positive (IAU): a backwards spin shows as `axialTiltDeg` > 90. */
  rotationHours: number;
  /** To the body's own orbit (the Sun: to the ecliptic), 0–180. */
  axialTiltDeg: number;
  /** Null only for the Sun. */
  orbit: OrbitalElements | null;
  /** Representative colour until 022's textures. */
  colour: number;
  /** Spin axis and phase (021). */
  rotation: Rotation;
  /** Fixed angle on its orbit until 021 adds motion (Q1), in degrees, 0–360. */
  displayAngleDeg: number;
  /** Surface map (022). */
  imagery: Imagery;
  /** Earth only (022, Q4): clouds (alpha), night lights (emissive), ocean mask (roughness). */
  layers?: { clouds: Imagery; night: Imagery; ocean: Imagery };
  /** Saturn only (022, Q5). */
  rings?: Rings;
}

/** Where a value came from (AC-4). `covers` names the kinds of data it supplies. */
export interface DataSource {
  name: string;
  url: string;
  licence: string;
  /** ISO date the values were read. */
  read: string;
  covers: Array<
    'physical' | 'planet-orbits' | 'moon-orbits' | 'rotation' | 'imagery' | 'rings' | 'stars' | 'facts'
  >;
}

/**
 * What a body's facts card adds to its `BodyData` (spec 023, AC-13): text and moon counts only. Every number the
 * card shows besides the moon count is derived from `BodyData` (`facts.ts`), so nothing is stored twice.
 */
export interface BodyFacts {
  /** One or two plain sentences. */
  description: string;
  /** Planets only: moons known on `asOf` (an ISO date). */
  knownMoons?: { count: number; asOf: string };
}

/** Per body, in scene units: distance from its parent's centre, and display radius. */
export interface BodyLayout {
  distance: number;
  radius: number;
}
