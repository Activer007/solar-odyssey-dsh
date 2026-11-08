import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { bodies, bodyById, scienceNotice } from '../src/data/astronomy';
import { EARTH_ORBIT_REFERENCE, J2000_EPOCH_JD_TDB, J2000_ORBIT_SOURCE, j2000Elements } from '../src/data/j2000Elements';
import type { J2000OrbitalElements } from '../src/data/j2000Elements';
import { eclipticToWorld, orbitalDistance, orbitalPosition, orbitalPositionFromElements } from '../src/simulation/orbits';

const circular: J2000OrbitalElements = {
  semiMajorAxisAU: 2, eccentricity: 0, inclinationDeg: 0, meanLongitudeDeg: 0,
  longitudeOfPerihelionDeg: 0, longitudeOfAscendingNodeDeg: 0,
};
function expectPosition(actual: number[], expected: number[]) {
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 11));
}

describe('J2000 orbit definitions', () => {
  it('shares one complete source table without legacy phase or shape copies', () => {
    expect(J2000_EPOCH_JD_TDB).toBe(2451545);
    expect(J2000_ORBIT_SOURCE).toBe('https://ssd.jpl.nasa.gov/planets/approx_pos.html');
    expect(Object.keys(j2000Elements)).toHaveLength(8);
    for (const body of bodies) {
      expect(body).not.toHaveProperty('phase');
      expect(body).not.toHaveProperty('eccentricity');
      expect(body).not.toHaveProperty('inclination');
      if (body.id === 'sun') continue;
      expect(body.orbit).toBe(j2000Elements[body.id]);
      expect(body.distanceAU).toBe(j2000Elements[body.id].semiMajorAxisAU);
      expect(Object.values(body.orbit!).every(Number.isFinite)).toBe(true);
    }
    expect(EARTH_ORBIT_REFERENCE).toContain('地月质心');
    expect(scienceNotice).toContain('混合近似');
    expect(j2000Elements.earth.inclinationDeg).toBeLessThan(0);
  });

  it('keeps orbit lines and body positions on the same scaled eccentric orbit for a full period', () => {
    for (const body of bodies.slice(1)) for (const scale of ['real', 'educational'] as const) {
      const a = orbitalDistance(body, scale), e = body.orbit!.eccentricity;
      for (let sample = 0; sample <= 64; sample++) {
        const position = orbitalPosition(body, body.periodDays * sample / 64, scale);
        const distance = Math.hypot(...position);
        expect(position.every(Number.isFinite)).toBe(true);
        expect(distance).toBeGreaterThanOrEqual(a * (1 - e) - 1e-10);
        expect(distance).toBeLessThanOrEqual(a * (1 + e) + 1e-10);
      }
    }
  });
});

describe('right-handed orbital directions', () => {
  it('maps the ecliptic basis to a proper rotation instead of a reflection', () => {
    const x = new Vector3(...eclipticToWorld(1, 0, 0));
    const y = new Vector3(...eclipticToWorld(0, 1, 0));
    const north = new Vector3(...eclipticToWorld(0, 0, 1));
    expectPosition(x.toArray(), [1, 0, 0]);
    expectPosition(y.toArray(), [0, 0, -1]);
    expectPosition(north.toArray(), [0, 1, 0]);
    expectPosition(x.cross(y).toArray(), north.toArray());
  });

  it('advances a circular zero-inclination orbit from +X toward -Z', () => {
    expectPosition(orbitalPositionFromElements(circular, 0, 100), [2, 0, 0]);
    expectPosition(orbitalPositionFromElements(circular, 25, 100), [0, 0, -2]);
    expectPosition(orbitalPositionFromElements(circular, 50, 100), [-2, 0, 0]);
    const initial = new Vector3(...orbitalPositionFromElements(circular, 0, 100));
    const quarter = new Vector3(...orbitalPositionFromElements(circular, 25, 100));
    expect(initial.cross(quarter).y).toBeGreaterThan(0);
  });

  it('points a polar orbit toward +Y one quarter after the ascending node', () => {
    expectPosition(orbitalPositionFromElements({ ...circular, inclinationDeg: 90 }, 25, 100), [0, 2, 0]);
    expectPosition(orbitalPositionFromElements({ ...circular, inclinationDeg: -90 }, 25, 100), [0, -2, 0]);
  });

  it('distinguishes mean longitude from mean anomaly at a rotated perihelion', () => {
    const elements = { ...circular, eccentricity: .25, meanLongitudeDeg: 90, longitudeOfPerihelionDeg: 90 };
    expectPosition(orbitalPositionFromElements(elements, 0, 100), [0, 0, -1.5]);
  });

  it('crosses a rotated ascending node toward positive ecliptic north', () => {
    const elements = { ...circular, inclinationDeg: 30, longitudeOfAscendingNodeDeg: 90,
      longitudeOfPerihelionDeg: 90, meanLongitudeDeg: 90 };
    expectPosition(orbitalPositionFromElements(elements, 0, 100), [0, 0, -2]);
    expect(orbitalPositionFromElements(elements, .01, 100)[1]).toBeGreaterThan(0);
    expect(orbitalPositionFromElements(elements, -.01, 100)[1]).toBeLessThan(0);
  });

  it('places the J2000 Earth/Moon barycenter in the expected +ecliptic-Y quadrant', () => {
    const earth = orbitalPosition(bodyById.earth, 0, 'real');
    expect(earth[0]).toBeLessThan(0);
    expect(earth[2]).toBeLessThan(0); // +ecliptic Y maps to -world Z.
    expect(Math.abs(earth[1])).toBeLessThan(1e-4);
  });
});
