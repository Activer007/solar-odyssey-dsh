import { Vector3 } from 'three';
import type { Camera } from 'three';
import type { LabelRect } from './labelLayout';

/** Perspective tangent bounds keep labels off the whole disk even at close zoom. */
export function projectLabelSubject(center: Vector3, radius: number, camera: Camera, width: number, height: number): LabelRect | undefined {
  if (!Number.isFinite(radius) || radius <= 0) return undefined;
  const view = center.clone().applyMatrix4(camera.matrixWorldInverse), matrix = camera.projectionMatrix.elements;
  if ('isPerspectiveCamera' in camera && camera.isPerspectiveCamera) {
    const depth = -view.z;
    if (depth <= -radius) return undefined;
    if (depth <= radius) return { x: 0, y: 0, width, height };
    const denominator = depth * depth - radius * radius;
    const xSpan = radius * Math.sqrt(depth * depth + view.x * view.x - radius * radius);
    const ySpan = radius * Math.sqrt(depth * depth + view.y * view.y - radius * radius);
    const x0 = (view.x * depth - xSpan) / denominator * matrix[0] - matrix[8];
    const x1 = (view.x * depth + xSpan) / denominator * matrix[0] - matrix[8];
    const y0 = (view.y * depth - ySpan) / denominator * matrix[5] - matrix[9];
    const y1 = (view.y * depth + ySpan) / denominator * matrix[5] - matrix[9];
    return { x: (x0 + 1) * width / 2, y: (1 - y1) * height / 2, width: (x1 - x0) * width / 2, height: (y1 - y0) * height / 2 };
  }
  const point = center.clone().project(camera);
  const halfWidth = radius * Math.abs(matrix[0]) * width / 2, halfHeight = radius * Math.abs(matrix[5]) * height / 2;
  return { x: (point.x + 1) * width / 2 - halfWidth, y: (1 - point.y) * height / 2 - halfHeight, width: halfWidth * 2, height: halfHeight * 2 };
}
