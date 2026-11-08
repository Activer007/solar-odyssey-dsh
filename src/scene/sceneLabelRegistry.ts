import type { RefObject } from 'react';
import type { Group } from 'three';

export interface RegisteredSceneLabel {
  id: string;
  node: HTMLElement;
  leader: HTMLElement;
  group: RefObject<Group | null>;
  priority: number;
  surface: boolean;
  subjectRadius?: number;
  interactive: boolean;
  width?: number;
  height?: number;
}

const labelsByCanvas = new WeakMap<HTMLCanvasElement, Map<string, RegisteredSceneLabel>>();

export function registeredSceneLabels(canvas: HTMLCanvasElement): readonly RegisteredSceneLabel[] {
  return [...(labelsByCanvas.get(canvas)?.values() || [])];
}

export function registerSceneLabel(canvas: HTMLCanvasElement, label: RegisteredSceneLabel): () => void {
  let labels = labelsByCanvas.get(canvas);
  if (!labels) { labels = new Map(); labelsByCanvas.set(canvas, labels); }
  labels.set(label.id, label);
  return () => {
    if (labels.get(label.id) === label) labels.delete(label.id);
    if (!labels.size && labelsByCanvas.get(canvas) === labels) labelsByCanvas.delete(canvas);
  };
}
