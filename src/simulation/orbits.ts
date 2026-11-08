import type { BodyData } from '../data/astronomy';
import type { J2000OrbitalElements } from '../data/j2000Elements';
export const AU_KM = 149597870.7;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
export { simulation } from './clock';
export function solveKepler(meanAnomaly: number, eccentricity: number): number {
  let e = meanAnomaly;
  for (let i = 0; i < 8; i++) e -= (e - eccentricity * Math.sin(e) - meanAnomaly) / (1 - eccentricity * Math.cos(e));
  return e;
}
export function orbitalDistance(body: BodyData, scale: 'educational' | 'real') {
  if (body.id === 'sun') return 0;
  const a = body.orbit!.semiMajorAxisAU;
  return scale === 'real' ? a * 28 : 11 + 21 * Math.sqrt(a);
}
export function bodyRadius(body: BodyData, scale: 'educational' | 'real') {
  if (scale === 'real') return body.radiusKm / AU_KM * 28;
  if (body.id === 'sun') return 5;
  return 0.48 + Math.pow(body.radiusKm / 6371, 0.58) * 0.7;
}
/** Rotate ecliptic north (+Z) onto Three +Y without reflecting handedness. */
export function eclipticToWorld(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y];
}

/** Fixed J2000 geometry; elapsed days advance M using the supplied sidereal
 * period, not JPL's secular rates. This hybrid is not the JPL ephemeris model.
 */
export function orbitalPositionFromElements(elements: Readonly<J2000OrbitalElements>, days: number, periodDays: number,
  semiMajorAxis = elements.semiMajorAxisAU): [number, number, number] {
  const e = elements.eccentricity;
  const mean = (elements.meanLongitudeDeg - elements.longitudeOfPerihelionDeg) * DEG + days / periodDays * TAU;
  const normalizedMean = ((mean + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const anomaly = solveKepler(normalizedMean, e);
  const x = semiMajorAxis * (Math.cos(anomaly) - e);
  const y = semiMajorAxis * Math.sqrt(1 - e * e) * Math.sin(anomaly);
  const argumentOfPerihelion = (elements.longitudeOfPerihelionDeg - elements.longitudeOfAscendingNodeDeg) * DEG;
  const node = elements.longitudeOfAscendingNodeDeg * DEG, inclination = elements.inclinationDeg * DEG;
  const alongNode = x * Math.cos(argumentOfPerihelion) - y * Math.sin(argumentOfPerihelion);
  const acrossNode = x * Math.sin(argumentOfPerihelion) + y * Math.cos(argumentOfPerihelion);
  return eclipticToWorld(
    alongNode * Math.cos(node) - acrossNode * Math.cos(inclination) * Math.sin(node),
    alongNode * Math.sin(node) + acrossNode * Math.cos(inclination) * Math.cos(node),
    acrossNode * Math.sin(inclination),
  );
}

export function orbitalPosition(body: BodyData, days: number, scale: 'educational' | 'real'): [number, number, number] {
  if (body.id === 'sun') return [0, 0, 0];
  return orbitalPositionFromElements(body.orbit!, days, body.periodDays, orbitalDistance(body, scale));
}
