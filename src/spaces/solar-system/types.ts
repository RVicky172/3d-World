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
  /** Fixed angle on its orbit until 021 adds motion (Q1), in degrees, 0–360. */
  displayAngleDeg: number;
}

/** Where a value came from (AC-4). `covers` names the kinds of data it supplies. */
export interface DataSource {
  name: string;
  url: string;
  licence: string;
  /** ISO date the values were read. */
  read: string;
  covers: Array<'physical' | 'planet-orbits' | 'moon-orbits'>;
}

/** Per body, in scene units: distance from its parent's centre, and display radius. */
export interface BodyLayout {
  distance: number;
  radius: number;
}
