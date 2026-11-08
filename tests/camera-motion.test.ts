import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { cameraPathSlice, constrainCameraSegment, planCameraPath, sampleCameraPath, segmentSphereHit } from '../src/scene/cameraMotion';
import type { CameraSphere } from '../src/scene/cameraMotion';

const sphere = (x = 0, y = 0, z = 0, radius = 1): CameraSphere => ({ center: new Vector3(x, y, z), radius });
function expectSafePath(path: Vector3[], obstacles: CameraSphere[]) {
  expect(path.length).toBeGreaterThanOrEqual(2);
  for (const point of path) expect(point.toArray().every(Number.isFinite)).toBe(true);
  // Independently check each complete chord's nearest point, rather than
  // sampling frames (which could miss a small obstacle between frames).
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1], b = path[index], delta = b.clone().sub(a);
    for (const obstacle of obstacles) {
      const t = delta.lengthSq() ? Math.max(0, Math.min(1, obstacle.center.clone().sub(a).dot(delta) / delta.lengthSq())) : 0;
      const nearest = a.clone().addScaledVector(delta, t);
      expect(nearest.distanceTo(obstacle.center)).toBeGreaterThanOrEqual(obstacle.radius * (1 - 1e-8));
    }
  }
}

describe('continuous camera collision', () => {
  it('detects crossing with both endpoints outside and stops before entry', () => {
    const start = new Vector3(-10, 0, 0), end = new Vector3(10, 0, 0), guard = sphere();
    expect(segmentSphereHit(start, end, guard)).toBeCloseTo(.45, 12);
    const constrained = constrainCameraSegment(start, end, [guard]);
    expect(constrained.x).toBeLessThan(-1);
    expect(constrained.x).toBeGreaterThan(-1.001);
    expectSafePath([start, constrained], [guard]);
    expect(start.x).toBe(-10);
    expect(end.x).toBe(10);
  });

  it('permits tangency and a boundary exit, but blocks inward boundary movement', () => {
    expect(segmentSphereHit(new Vector3(-2, 1, 0), new Vector3(2, 1, 0), sphere())).toBeNull();
    expect(segmentSphereHit(new Vector3(1, 0, 0), new Vector3(3, 0, 0), sphere())).toBeNull();
    expect(segmentSphereHit(new Vector3(1, 0, 0), new Vector3(1, 3, 0), sphere())).toBeNull();
    expect(segmentSphereHit(new Vector3(1, 0, 0), new Vector3(-3, 0, 0), sphere())).toBe(0);
  });

  it('safely pushes out an interior or centered start without producing NaN', () => {
    expect(segmentSphereHit(new Vector3(.2, 0, 0), new Vector3(4, 0, 0), sphere())).toBe(0);
    for (const start of [new Vector3(), new Vector3(.2, 0, 0)]) {
      const result = constrainCameraSegment(start, new Vector3(.1, 0, 0), [sphere()]);
      expect(result.length()).toBeGreaterThan(1);
      expect(result.toArray().every(Number.isFinite)).toBe(true);
    }
  });

  it('detects a small body crossed by a huge one-frame displacement', () => {
    const guard = sphere(12, 0, 0, .0001), start = new Vector3(-1e6, 0, 0), end = new Vector3(1e6, 0, 0);
    expect(segmentSphereHit(start, end, guard)).not.toBeNull();
    const result = constrainCameraSegment(start, end, [guard]);
    expect(result.x).toBeLessThan(12 - guard.radius);
    expectSafePath([start, result], [guard]);
  });

  it('chooses the earliest obstruction regardless of sphere order', () => {
    const start = new Vector3(-10, 0, 0), end = new Vector3(10, 0, 0);
    expect(constrainCameraSegment(start, end, [sphere(4), sphere(-3)]).x).toBeLessThan(-4);
  });
});

describe('automatic camera route', () => {
  it('keeps an unobstructed segment and its exact endpoints', () => {
    const start = new Vector3(-5, 3, 0), end = new Vector3(5, 3, 0);
    const path = planCameraPath(start, end, [sphere()]);
    expect(path).toEqual([start, end]);
    expect(path[0]).not.toBe(start);
    expectSafePath(path, [sphere()]);
  });

  it('reaches the opposite side of the Sun without any chord crossing its guard', () => {
    const start = new Vector3(-30, 0, 0), end = new Vector3(40, 0, 0), sun = sphere(0, 0, 0, 6);
    const path = planCameraPath(start, end, [sun]);
    expect(path.length).toBeGreaterThan(2);
    expect(path[0]).toEqual(start);
    expect(path.at(-1)).toEqual(end);
    expectSafePath(path, [sun]);
    expect(sampleCameraPath(path, 1)).toEqual(end);
  });

  it('iterates around two obstacles and preserves every line segment', () => {
    const obstacles = [sphere(-3, 0, 0, 2), sphere(4, 0, 0, 2.5)];
    const start = new Vector3(-12, 0, 0), end = new Vector3(15, 0, 0);
    const path = planCameraPath(start, end, obstacles);
    expect(path[0]).toEqual(start);
    expect(path.at(-1)).toEqual(end);
    expectSafePath(path, obstacles);
  });

  it('handles a very close start, a small guard and a non-coplanar pair of obstacles', () => {
    const obstacles = [sphere(0, 0, 0, .01), sphere(.06, .005, .002, .025)];
    const start = new Vector3(-.010001, 0, 0), end = new Vector3(.2, .01, -.004);
    const path = planCameraPath(start, end, obstacles);
    expect(path[0]).toEqual(start);
    expect(path.at(-1)).toEqual(end);
    expectSafePath(path, obstacles);
  });

  it('normalizes interior endpoints to safe positions', () => {
    const path = planCameraPath(new Vector3(), new Vector3(8, 0, 0), [sphere()]);
    expect(path[0].length()).toBeGreaterThan(1);
    expectSafePath(path, [sphere()]);
  });

  it('keeps all chords safe around overlapping guards and several corridor layouts', () => {
    const layouts = [
      [sphere(-1, 0, 0, 2), sphere(1, 0, 0, 2)],
      ...Array.from({ length: 12 }, (_, layout) => Array.from({ length: 3 }, (_unused, index) =>
        sphere(index * 3, Math.sin(layout + index) * .8, Math.cos(layout * .7 + index) * .9, 1.5))),
    ];
    for (const obstacles of layouts) {
      const path = planCameraPath(new Vector3(-8, 0, 0), new Vector3(12, 0, 0), obstacles);
      expectSafePath(path, obstacles);
      expect(path.at(-1)).toEqual(new Vector3(12, 0, 0));
    }
  });

  it('samples by arc length and supports a caller-owned output vector', () => {
    const path = [new Vector3(), new Vector3(3, 0, 0), new Vector3(3, 4, 0)];
    const out = new Vector3();
    expect(sampleCameraPath(path, .5, out)).toBe(out);
    expect(out).toEqual(new Vector3(3, .5, 0));
    expect(sampleCameraPath(path, -1)).toEqual(path[0]);
    expect(sampleCameraPath(path, 2)).toEqual(path[2]);
  });
});

it('retains safe bends when one slow or reduced-motion frame spans the entire automatic route', () => {
  const guard = sphere(), start = new Vector3(-3, 0, 0), end = new Vector3(3, 0, 0);
  expect(segmentSphereHit(start, end, guard)).not.toBeNull();
  const planned = planCameraPath(start, end, [guard]);
  const oneFrame = cameraPathSlice(planned, 0, 1);
  expect(oneFrame.length).toBeGreaterThan(2);
  expectSafePath(oneFrame, [guard]);
  expect(oneFrame[0].distanceTo(start)).toBeLessThan(1e-12);
  expect(oneFrame[oneFrame.length - 1].distanceTo(end)).toBeLessThan(1e-12);
  expectSafePath(cameraPathSlice(planned, .2, .95), [guard]);
});
