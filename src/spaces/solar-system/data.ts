import type { BodyData, DataSource } from './types';

/**
 * The Sun, the eight planets and the seven moons with a radius ≥ 1 000 km (spec 020, D-022), as data
 * (Constitution VII). Values are copied from the sources below as given there; the helpers only convert units,
 * so the source digits stay visible. Nothing is fetched at runtime.
 *
 * Conventions:
 * - Rotation periods are sidereal and positive; a backwards spin shows as an axial tilt over 90° (IAU), so
 *   Venus is 177.3° and Uranus 97.77°.
 * - The large moons rotate synchronously, so their rotation period is their orbital period, and their tilt to
 *   their orbit is ≈ 0 (Horizons gives no value).
 */

/** Real scale (AC-6): kilometres per scene unit, for every radius and distance. */
export const REAL_UNIT_KM = 1e6;

/**
 * Stylised scale (AC-5, plan). Radii: `(r / R(unitBody)) ^ radiusExponent` units, the Sun capped at `sunRadius`.
 * Moons sit on rings `moonGap` apart by their true order. Planets sit on packed rings `ringGap` apart, plus
 * `logSpacing · ln(aᵢ / aᵢ₋₁)` so wider true gaps stay wider. Tuned so every body is ≥ 3 px at the
 * 1280 × 720 home view (unit-tested).
 */
export const STYLISED = {
  unitBody: 'earth',
  radiusExponent: 0.25,
  sunRadius: 3,
  ringGap: 0.6,
  moonGap: 0.25,
  logSpacing: 1.5,
};

/**
 * The view (spec 020). The home camera looks down at the Sun from `direction`, ~35° from straight up, so sunlit
 * hemispheres show; it frames the whole system at `fill` of the smaller viewport dimension.
 */
export const SOLAR_SYSTEM = {
  title: 'Solar System',
  camera: {
    fov: 40,
    direction: [0, Math.cos((35 * Math.PI) / 180), Math.sin((35 * Math.PI) / 180)] as const,
    fill: 0.85,
  },
  turntable: { speed: 0.5, idleDelay: 4 },
  /**
   * The Sun's point light (no fall-off) and a faint ambient, so night sides aren't pure black (AC-10). 021: 0.1, not
   * 0.03, so a planet seen against black on its night side (near "new" phase) still shows (020 AC-5, D-028).
   */
  light: { sun: 3, ambient: 0.1 },
};

/** IAU 2012 astronomical unit, km. */
const AU_KM = 149_597_870.7;
const au = (value: number) => value * AU_KM;
/** Julian years, as JPL gives sidereal orbital periods. */
const years = (value: number) => value * 365.25;
const days = (value: number) => value * 24;
const hms = (h: number, m: number, s: number) => h + m / 60 + s / 3600;
const arcmin = (value: number) => value / 60;
/** NAIF PCK: pole RA and Dec [value, per century], prime meridian [W0, per day]; degrees. */
const spin = (ra: [number, number], dec: [number, number], pm: [number, number]) => ({
  poleRaDeg: ra,
  poleDecDeg: dec,
  primeMeridianDeg: pm,
});

export const SOURCES: readonly DataSource[] = [
  {
    name: 'JPL Horizons, physical data of each body (radius, GM, rotation, obliquity)',
    url: 'https://ssd.jpl.nasa.gov/api/horizons.api',
    licence: 'Public domain (NASA/JPL, US government work)',
    read: '2026-10-05',
    covers: ['physical'],
  },
  {
    name: 'JPL Solar System Dynamics, Planetary Physical Parameters (sidereal orbital and rotation periods)',
    url: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
    licence: 'Public domain (NASA/JPL, US government work)',
    read: '2026-10-05',
    covers: ['physical', 'planet-orbits'],
  },
  {
    name: 'JPL Solar System Dynamics, Approximate Positions of the Planets, Table 1 (J2000 values and rates per century, 1800–2050 AD)',
    url: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
    licence: 'Public domain (NASA/JPL, US government work)',
    read: '2026-10-05',
    covers: ['planet-orbits'],
  },
  {
    name: 'NAIF PCK pck00011.tpc (IAU WGCCRE 2015): poles and prime meridians',
    url: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc',
    licence: 'Public domain (NASA/JPL, US government work)',
    read: '2026-10-05',
    covers: ['rotation'],
  },
  {
    name: 'JPL Solar System Dynamics, Planetary Satellite Mean Elements',
    url: 'https://ssd.jpl.nasa.gov/sats/elem/sep.html',
    licence: 'Public domain (NASA/JPL, US government work)',
    read: '2026-10-05',
    covers: ['moon-orbits'],
  },
];

/** JPL Table 1 rates per century, in the table's order (a in au/Cy, e, I, L, ϖ, Ω in deg/Cy). */
type Rates = [number, number, number, number, number, number];

const planetOrbit = (
  a: number,
  e: number,
  i: number,
  meanLongitude: number,
  perihelionLongitude: number,
  node: number,
  periodYears: number,
  [da, de, di, dL, dw, dO]: Rates,
) =>
  ({
    semiMajorAxisKm: au(a),
    periodDays: years(periodYears),
    eccentricity: e,
    inclinationDeg: i,
    ascendingNodeDeg: node,
    perihelionLongitudeDeg: perihelionLongitude,
    meanLongitudeDeg: meanLongitude,
    plane: 'ecliptic',
    epoch: 'J2000',
    ratesPerCentury: {
      semiMajorAxisKm: au(da),
      eccentricity: de,
      inclinationDeg: di,
      meanLongitudeDeg: dL,
      perihelionLongitudeDeg: dw,
      ascendingNodeDeg: dO,
    },
  }) as const;

const moonOrbit = (
  aKm: number,
  e: number,
  argPeriapsis: number,
  meanAnomaly: number,
  i: number,
  node: number,
  periodDays: number,
  [apsisPeriodYears, nodePeriodYears]: [number, number],
  plane: 'ecliptic' | 'laplace' = 'laplace',
) =>
  ({
    semiMajorAxisKm: aKm,
    periodDays,
    eccentricity: e,
    inclinationDeg: i,
    ascendingNodeDeg: node,
    periapsisArgumentDeg: argPeriapsis,
    meanAnomalyDeg: meanAnomaly,
    plane,
    epoch: 'J2000',
    apsisPeriodYears,
    nodePeriodYears,
  }) as const;

export const BODIES: readonly BodyData[] = [
  {
    id: 'sun',
    name: 'Sun',
    kind: 'star',
    parent: null,
    radiusKm: 695_700,
    gmKm3s2: 132_712_440_041.93938,
    rotationHours: days(25.38),
    axialTiltDeg: 7.25,
    orbit: null,
    colour: 0xffcc66,
    rotation: spin([286.13, 0], [63.87, 0], [84.176, 14.1844]),
    displayAngleDeg: 0,
  },
  // Planets: physical data from Horizons; orbits a, e, I, L, ϖ, Ω from Table 1; periods from phys_par.
  {
    id: 'mercury',
    name: 'Mercury',
    kind: 'planet',
    parent: 'sun',
    radiusKm: 2439.4,
    gmKm3s2: 22_031.86855,
    rotationHours: days(58.6463),
    axialTiltDeg: arcmin(2.11),
    orbit: planetOrbit(
      0.38709927,
      0.20563593,
      7.00497902,
      252.2503235,
      77.45779628,
      48.33076593,
      0.2408467,
      [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    ),
    colour: 0x9a8f86,
    rotation: spin([281.0103, -0.0328], [61.4155, -0.0049], [329.5988, 6.1385108]),
    displayAngleDeg: 25,
  },
  {
    id: 'venus',
    name: 'Venus',
    kind: 'planet',
    parent: 'sun',
    radiusKm: 6051.84,
    gmKm3s2: 324_858.592,
    rotationHours: days(243.018484),
    axialTiltDeg: 177.3,
    orbit: planetOrbit(
      0.72333566,
      0.00677672,
      3.39467605,
      181.9790995,
      131.60246718,
      76.67984255,
      0.61519726,
      [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
    ),
    colour: 0xd9b77a,
    rotation: spin([272.76, 0], [67.16, 0], [160.2, -1.4813688]),
    displayAngleDeg: 130,
  },
  {
    id: 'earth',
    name: 'Earth',
    kind: 'planet',
    parent: 'sun',
    radiusKm: 6371.01,
    gmKm3s2: 398_600.435436,
    rotationHours: days(0.99726968),
    axialTiltDeg: 23.4392911,
    // Table 1 gives the Earth–Moon barycentre.
    orbit: planetOrbit(
      1.00000261,
      0.01671123,
      -0.00001531,
      100.46457166,
      102.93768193,
      0,
      1.0000174,
      [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
    ),
    colour: 0x3d6fb6,
    rotation: spin([0, -0.641], [90, -0.557], [190.147, 360.9856235]),
    displayAngleDeg: 215,
  },
  {
    id: 'mars',
    name: 'Mars',
    kind: 'planet',
    parent: 'sun',
    radiusKm: 3389.92,
    gmKm3s2: 42_828.375662,
    rotationHours: 24.622962,
    axialTiltDeg: 25.19,
    orbit: planetOrbit(
      1.52371034,
      0.0933941,
      1.84969142,
      -4.55343205,
      -23.94362959,
      49.55953891,
      1.8808476,
      [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    ),
    colour: 0xb5532e,
    // NAIF's Mars pole has a ~71 000-year term (79.398797° + 0.5042615°/century) of 0.419057° in RA (sin) and
    // 1.591274° in Dec (cos): constant over 1800–2050, so it is folded in at J2000 (317.269202 → 317.681106,
    // 54.432516 → 52.886346, matching IAU 2009). Without it the tilt to the orbit came out 1.3° off (021 T010).
    rotation: spin([317.681106, -0.10927547], [52.886346, -0.05827105], [176.049863, 350.891982443297]),
    displayAngleDeg: 300,
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    kind: 'planet',
    parent: 'sun',
    radiusKm: 69_911,
    gmKm3s2: 126_686_531.9,
    rotationHours: hms(9, 55, 29.711),
    axialTiltDeg: 3.13,
    orbit: planetOrbit(
      5.202887,
      0.04838624,
      1.30439695,
      34.39644051,
      14.72847983,
      100.47390909,
      11.862615,
      [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    ),
    colour: 0xc9a77c,
    rotation: spin([268.056595, -0.006499], [64.495303, 0.002413], [284.95, 870.536]),
    displayAngleDeg: 40,
  },
  {
    id: 'saturn',
    name: 'Saturn',
    kind: 'planet',
    parent: 'sun',
    radiusKm: 58_232,
    gmKm3s2: 37_931_206.234,
    rotationHours: hms(10, 39, 22.4),
    axialTiltDeg: 26.73,
    orbit: planetOrbit(
      9.53667594,
      0.05386179,
      2.48599187,
      49.95424423,
      92.59887831,
      113.66242448,
      29.447498,
      [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    ),
    colour: 0xd8c48c,
    rotation: spin([40.589, -0.036], [83.537, -0.004], [38.9, 810.7939024]),
    displayAngleDeg: 160,
  },
  {
    id: 'uranus',
    name: 'Uranus',
    kind: 'planet',
    parent: 'sun',
    radiusKm: 25_362,
    gmKm3s2: 5_793_950.6103,
    rotationHours: 17.24,
    axialTiltDeg: 97.77,
    orbit: planetOrbit(
      19.18916464,
      0.04725744,
      0.77263783,
      313.23810451,
      170.9542763,
      74.01692503,
      84.016846,
      [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
    ),
    colour: 0x9fd3db,
    rotation: spin([257.311, 0], [-15.175, 0], [203.81, -501.1600928]),
    displayAngleDeg: 250,
  },
  {
    id: 'neptune',
    name: 'Neptune',
    kind: 'planet',
    parent: 'sun',
    radiusKm: 24_624,
    gmKm3s2: 6_835_099.97,
    rotationHours: 16.11,
    axialTiltDeg: 28.32,
    orbit: planetOrbit(
      30.06992276,
      0.00859048,
      1.77004347,
      -55.12002969,
      44.96476227,
      131.78422574,
      164.79132,
      [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
    ),
    colour: 0x4a6fd6,
    rotation: spin([299.36, 0], [43.46, 0], [249.978, 541.1397757]),
    displayAngleDeg: 335,
  },
  // Moons: physical data from Horizons; orbits a, e, ω, M, i, Ω, P from the mean elements (epoch J2000).
  {
    id: 'moon',
    name: 'Moon',
    kind: 'moon',
    parent: 'earth',
    radiusKm: 1737.4,
    gmKm3s2: 4902.800066,
    rotationHours: days(27.321582),
    axialTiltDeg: 6.67,
    orbit: moonOrbit(384_400, 0.0554, 318.15, 135.27, 5.16, 125.08, 27.322, [5.997, 18.6], 'ecliptic'),
    colour: 0xb8b8b8,
    rotation: spin([269.9949, 0.0031], [66.5392, 0.013], [38.3213, 13.17635815]),
    displayAngleDeg: 60,
  },
  {
    id: 'io',
    name: 'Io',
    kind: 'moon',
    parent: 'jupiter',
    radiusKm: 1821.49,
    gmKm3s2: 5959.9155,
    rotationHours: days(1.762732),
    axialTiltDeg: 0,
    orbit: moonOrbit(421_800, 0.004, 49.1, 330.9, 0, 0, 1.762732, [1.333, 0]),
    colour: 0xe8d46a,
    rotation: spin([268.05, -0.009], [64.5, 0.003], [200.39, 203.4889538]),
    displayAngleDeg: 0,
  },
  {
    id: 'europa',
    name: 'Europa',
    kind: 'moon',
    parent: 'jupiter',
    radiusKm: 1560.8,
    gmKm3s2: 3202.7121,
    rotationHours: days(3.525463),
    axialTiltDeg: 0,
    orbit: moonOrbit(671_100, 0.009, 45, 345.4, 0.5, 184, 3.525463, [1.394, 30.202]),
    colour: 0xcfc2a8,
    rotation: spin([268.08, -0.009], [64.51, 0.003], [36.022, 101.3747235]),
    displayAngleDeg: 90,
  },
  {
    id: 'ganymede',
    name: 'Ganymede',
    kind: 'moon',
    parent: 'jupiter',
    radiusKm: 2631.2,
    gmKm3s2: 9887.8328,
    rotationHours: days(7.155588),
    axialTiltDeg: 0,
    orbit: moonOrbit(1_070_400, 0.001, 198.3, 324.8, 0.2, 58.5, 7.155588, [68.301, 137.812]),
    colour: 0x9c9286,
    rotation: spin([268.2, -0.009], [64.57, 0.003], [44.064, 50.3176081]),
    displayAngleDeg: 180,
  },
  {
    id: 'callisto',
    name: 'Callisto',
    kind: 'moon',
    parent: 'jupiter',
    radiusKm: 2410.3,
    gmKm3s2: 7179.2834,
    rotationHours: days(16.69044),
    axialTiltDeg: 0,
    orbit: moonOrbit(1_882_700, 0.007, 43.8, 87.4, 0.3, 309.1, 16.69044, [277.921, 577.264]),
    colour: 0x6e655c,
    rotation: spin([268.72, -0.009], [64.83, 0.003], [259.51, 21.5710715]),
    displayAngleDeg: 270,
  },
  {
    id: 'titan',
    name: 'Titan',
    kind: 'moon',
    parent: 'saturn',
    radiusKm: 2575.5,
    gmKm3s2: 8978.14,
    rotationHours: days(15.945448),
    axialTiltDeg: 0,
    // M: 213.3°, fitted to Horizons' J2000 vector (D-026); the table's 11.7° is ~150° out of phase with Horizons
    // (osculating M 163.4° at J2000).
    orbit: moonOrbit(1_221_900, 0.029, 78.3, 213.3, 0.3, 78.6, 15.945448, [346.68, 687.37]),
    colour: 0xd4a95a,
    rotation: spin([39.4827, 0], [83.4279, 0], [186.5855, 22.5769768]),
    displayAngleDeg: 45,
  },
  {
    id: 'triton',
    name: 'Triton',
    kind: 'moon',
    parent: 'neptune',
    radiusKm: 1352.6,
    gmKm3s2: 1428.495,
    rotationHours: days(5.876994),
    axialTiltDeg: 0,
    // Retrograde orbit: inclination 157.3° to Neptune's Laplace plane.
    orbit: moonOrbit(354_800, 0, 0, 63, 157.3, 178.1, 5.876994, [0, 340.379]),
    colour: 0xc9b8b2,
    rotation: spin([299.36, 0], [41.17, 0], [296.53, -61.2572637]),
    displayAngleDeg: 225,
  },
];
