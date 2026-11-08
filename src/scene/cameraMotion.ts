import { Vector3 } from 'three';

export interface CameraSphere { center: Vector3; radius: number; }
const validSphere = (sphere: CameraSphere) => Number.isFinite(sphere.radius) && sphere.radius > 0;
const clearance = (point: Vector3, sphere: CameraSphere) => Math.max(sphere.radius * 1e-6,
  Number.EPSILON * Math.max(1, point.length(), sphere.center.length()) * 16);

/** First entry into the open guard sphere. Tangencies and outward exits are free. */
export function segmentSphereHit(start: Vector3, end: Vector3, sphere: CameraSphere): number | null {
  if (!validSphere(sphere)) return null;
  const offset = start.clone().sub(sphere.center);
  const distance = offset.length(), radius = sphere.radius;
  const tolerance = Math.max(radius * 1e-10, Number.EPSILON * Math.max(1, start.length(), sphere.center.length()) * 8);
  if (distance < radius - tolerance) return 0;
  const direction = end.clone().sub(start), length = direction.length();
  if (length === 0) return null;
  direction.multiplyScalar(1 / length);
  const along = offset.dot(direction);
  if (distance <= radius + tolerance && along >= -tolerance) return null;
  // Computing the perpendicular vector avoids subtracting two huge squared
  // distances when a tiny planet lies on a long camera movement.
  const perpendicularSq = offset.addScaledVector(direction, -along).lengthSq();
  const radiusSq = radius * radius;
  if (perpendicularSq >= radiusSq * (1 - 1e-12)) return null;
  const entry = -along - Math.sqrt(Math.max(0, radiusSq - perpendicularSq));
  if (entry < -tolerance || entry > length + tolerance) return null;
  return Math.max(0, Math.min(1, entry / length));
}

function pushOutside(point: Vector3, spheres: readonly CameraSphere[], preferredDirection: Vector3) {
  const safe = point.clone();
  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    for (const sphere of spheres) {
      if (!validSphere(sphere)) continue;
      const offset = safe.clone().sub(sphere.center), distance = offset.length();
      const boundary = sphere.radius + clearance(safe, sphere);
      if (distance >= boundary) continue;
      if (distance === 0) offset.copy(preferredDirection.lengthSq() ? preferredDirection : new Vector3(0, 1, 0));
      safe.copy(sphere.center).add(offset.normalize().multiplyScalar(boundary));
      changed = true;
    }
    if (!changed) return safe;
  }
  // Dense overlaps can make alternating radial projections cycle. A point on
  // the enclosing sphere is a finite, conservative escape in that rare case.
  const obstacles = spheres.filter(validSphere);
  if (obstacles.some(sphere => safe.distanceTo(sphere.center) < sphere.radius)) {
    const center = obstacles.reduce((sum, sphere) => sum.add(sphere.center), new Vector3()).multiplyScalar(1 / obstacles.length);
    let radius = 0;
    for (const sphere of obstacles) radius = Math.max(radius, center.distanceTo(sphere.center) + sphere.radius + clearance(safe, sphere));
    const outward = safe.clone().sub(center);
    if (!outward.lengthSq()) outward.copy(preferredDirection.lengthSq() ? preferredDirection : new Vector3(0, 1, 0));
    safe.copy(center).add(outward.normalize().multiplyScalar(radius));
  }
  return safe;
}

/** Continuous collision detection for a complete frame displacement. */
export function constrainCameraSegment(start: Vector3, end: Vector3, spheres: readonly CameraSphere[]): Vector3 {
  const safeStart = pushOutside(start, spheres, end.clone().sub(start));
  const direction = end.clone().sub(safeStart), length = direction.length();
  if (!length) return safeStart;
  let first = 1, padding = 0;
  for (const sphere of spheres) {
    const hit = segmentSphereHit(safeStart, end, sphere);
    if (hit !== null && hit <= first) { first = hit; padding = clearance(safeStart, sphere); }
  }
  if (first === 1 && !padding) return end.clone();
  return safeStart.addScaledVector(direction, Math.max(0, first - padding / length));
}

function appendDistinct(path: Vector3[], point: Vector3) {
  const previous = path[path.length - 1];
  if (!previous || previous.distanceToSquared(point) > 0) path.push(point.clone());
}

function detours(start: Vector3, end: Vector3, sphere: CameraSphere): Vector3[][] {
  const u = start.clone().sub(sphere.center).normalize();
  const v = end.clone().sub(sphere.center).normalize();
  const normal = new Vector3().crossVectors(u, v);
  if (normal.lengthSq() < 1e-14) {
    const axis = Math.abs(u.y) < .8 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    normal.crossVectors(u, axis);
  }
  normal.normalize();
  const sideways = new Vector3().crossVectors(normal, u).normalize();
  const radius = sphere.radius * 1.12 + clearance(start, sphere) * 4;
  const startDistance = Math.max(radius, start.distanceTo(sphere.center));
  const endDistance = Math.max(radius, end.distanceTo(sphere.center));
  const outerStart = sphere.center.clone().addScaledVector(u, startDistance);
  const outerEnd = sphere.center.clone().addScaledVector(v, endDistance);
  const endAngle = Math.atan2(v.dot(sideways), v.dot(u));
  const startTangent = Math.acos(Math.min(1, radius / startDistance));
  const endTangent = Math.acos(Math.min(1, radius / endDistance));
  return [1, -1].map(sign => {
    const first = sign * startTangent;
    let last = endAngle - sign * endTangent;
    while (sign * (last - first) < 0) last += sign * Math.PI * 2;
    const steps = Math.max(1, Math.ceil(Math.abs(last - first) / (Math.PI / 12)));
    const path: Vector3[] = [start.clone()];
    appendDistinct(path, outerStart);
    // At most 15 degrees per chord: the chord remains beyond the true guard
    // radius (1.12 R * cos(7.5 degrees) > R), including the antipodal case.
    for (let step = 0; step <= steps; step++) {
      const angle = first + (last - first) * step / steps;
      appendDistinct(path, sphere.center.clone().addScaledVector(u, radius * Math.cos(angle)).addScaledVector(sideways, radius * Math.sin(angle)));
    }
    appendDistinct(path, outerEnd);
    appendDistinct(path, end);
    return path;
  });
}

function pathLength(path: readonly Vector3[]) {
  let length = 0;
  for (let index = 1; index < path.length; index++) length += path[index].distanceTo(path[index - 1]);
  return length;
}

function collisionCount(path: readonly Vector3[], spheres: readonly CameraSphere[]) {
  let count = 0;
  for (let index = 1; index < path.length; index++) {
    for (const sphere of spheres) if (segmentSphereHit(path[index - 1], path[index], sphere) !== null) count++;
  }
  return count;
}

function simplifyPath(path: Vector3[], spheres: readonly CameraSphere[]) {
  const result = [path[0]];
  let index = 0;
  while (index < path.length - 1) {
    let next = path.length - 1;
    while (next > index + 1 && spheres.some(sphere => segmentSphereHit(path[index], path[next], sphere) !== null)) next--;
    result.push(path[next]);
    index = next;
  }
  return result;
}

/** A finite visibility-graph fallback for crowded or overlapping obstacles. */
function visibilityPath(start: Vector3, end: Vector3, spheres: readonly CameraSphere[], seed: Vector3[]) {
  const points = [start, end, ...seed.slice(1, -1)];
  for (const sphere of spheres) {
    const radius = sphere.radius * 1.3 + clearance(start, sphere) * 4;
    for (let index = 0; index < 96; index++) {
      const y = 1 - 2 * (index + .5) / 96;
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      const horizontal = Math.sqrt(1 - y * y);
      const point = sphere.center.clone().add(new Vector3(Math.cos(angle) * horizontal, y, Math.sin(angle) * horizontal).multiplyScalar(radius));
      if (spheres.every(other => point.distanceTo(other.center) >= other.radius)) points.push(point);
    }
  }
  const distances = points.map(() => Infinity), previous = points.map(() => -1), visited = new Set<number>();
  distances[0] = 0;
  for (let pass = 0; pass < points.length; pass++) {
    let current = -1;
    for (let index = 0; index < points.length; index++) if (!visited.has(index) && (current < 0 || distances[index] < distances[current])) current = index;
    if (current < 0 || !Number.isFinite(distances[current])) break;
    if (current === 1) {
      const path: Vector3[] = [];
      for (let index = 1; index >= 0; index = previous[index]) path.unshift(points[index].clone());
      return path;
    }
    visited.add(current);
    for (let next = 0; next < points.length; next++) {
      if (visited.has(next)) continue;
      const distance = distances[current] + points[current].distanceTo(points[next]);
      if (distance >= distances[next] || spheres.some(sphere => segmentSphereHit(points[current], points[next], sphere) !== null)) continue;
      distances[next] = distance;
      previous[next] = current;
    }
  }
  throw new Error('Unable to find a safe camera path through guard spheres');
}

/** Safe automatic flight, including a target on the far side of the Sun. */
export function planCameraPath(start: Vector3, end: Vector3, spheres: readonly CameraSphere[]): Vector3[] {
  const obstacles = spheres.filter(validSphere);
  const safeStart = pushOutside(start, obstacles, start.clone().sub(end));
  const safeEnd = pushOutside(end, obstacles, end.clone().sub(start));
  let path = [safeStart, safeEnd];
  for (let iteration = 0; iteration < 96; iteration++) {
    let blocked: { index: number; sphere: CameraSphere; hit: number } | undefined;
    for (let index = 1; index < path.length && !blocked; index++) {
      for (const sphere of obstacles) {
        const hit = segmentSphereHit(path[index - 1], path[index], sphere);
        if (hit !== null && (!blocked || hit < blocked.hit)) blocked = { index, sphere, hit };
      }
    }
    if (!blocked) return simplifyPath(path, obstacles);
    const { index, sphere } = blocked;
    const options = detours(path[index - 1], path[index], sphere);
    options.sort((a, b) => collisionCount(a, obstacles) - collisionCount(b, obstacles) || pathLength(a) - pathLength(b));
    path = [...path.slice(0, index - 1), ...options[0], ...path.slice(index + 1)];
    if (path.length > 512) break;
  }
  return simplifyPath(visibilityPath(safeStart, safeEnd, obstacles, path), obstacles);
}

/** Arc-length sampling keeps camera speed independent of waypoint spacing. */
export function sampleCameraPath(path: readonly Vector3[], progress: number, out = new Vector3()): Vector3 {
  if (!path.length) return out.set(0, 0, 0);
  if (path.length === 1 || progress <= 0) return out.copy(path[0]);
  if (progress >= 1) return out.copy(path[path.length - 1]);
  const total = pathLength(path);
  let remaining = Math.max(0, progress) * total;
  for (let index = 1; index < path.length; index++) {
    const length = path[index].distanceTo(path[index - 1]);
    if (length && remaining <= length) return out.lerpVectors(path[index - 1], path[index], remaining / length);
    remaining -= length;
  }
  return out.copy(path[path.length - 1]);
}

/** Retain every crossed bend when a slow frame advances across several segments.
 * Sweeping only between the two sampled endpoints could cut through the sphere
 * that the planned polyline deliberately avoids.
 */
export function cameraPathSlice(path: readonly Vector3[], from: number, to: number): Vector3[] {
  const low = Math.max(0, Math.min(1, from)), high = Math.max(low, Math.min(1, to));
  const total = pathLength(path), result = [sampleCameraPath(path, low)];
  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    travelled += path[i].distanceTo(path[i - 1]);
    if (travelled > low * total && travelled < high * total) result.push(path[i].clone());
  }
  result.push(sampleCameraPath(path, high));
  return result;
}
