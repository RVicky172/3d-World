import type { BodyData, OrbitalElements } from './types';

/** An output vector: a three `Vector3` or a plain object (three's `Vector3Like` is read-only). */
export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

/** An output rotation: a three `Quaternion` or a plain object. */
export interface QuaternionLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Where each body is and how it is turned on a date (spec 021, AC-1–AC-4). Pure, double precision, and
 * allocation-free: every function writes into an `out` parameter. `days` is days since J2000 (see `time.ts`).
 *
 * Frames: positions are in the ecliptic and mean equinox of J2000, in km (planets about the Sun, moons about their
 * planet), as JPL gives them. `toScene` maps them onto the scene axes (020's XZ ecliptic plane, y up).
 */

const RAD = Math.PI / 180;
const DAYS_PER_CENTURY = 36_525;
const DAYS_PER_YEAR = 365.25;
/** The J2000 obliquity of the ecliptic (IAU 1976), as in the data's Earth tilt. */
const OBLIQUITY = 23.4392911 * RAD;
const COS_E = Math.cos(OBLIQUITY);
const SIN_E = Math.sin(OBLIQUITY);

/** Kepler's equation `E − e sin E = M` by Newton, from `E = M`; converges to 1e-12 in ≤ 6 steps for e < 0.21. */
export function eccentricAnomaly(meanAnomaly: number, e: number): number {
  let E = meanAnomaly + e * Math.sin(meanAnomaly);
  for (let i = 0; i < 8; i++) {
    const step = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
    E -= step;
    if (Math.abs(step) < 1e-12) break;
  }
  return E;
}

// Scratch state, reused so no call allocates.
const basis = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, wx: 0, wy: 0, wz: 0 };
const pole = { x: 0, y: 0, z: 0 };
const node = { x: 0, y: 0, z: 0 };
const plane = { x: 0, y: 0, z: 0 };

/**
 * The perifocal basis (P to periapsis, Q 90° ahead, W the orbit normal) for argument of periapsis ω, inclination I
 * and node Ω, in the frame the angles are measured in (radians).
 */
function setBasis(w: number, i: number, o: number): void {
  const [cw, sw, ci, si, co, so] = [
    Math.cos(w),
    Math.sin(w),
    Math.cos(i),
    Math.sin(i),
    Math.cos(o),
    Math.sin(o),
  ];
  basis.px = cw * co - sw * so * ci;
  basis.py = cw * so + sw * co * ci;
  basis.pz = sw * si;
  basis.qx = -sw * co - cw * so * ci;
  basis.qy = -sw * so + cw * co * ci;
  basis.qz = cw * si;
  basis.wx = so * si;
  basis.wy = -co * si;
  basis.wz = ci;
}

/** In-plane position on an ellipse (a, e) at mean anomaly M (radians), along `basis`. */
function onEllipse(a: number, e: number, M: number, out: Vector3Like): Vector3Like {
  const E = eccentricAnomaly(M, e);
  const x = a * (Math.cos(E) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  out.x = x * basis.px + y * basis.qx;
  out.y = x * basis.py + y * basis.qy;
  out.z = x * basis.pz + y * basis.qz;
  return out;
}

/** J2000 equatorial → ecliptic, in place. */
function equatorialToEcliptic(v: Vector3Like): Vector3Like {
  const { y, z } = v;
  v.y = y * COS_E + z * SIN_E;
  v.z = -y * SIN_E + z * COS_E;
  return v;
}

/** A body's north pole (IAU) on a date, as a unit vector in J2000 equatorial coordinates. */
function equatorialPole(body: BodyData, days: number, out: Vector3Like): Vector3Like {
  const T = days / DAYS_PER_CENTURY;
  const { poleRaDeg, poleDecDeg } = body.rotation;
  const ra = (poleRaDeg[0] + poleRaDeg[1] * T) * RAD;
  const dec = (poleDecDeg[0] + poleDecDeg[1] * T) * RAD;
  out.x = Math.cos(dec) * Math.cos(ra);
  out.y = Math.cos(dec) * Math.sin(ra);
  out.z = Math.sin(dec);
  return out;
}

/**
 * The ascending node of a body's equator on the J2000 equator, the origin of its prime meridian angle W: by the IAU
 * definition at right ascension α₀ + 90° (unit, J2000 equatorial). Not derived from the pole vector: Earth's linear
 * pole model passes Dec 90° at J2000 (Dec = 90° − 0.557°·T), and the vector's x/y flip before it, which turned
 * Earth's spin phase 180° for every date before 2000 (found in 022 T021).
 */
function equatorNode(body: BodyData, days: number, out: Vector3Like): Vector3Like {
  const ra = (body.rotation.poleRaDeg[0] + body.rotation.poleRaDeg[1] * (days / DAYS_PER_CENTURY)) * RAD;
  return set(out, -Math.sin(ra), Math.cos(ra), 0);
}

/** A planet's elements on a date: J2000 values plus rates (JPL Table 1). */
function planetElement(
  orbit: OrbitalElements,
  key: keyof NonNullable<OrbitalElements['ratesPerCentury']>,
  T: number,
) {
  const base = {
    semiMajorAxisKm: orbit.semiMajorAxisKm,
    eccentricity: orbit.eccentricity,
    inclinationDeg: orbit.inclinationDeg,
    meanLongitudeDeg: orbit.meanLongitudeDeg ?? 0,
    perihelionLongitudeDeg: orbit.perihelionLongitudeDeg ?? 0,
    ascendingNodeDeg: orbit.ascendingNodeDeg,
  }[key];
  return base + (orbit.ratesPerCentury?.[key] ?? 0) * T;
}

/**
 * Heliocentric ecliptic J2000 position of a planet, km (AC-1, AC-2). `meanAnomaly` (radians) overrides the date's,
 * to trace the orbit the elements of `days` describe (orbit lines).
 */
export function planetPosition(
  body: BodyData,
  days: number,
  out: Vector3Like,
  meanAnomaly?: number,
): Vector3Like {
  const orbit = body.orbit;
  if (!orbit) return set(out, 0, 0, 0);
  const T = days / DAYS_PER_CENTURY;
  const a = planetElement(orbit, 'semiMajorAxisKm', T);
  const e = planetElement(orbit, 'eccentricity', T);
  const I = planetElement(orbit, 'inclinationDeg', T);
  const L = planetElement(orbit, 'meanLongitudeDeg', T);
  const varpi = planetElement(orbit, 'perihelionLongitudeDeg', T);
  const O = planetElement(orbit, 'ascendingNodeDeg', T);
  setBasis((varpi - O) * RAD, I * RAD, O * RAD);
  return onEllipse(a, e, meanAnomaly ?? (L - varpi) * RAD, out);
}

/**
 * Planetocentric ecliptic J2000 position of a moon, km (AC-3). JPL mean elements, corrected as measured against
 * Horizons (D-026):
 * - the moon goes round at its true mean motion `n`: its NAIF synchronous spin rate |Ẇ| (the table's P drifts the
 *   Galileans up to 175° over 1800–2050);
 * - the argument of periapsis advances at 360°/Papsis; the node turns at 360°/Pnode, regressing on a prograde orbit
 *   and advancing on a retrograde one (Triton), as Ω̇ ∝ −cos i; the argument of latitude advances at `n ∓ Ω̇`
 *   (mean longitude Ω ± (ω + M), the sign of cos i).
 * Laplace-plane angles are taken on the planet's equator, with the node measured from the equator's ascending node
 * on the J2000 equator (the table's convention). `meanAnomaly` (radians) overrides the date's, as for planets.
 */
export function moonPosition(
  moon: BodyData,
  planet: BodyData,
  days: number,
  out: Vector3Like,
  meanAnomaly?: number,
): Vector3Like {
  const orbit = moon.orbit;
  if (!orbit) return set(out, 0, 0, 0);
  setMoonBasis(moon, planet, days);
  const M = meanAnomaly ?? ((orbit.meanAnomalyDeg ?? 0) + meanAnomalyRate(moon) * days) * RAD;
  onEllipse(orbit.semiMajorAxisKm, orbit.eccentricity, M, out);
  return toEcliptic(orbit, out);
}

/** The moon's orbit normal (prograde sense) in ecliptic J2000, unit. */
function moonNormal(moon: BodyData, planet: BodyData, days: number, out: Vector3Like): Vector3Like {
  setMoonBasis(moon, planet, days);
  set(out, basis.wx, basis.wy, basis.wz);
  return toEcliptic(moon.orbit!, out);
}

/** Degrees per day. */
const meanAnomalyRate = (moon: BodyData) => {
  const orbit = moon.orbit!;
  const n = Math.abs(moon.rotation.primeMeridianDeg[1]);
  return n - apsisRate(orbit) - nodeRate(orbit) * Math.sign(Math.cos(orbit.inclinationDeg * RAD));
};
const apsisRate = (orbit: OrbitalElements) =>
  orbit.apsisPeriodYears ? 360 / (orbit.apsisPeriodYears * DAYS_PER_YEAR) : 0;
const nodeRate = (orbit: OrbitalElements) =>
  orbit.nodePeriodYears
    ? (-Math.sign(Math.cos(orbit.inclinationDeg * RAD)) * 360) / (orbit.nodePeriodYears * DAYS_PER_YEAR)
    : 0;

/** `basis` for a moon on a date, in its reference frame (the ecliptic, or the planet's equatorial frame). */
function setMoonBasis(moon: BodyData, planet: BodyData, days: number): void {
  const orbit = moon.orbit!;
  const w = (orbit.periapsisArgumentDeg ?? 0) + apsisRate(orbit) * days;
  const o = orbit.ascendingNodeDeg + nodeRate(orbit) * days;
  setBasis(w * RAD, orbit.inclinationDeg * RAD, o * RAD);
  if (orbit.plane === 'laplace') {
    // Frame of the planet's equator: x at its ascending node on the J2000 equator, z along the pole.
    equatorialPole(planet, days, pole);
    equatorNode(planet, days, node);
    set(
      plane,
      pole.y * node.z - pole.z * node.y,
      pole.z * node.x - pole.x * node.z,
      pole.x * node.y - pole.y * node.x,
    );
  }
}

/** From the moon's reference frame to ecliptic J2000, in place. */
function toEcliptic(orbit: OrbitalElements, v: Vector3Like): Vector3Like {
  if (orbit.plane === 'ecliptic') return v;
  const { x, y, z } = v;
  set(
    v,
    x * node.x + y * plane.x + z * pole.x,
    x * node.y + y * plane.y + z * pole.y,
    x * node.z + y * plane.z + z * pole.z,
  );
  return equatorialToEcliptic(v);
}

/** Ecliptic (x to the equinox, z to the ecliptic north) → scene (x, y up, z = −ecliptic y), in place. */
export function toScene(v: Vector3Like): Vector3Like {
  const { y, z } = v;
  v.y = z;
  v.z = -y;
  return v;
}

const axisX = { x: 0, y: 0, z: 0 };
const axisY = { x: 0, y: 0, z: 0 };
const axisZ = { x: 0, y: 0, z: 0 };
const scratch = { x: 0, y: 0, z: 0 };

/**
 * A body's orientation in scene axes on a date (AC-4): local +Y along its north pole (IAU), local +X at its prime
 * meridian, turned by `W = W0 + Ẇ·d` (a negative Ẇ turns it backwards, as for Venus and Uranus).
 * - **Fast spin (Q6):** above one turn per real second at `speedDaysPerSecond`, the body holds `W = W0`.
 * - **Moons** keep one face to their planet at any speed: +Y along the orbit normal, +X towards the planet.
 *   Their `planet` is required.
 */
export function orientation(
  body: BodyData,
  days: number,
  speedDaysPerSecond: number,
  out: QuaternionLike,
  planet?: BodyData,
): QuaternionLike {
  if (body.kind === 'moon') {
    if (!planet) throw new Error(`orientation of ${body.id} needs its planet`);
    moonNormal(body, planet, days, axisY);
    moonPosition(body, planet, days, axisX);
    const len = Math.hypot(axisX.x, axisX.y, axisX.z);
    set(axisX, -axisX.x / len, -axisX.y / len, -axisX.z / len);
  } else {
    const turnsPerSecond = (Math.abs(speedDaysPerSecond) * 24) / body.rotationHours;
    const [W0, rate] = body.rotation.primeMeridianDeg;
    const W = (turnsPerSecond > 1 ? W0 : W0 + rate * days) * RAD;
    // The prime meridian is W east of the equator's ascending node on the J2000 equator.
    equatorialPole(body, days, axisY);
    equatorNode(body, days, scratch);
    cross(axisY, scratch, axisZ); // east of the node
    set(
      axisX,
      Math.cos(W) * scratch.x + Math.sin(W) * axisZ.x,
      Math.cos(W) * scratch.y + Math.sin(W) * axisZ.y,
      Math.cos(W) * scratch.z + Math.sin(W) * axisZ.z,
    );
    equatorialToEcliptic(axisX);
    equatorialToEcliptic(axisY);
  }
  toScene(axisX);
  toScene(axisY);
  // Re-orthogonalise: a moon's direction to its planet is only nearly in its orbit plane's perpendicular.
  cross(axisX, axisY, axisZ);
  normalise(axisZ);
  cross(axisY, axisZ, axisX);
  normalise(axisX);
  return fromBasis(axisX, axisY, axisZ, out);
}

function set(v: Vector3Like, x: number, y: number, z: number): Vector3Like {
  v.x = x;
  v.y = y;
  v.z = z;
  return v;
}

function cross(a: Vector3Like, b: Vector3Like, out: Vector3Like): Vector3Like {
  return set(out, a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function normalise(v: Vector3Like): Vector3Like {
  const len = Math.hypot(v.x, v.y, v.z);
  return set(v, v.x / len, v.y / len, v.z / len);
}

/** A rotation matrix's columns (orthonormal, right-handed) → quaternion (as three's `setFromRotationMatrix`). */
function fromBasis(x: Vector3Like, y: Vector3Like, z: Vector3Like, out: QuaternionLike): QuaternionLike {
  const [m11, m12, m13, m21, m22, m23, m31, m32, m33] = [x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z];
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return setQ(out, (m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s);
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    return setQ(out, 0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s);
  }
  if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    return setQ(out, (m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s);
  }
  const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
  return setQ(out, (m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s);
}

function setQ(q: QuaternionLike, x: number, y: number, z: number, w: number): QuaternionLike {
  q.x = x;
  q.y = y;
  q.z = z;
  q.w = w;
  return q;
}
