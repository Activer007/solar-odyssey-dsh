import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { layoutSceneLabels } from '../src/scene/labelLayout';
import type { LabelCandidate, LabelPlacement, LabelRect } from '../src/scene/labelLayout';
import { projectLabelSubject } from '../src/scene/labelProjection';
import { registeredSceneLabels, registerSceneLabel } from '../src/scene/sceneLabelRegistry';
import type { RegisteredSceneLabel } from '../src/scene/sceneLabelRegistry';

const intersects = (a: LabelRect, b: LabelRect) => Math.max(a.x, b.x) < Math.min(a.x + a.width, b.x + b.width)
  && Math.max(a.y, b.y) < Math.min(a.y + a.height, b.y + b.height);

function assertLegal(placements: LabelPlacement[], viewport: { width: number; height: number }, obstacles: LabelRect[]) {
  const visible = placements.filter(item => item.visible).map(item => item.rect!);
  for (const [index, rect] of visible.entries()) {
    expect([rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)).toBe(true);
    expect(rect.x).toBeGreaterThanOrEqual(8); expect(rect.y).toBeGreaterThanOrEqual(8);
    expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height - 8);
    expect(obstacles.some(obstacle => intersects(rect, obstacle))).toBe(false);
    expect(visible.slice(index + 1).some(other => intersects(rect, other))).toBe(false);
  }
}

describe('coordinated screen-space label layout', () => {
  it('produces identical placements for every mount-order rotation and reversal', () => {
    const labels: LabelCandidate[] = Array.from({ length: 9 }, (_, index) => ({
      id: `body-${index}`, anchor: { x: 210 + index * 2, y: 100 + index * 3 }, width: 68, height: 28,
      priority: index === 7 ? 100 : 50,
    }));
    const options = { viewport: { width: 420, height: 300 }, obstacles: [{ x: 0, y: 240, width: 420, height: 60 }] };
    const result = layoutSceneLabels({ ...options, labels });
    for (let index = 0; index < labels.length; index++) {
      const rotated = [...labels.slice(index), ...labels.slice(0, index)];
      expect(layoutSceneLabels({ ...options, labels: rotated })).toEqual(result);
      expect(layoutSceneLabels({ ...options, labels: [...rotated].reverse() })).toEqual(result);
    }
    expect(result.filter(item => item.visible).length).toBeGreaterThan(3);
    assertLegal(result, options.viewport, options.obstacles);
  });

  it('reserves the only available slot for a selected or lesson label, regardless of ID order', () => {
    const result = layoutSceneLabels({ viewport: { width: 140, height: 60 }, labels: [
      { id: 'aaa-background', anchor: { x: 70, y: 30 }, width: 100, height: 30, priority: 50 },
      { id: 'zzz-current-lesson', anchor: { x: 70, y: 30 }, width: 100, height: 30, priority: 100 },
    ] });
    expect(result).toMatchObject([{ id: 'zzz-current-lesson', visible: true }, { id: 'aaa-background', visible: false }]);
  });

  it('finds a nearby body-edge candidate and connects the displaced label to its original anchor', () => {
    const subject = { x: 80, y: 80, width: 40, height: 40 };
    const result = layoutSceneLabels({ viewport: { width: 260, height: 220 }, labels: [
      { id: 'feature', anchor: { x: 100, y: 100 }, width: 70, height: 28, priority: 100, subjectRect: subject },
    ] });
    assertLegal(result, { width: 260, height: 220 }, [subject]);
    expect(result[0].visible).toBe(true);
    expect(result[0].leader?.from).toEqual({ x: 100, y: 100 });
    expect(result[0].leader?.to).not.toEqual(result[0].leader?.from);
  });

  it('keeps all visible labels inside portrait, narrow and wide viewports while avoiding UI and every body', () => {
    for (const viewport of [{ width: 390, height: 672 }, { width: 210, height: 250 }, { width: 890, height: 540 }]) {
      const ui = [{ x: viewport.width - 120, y: 140, width: 120, height: 180 }, { x: 0, y: viewport.height - 65, width: viewport.width, height: 65 }];
      const labels = Array.from({ length: 15 }, (_, index) => ({
        id: `label-${index}`, anchor: { x: index % 2 ? 2 : viewport.width - 2, y: 40 + index * 8 },
        width: index % 3 ? 86 : 150, height: index % 2 ? 28 : 46, priority: index === 5 ? 100 : 50,
        subjectRect: { x: viewport.width / 2 - 10, y: 50 + index * 4, width: 20, height: 20 },
      }));
      const result = layoutSceneLabels({ viewport, labels, obstacles: ui });
      expect(result.some(item => item.visible)).toBe(true);
      assertLegal(result, viewport, [...ui, ...labels.map(label => label.subjectRect)]);
    }
  });

  it('hides impossible, offscreen and invalid candidates rather than overflowing or overlapping', () => {
    const labels = [
      { id: 'wide', anchor: { x: 90, y: 40 }, width: 500, height: 28, priority: 100 },
      { id: 'offscreen', anchor: { x: -100, y: 40 }, width: 40, height: 28, priority: 50 },
      { id: 'invalid', anchor: { x: 90, y: NaN }, width: 40, height: 28, priority: 50 },
      { id: 'covered', anchor: { x: 90, y: 40 }, width: 40, height: 28, priority: 50 },
    ];
    const result = layoutSceneLabels({ viewport: { width: 180, height: 100 }, labels, obstacles: [{ x: 0, y: 0, width: 180, height: 100 }] });
    expect(result.every(item => !item.visible && !item.rect)).toBe(true);
  });

  it('reuses a legal relative offset, and rejects it immediately when a panel moves into the slot', () => {
    const label = { id: 'tracked', anchor: { x: 100, y: 100 }, width: 40, height: 20, priority: 100, subjectRect: { x: 80, y: 80, width: 40, height: 40 } };
    const options = { viewport: { width: 260, height: 220 }, labels: [label], previous: new Map([['tracked', { x: 60, y: 0 }]]) };
    expect(layoutSceneLabels(options)[0].offset).toEqual({ x: 60, y: 0 });
    const panel = { x: 130, y: 70, width: 70, height: 60 };
    const moved = layoutSceneLabels({ ...options, obstacles: [panel] });
    expect(moved[0].visible).toBe(true);
    expect(moved[0].offset).not.toEqual({ x: 60, y: 0 });
    assertLegal(moved, options.viewport, [label.subjectRect, panel]);
  });
});

describe('projected body silhouette', () => {
  const camera = new PerspectiveCamera(90, 1, .1, 100);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();

  it('contains the actual tangent at close zoom, beyond the center-plane radius approximation', () => {
    const rect = projectLabelSubject(new Vector3(0, 0, -2), 1, camera, 400, 400)!;
    const tangent = new Vector3(Math.sqrt(3) / 2, 0, -1.5).project(camera);
    const x = (tangent.x + 1) * 200;
    expect(rect.x + rect.width).toBeCloseTo(x, 8);
    expect(rect.width).toBeGreaterThan(200);
  });

  it('contains sampled off-axis sphere points and handles behind-camera subjects', () => {
    const center = new Vector3(.9, .4, -3), radius = .8;
    const rect = projectLabelSubject(center, radius, camera, 400, 400)!;
    for (let theta = 0; theta <= 20; theta++) for (let phi = 0; phi < 40; phi++) {
      const t = theta / 20 * Math.PI, p = phi / 40 * Math.PI * 2;
      const point = new Vector3(Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)).multiplyScalar(radius).add(center).project(camera);
      const x = (point.x + 1) * 200, y = (1 - point.y) * 200;
      expect(x).toBeGreaterThanOrEqual(rect.x - 1e-8); expect(x).toBeLessThanOrEqual(rect.x + rect.width + 1e-8);
      expect(y).toBeGreaterThanOrEqual(rect.y - 1e-8); expect(y).toBeLessThanOrEqual(rect.y + rect.height + 1e-8);
    }
    expect(projectLabelSubject(new Vector3(0, 0, 3), 1, camera, 400, 400)).toBeUndefined();
  });
});

describe('per-renderer label registration', () => {
  it('isolates canvases and prevents old cleanup from removing a newer registration', () => {
    const canvas = {} as HTMLCanvasElement, other = {} as HTMLCanvasElement;
    const entry = { id: 'body-earth' } as RegisteredSceneLabel;
    const first = registerSceneLabel(canvas, entry);
    const replacement = { id: 'body-earth' } as RegisteredSceneLabel;
    const second = registerSceneLabel(canvas, replacement), third = registerSceneLabel(other, entry);
    first();
    expect(registeredSceneLabels(canvas)).toEqual([replacement]);
    second();
    expect(registeredSceneLabels(canvas)).toEqual([]);
    expect(registeredSceneLabels(other)).toEqual([entry]);
    third(); expect(registeredSceneLabels(other)).toEqual([]);
    const fourth = registerSceneLabel(canvas, replacement);
    first(); second();
    expect(registeredSceneLabels(canvas)).toEqual([replacement]);
    fourth();
  });
});
