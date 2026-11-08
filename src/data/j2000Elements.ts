/** NASA/JPL SSD Table 1 epoch values; secular rates are deliberately omitted. */
export interface J2000OrbitalElements {
  semiMajorAxisAU: number;
  eccentricity: number;
  inclinationDeg: number;
  meanLongitudeDeg: number;
  longitudeOfPerihelionDeg: number;
  longitudeOfAscendingNodeDeg: number;
}
export type OrbitingBodyId = 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';
export const J2000_EPOCH_JD_TDB = 2451545.0;
export const J2000_ORBIT_SOURCE = 'https://ssd.jpl.nasa.gov/planets/approx_pos.html';
export const J2000_ORBIT_FRAME = 'mean ecliptic and equinox of J2000';
export const EARTH_ORBIT_REFERENCE = '地球轨道以地月质心（Earth/Moon Barycenter）近似，不计算地心相对质心的月周期运动。';

/** a in AU; e dimensionless; the four angular elements in degrees.
 * The source's 1800–2050 accuracy applies to its complete elements-and-rates
 * algorithm. This app freezes these values and advances M with NSSDCA periods.
 */
export const j2000Elements: Readonly<Record<OrbitingBodyId, Readonly<J2000OrbitalElements>>> = {
  mercury: { semiMajorAxisAU: .38709927, eccentricity: .20563593, inclinationDeg: 7.00497902, meanLongitudeDeg: 252.25032350, longitudeOfPerihelionDeg: 77.45779628, longitudeOfAscendingNodeDeg: 48.33076593 },
  venus: { semiMajorAxisAU: .72333566, eccentricity: .00677672, inclinationDeg: 3.39467605, meanLongitudeDeg: 181.97909950, longitudeOfPerihelionDeg: 131.60246718, longitudeOfAscendingNodeDeg: 76.67984255 },
  earth: { semiMajorAxisAU: 1.00000261, eccentricity: .01671123, inclinationDeg: -.00001531, meanLongitudeDeg: 100.46457166, longitudeOfPerihelionDeg: 102.93768193, longitudeOfAscendingNodeDeg: 0 },
  mars: { semiMajorAxisAU: 1.52371034, eccentricity: .09339410, inclinationDeg: 1.84969142, meanLongitudeDeg: -4.55343205, longitudeOfPerihelionDeg: -23.94362959, longitudeOfAscendingNodeDeg: 49.55953891 },
  jupiter: { semiMajorAxisAU: 5.20288700, eccentricity: .04838624, inclinationDeg: 1.30439695, meanLongitudeDeg: 34.39644051, longitudeOfPerihelionDeg: 14.72847983, longitudeOfAscendingNodeDeg: 100.47390909 },
  saturn: { semiMajorAxisAU: 9.53667594, eccentricity: .05386179, inclinationDeg: 2.48599187, meanLongitudeDeg: 49.95424423, longitudeOfPerihelionDeg: 92.59887831, longitudeOfAscendingNodeDeg: 113.66242448 },
  uranus: { semiMajorAxisAU: 19.18916464, eccentricity: .04725744, inclinationDeg: .77263783, meanLongitudeDeg: 313.23810451, longitudeOfPerihelionDeg: 170.95427630, longitudeOfAscendingNodeDeg: 74.01692503 },
  neptune: { semiMajorAxisAU: 30.06992276, eccentricity: .00859048, inclinationDeg: 1.77004347, meanLongitudeDeg: -55.12002969, longitudeOfPerihelionDeg: 44.96476227, longitudeOfAscendingNodeDeg: 131.78422574 },
};
