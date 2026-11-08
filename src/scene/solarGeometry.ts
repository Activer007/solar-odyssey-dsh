import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

export interface SolarShellSegments { widthSegments?: number; heightSegments?: number; }

/** A closed solid shell with the +X/+Z quadrant removed, matching the energy view.
 * Surface and cut faces share one latitude grid. Separate vertices preserve the
 * hard cut-face normals without introducing topological gaps at their seams.
 */
export function createSolarShellGeometry(inner: number, outer: number, { widthSegments = 80, heightSegments = 56 }: SolarShellSegments = {}): BufferGeometry {
  if (!Number.isFinite(inner) || !Number.isFinite(outer) || inner < 0 || outer <= inner) {
    throw new RangeError('Solar shell radii must satisfy 0 <= inner < outer');
  }
  if (!Number.isInteger(widthSegments) || widthSegments < 3 || !Number.isInteger(heightSegments) || heightSegments < 2) {
    throw new RangeError('Solar shell segments must be integers: width >= 3, height >= 2');
  }
  const positions: number[] = [], normals: number[] = [];
  const startPhi = Math.PI, lengthPhi = Math.PI * 1.5;
  const point = (radius: number, theta: number, phi: number) => new Vector3(
    -radius * Math.sin(theta) * Math.cos(phi), radius * Math.cos(theta), radius * Math.sin(theta) * Math.sin(phi),
  );
  const cross = new Vector3(), edge = new Vector3();
  const triangle = (a: Vector3, b: Vector3, c: Vector3, radialNormal: number, faceNormal?: Vector3) => {
    cross.subVectors(b, a).cross(edge.subVectors(c, a));
    // Pole quads and the solid core's collapsed inner edge need only one triangle.
    if (cross.lengthSq() <= outer ** 4 * 1e-24) return;
    for (const vertex of [a, b, c]) {
      positions.push(vertex.x, vertex.y, vertex.z);
      const normal = faceNormal || vertex.clone().normalize().multiplyScalar(radialNormal);
      normals.push(normal.x, normal.y, normal.z);
    }
  };
  const sphericalSurface = (radius: number, inward: boolean) => {
    for (let t = 0; t < heightSegments; t++) {
      const t0 = t / heightSegments * Math.PI, t1 = (t + 1) / heightSegments * Math.PI;
      for (let p = 0; p < widthSegments; p++) {
        const p0 = startPhi + p / widthSegments * lengthPhi, p1 = startPhi + (p + 1) / widthSegments * lengthPhi;
        const a = point(radius, t0, p0), b = point(radius, t1, p0), c = point(radius, t1, p1), d = point(radius, t0, p1);
        if (inward) { triangle(a, c, b, -1); triangle(a, d, c, -1); }
        else { triangle(a, b, c, 1); triangle(a, c, d, 1); }
      }
    }
  };
  sphericalSurface(outer, false);
  if (inner > 0) sphericalSurface(inner, true);
  for (const end of [false, true]) {
    const phi = startPhi + (end ? lengthPhi : 0);
    const normal = new Vector3(Math.sin(phi), 0, Math.cos(phi)).multiplyScalar(end ? 1 : -1);
    for (let t = 0; t < heightSegments; t++) {
      const t0 = t / heightSegments * Math.PI, t1 = (t + 1) / heightSegments * Math.PI;
      const a = point(inner, t0, phi), b = point(outer, t0, phi), c = point(outer, t1, phi), d = point(inner, t1, phi);
      if (end) { triangle(a, b, c, 0, normal); triangle(a, c, d, 0, normal); }
      else { triangle(a, c, b, 0, normal); triangle(a, d, c, 0, normal); }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
