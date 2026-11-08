import { describe, expect, it } from 'vitest';
import { BufferGeometry, FrontSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { solarLayers as legacyLayers } from '../src/data/astronomy';
import { displayRadius, solarLayerById, solarLayers } from '../src/data/solarStructure';
import { createSolarShellGeometry } from '../src/scene/solarGeometry';

function triangles(geometry: BufferGeometry, visit: (vertices: Vector3[], normals: Vector3[]) => void) {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), index = geometry.getIndex();
  const count = index?.count ?? position.count;
  for (let offset = 0; offset < count; offset += 3) {
    const ids = [0, 1, 2].map(n => index ? index.getX(offset + n) : offset + n);
    visit(ids.map(id => new Vector3().fromBufferAttribute(position, id)), ids.map(id => new Vector3().fromBufferAttribute(normal, id)));
  }
}

describe('one scientific and teaching solar structure', () => {
  it('keeps seven stable layers and one canonical array for existing consumers', () => {
    expect(legacyLayers).toBe(solarLayers);
    expect(solarLayers.map(layer => layer.id)).toEqual(['core', 'radiative', 'convective', 'photosphere', 'chromosphere', 'transition', 'corona']);
    expect(solarLayers.map(layer => layer.displayOuter)).toEqual([.25, .7, .93, 1, 1.027, 1.067, 1.48]);
    for (const [index, layer] of solarLayers.entries()) {
      expect(layer.displayInner).toBe(index ? solarLayers[index - 1].displayOuter : 0);
      expect(layer.displayOuter).toBeGreaterThan(layer.displayInner);
      expect(solarLayerById[layer.id]).toBe(layer);
      for (const text of [layer.position, layer.role, layer.temperature, layer.displayNote, layer.energy]) expect(text.length).toBeGreaterThan(5);
      expect(layer.source).toMatch(/^https:\/\//);
    }
  });

  it('distinguishes the compressed convective display from its scientific extent', () => {
    expect(solarLayerById.convective.scientificRadius).toEqual([.7, 1]);
    expect(displayRadius('convective', 0)).toBe(.7);
    expect(displayRadius('convective', .5)).toBeCloseTo(.815, 12);
    expect(displayRadius('convective', 1)).toBe(.93);
    expect(solarLayers.slice(3).every(layer => layer.scientificRadius === null)).toBe(true);
    expect(displayRadius('core', -1)).toBe(0);
    expect(displayRadius('corona', 2)).toBe(1.48);
    expect(() => displayRadius('core', NaN)).toThrow(RangeError);
  });
});

describe('closed solar shell geometry', () => {
  it.each(solarLayers)('$id has finite nondegenerate triangles and correctly oriented surface normals', layer => {
    const geometry = createSolarShellGeometry(layer.displayInner, layer.displayOuter, { widthSegments: 24, heightSegments: 16 });
    const counts = { outer: 0, inner: 0, start: 0, end: 0 };
    const radii: number[] = [];
    try {
      triangles(geometry, (vertices, normals) => {
        const face = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));
        expect(face.lengthSq(), 'zero-area triangles at a pole or solid-core origin').toBeGreaterThan(1e-16);
        face.normalize();
        for (const [index, vertex] of vertices.entries()) {
          expect([...vertex, ...normals[index]].every(Number.isFinite)).toBe(true);
          expect(normals[index].length()).toBeCloseTo(1, 5);
          expect(face.dot(normals[index]), 'attribute normals must agree with the triangle winding').toBeGreaterThan(.95);
          radii.push(vertex.length());
        }
        if (vertices.every(vertex => Math.abs(vertex.length() - layer.displayOuter) < 1e-6)) {
          counts.outer++;
          normals.forEach((normal, index) => expect(normal.dot(vertices[index].clone().normalize())).toBeGreaterThan(.99999));
        } else if (layer.displayInner > 0 && vertices.every(vertex => Math.abs(vertex.length() - layer.displayInner) < 1e-6)) {
          counts.inner++;
          normals.forEach((normal, index) => expect(normal.dot(vertices[index].clone().normalize())).toBeLessThan(-.99999));
        } else if (vertices.every(vertex => Math.abs(vertex.z) < 1e-6)) {
          counts.start++;
          normals.forEach(normal => expect(normal.z).toBeCloseTo(1, 5));
        } else {
          counts.end++;
          expect(vertices.every(vertex => Math.abs(vertex.x) < 1e-6)).toBe(true);
          normals.forEach(normal => expect(normal.x).toBeCloseTo(1, 5));
        }
      });
      expect(Math.min(...radii)).toBeCloseTo(layer.displayInner, 5);
      expect(Math.max(...radii)).toBeCloseTo(layer.displayOuter, 5);
      expect(counts.outer).toBeGreaterThan(0);
      expect(counts.inner).toBe(layer.displayInner === 0 ? 0 : counts.outer);
      expect(counts.start).toBeGreaterThan(0);
      expect(counts.end).toBe(counts.start);
    } finally { geometry.dispose(); }
  });

  it.each(solarLayers)('$id has no open seams or reversed shared edges after welding positions', layer => {
    const geometry = createSolarShellGeometry(layer.displayInner, layer.displayOuter, { widthSegments: 12, heightSegments: 8 });
    const edges = new Map<string, { count: number; orientation: number }>();
    const key = (vertex: Vector3) => vertex.toArray().map(value => Math.round(value * 1e6)).join(',');
    try {
      triangles(geometry, vertices => {
        for (let index = 0; index < 3; index++) {
          const a = key(vertices[index]), b = key(vertices[(index + 1) % 3]);
          expect(a).not.toBe(b);
          const forward = a < b, edgeKey = forward ? `${a}|${b}` : `${b}|${a}`;
          const edge = edges.get(edgeKey) || { count: 0, orientation: 0 };
          edge.count++; edge.orientation += forward ? 1 : -1;
          edges.set(edgeKey, edge);
        }
      });
      expect(edges.size).toBeGreaterThan(100);
      expect([...edges.values()].filter(edge => edge.count !== 2 || edge.orientation !== 0)).toEqual([]);
    } finally { geometry.dispose(); }
  });

  it.each(solarLayers)('$id can be selected from outside and both cut faces with front-face culling', layer => {
    const geometry = createSolarShellGeometry(layer.displayInner, layer.displayOuter, { widthSegments: 24, heightSegments: 16 });
    const material = new MeshBasicMaterial({ side: FrontSide }), mesh = new Mesh(geometry, material);
    const mid = (layer.displayInner + layer.displayOuter) / 2;
    const ray = new Raycaster(), direction = new Vector3(-.3, .15, -1).normalize();
    mesh.updateMatrixWorld();
    try {
      ray.set(direction.clone().multiplyScalar(layer.displayOuter * 2), direction.clone().negate());
      const exterior = ray.intersectObject(mesh);
      expect(exterior.length).toBeGreaterThan(0);
      expect(exterior[0].point.length()).toBeGreaterThan(layer.displayOuter * .98);
      if (layer.displayInner > 0) {
        ray.set(new Vector3(), direction);
        const cavity = ray.intersectObject(mesh);
        expect(cavity.length, 'an actual inward-facing inner sphere must close the cavity').toBeGreaterThan(0);
        expect(cavity[0].point.length()).toBeLessThanOrEqual(layer.displayInner + 1e-6);
        expect(cavity[0].point.length()).toBeGreaterThan(layer.displayInner * .98);
      }
      ray.set(new Vector3(mid * .8, mid * .6, layer.displayOuter), new Vector3(0, 0, -1));
      expect(ray.intersectObject(mesh)[0]?.distance).toBeCloseTo(layer.displayOuter, 5);
      ray.set(new Vector3(layer.displayOuter, mid * .6, mid * .8), new Vector3(-1, 0, 0));
      expect(ray.intersectObject(mesh)[0]?.distance).toBeCloseTo(layer.displayOuter, 5);
    } finally { material.dispose(); geometry.dispose(); }
  });

  it('encloses the expected three-quarter spherical-shell volume with outward winding', () => {
    const inner = .7, outer = .93;
    const geometry = createSolarShellGeometry(inner, outer, { widthSegments: 40, heightSegments: 28 });
    let volume = 0;
    try {
      triangles(geometry, ([a, b, c]) => { volume += a.dot(b.clone().cross(c)) / 6; });
      const expected = Math.PI * (outer ** 3 - inner ** 3);
      expect(volume).toBeGreaterThan(expected * .99);
      expect(volume).toBeLessThan(expected);
    } finally { geometry.dispose(); }
  });
});
