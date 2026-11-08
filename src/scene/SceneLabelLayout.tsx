import { useLayoutEffect } from 'react';
import { addAfterEffect, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useExplorer } from '../state/useExplorer';
import { layoutSceneLabels } from './labelLayout';
import type { LabelCandidate, LabelPoint, LabelRect } from './labelLayout';
import { projectLabelSubject } from './labelProjection';
import { registeredSceneLabels } from './sceneLabelRegistry';
import { setSceneLabelVisible } from './sceneLabelDom';

const uiSelectors = '.scene-breadcrumb,.scene-caption,.view-controls,.information-panel,.body-navigation,.reopen-info,.reopen-nav,.resource-status,[data-testid="renderer-status"],.mobile-nav-shade,[data-scene-label-obstacle]';

function uiObstacles(canvas: HTMLCanvasElement, canvasRect: DOMRect): LabelRect[] {
  const host = canvas.closest('.app-shell');
  if (!host) return [];
  if (host.querySelector('dialog[open]')) return [{ x: 0, y: 0, width: canvasRect.width, height: canvasRect.height }];
  const result: LabelRect[] = [];
  for (const node of host.querySelectorAll<HTMLElement>(uiSelectors)) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = node.getBoundingClientRect();
    const x = Math.max(0, rect.left - canvasRect.left), y = Math.max(0, rect.top - canvasRect.top);
    const right = Math.min(canvasRect.width, rect.right - canvasRect.left), bottom = Math.min(canvasRect.height, rect.bottom - canvasRect.top);
    if (right > x && bottom > y) result.push({ x, y, width: right - x, height: bottom - y });
  }
  return result;
}

/** After-render follows all frame callbacks/matrix updates, including newly mounted models. */
export function SceneLabelLayout() {
  const get = useThree(s => s.get);
  useLayoutEffect(() => {
    const point = new Vector3(), center = new Vector3(), scale = new Vector3(), normal = new Vector3(), toCamera = new Vector3(), cameraPosition = new Vector3();
    let previous = new Map<string, LabelPoint>();
    return addAfterEffect(() => {
      const { gl, camera } = get(), canvas = gl.domElement;
      const entries = registeredSceneLabels(canvas);
      if (!entries.length) { previous.clear(); return; }
      const canvasRect = canvas.getBoundingClientRect(), parentRect = canvas.parentElement?.getBoundingClientRect();
      if (!parentRect || canvasRect.width <= 0 || canvasRect.height <= 0) return;
      const candidates: LabelCandidate[] = [];
      camera.getWorldPosition(cameraPosition);
      // Read every measurement and projection before any DOM placement writes.
      for (const entry of entries) {
        const group = entry.group.current;
        if (!useExplorer.getState().labels || !group) continue;
        group.getWorldPosition(point);
        const parent = group.parent;
        if (entry.surface && parent) {
          parent.getWorldPosition(center);
          normal.copy(point).sub(center).normalize(); toCamera.copy(cameraPosition).sub(point).normalize();
          if (normal.dot(toCamera) < .1) continue;
        }
        point.project(camera);
        if (![point.x, point.y, point.z].every(Number.isFinite) || point.z > 1 || point.z < -1) continue;
        if (entry.width === undefined || entry.height === undefined) {
          const rect = entry.node.getBoundingClientRect(); entry.width = rect.width; entry.height = rect.height;
        }
        let subjectRect: LabelRect | undefined;
        if (parent && entry.subjectRadius) {
          parent.getWorldPosition(center); parent.getWorldScale(scale);
          subjectRect = projectLabelSubject(center, entry.subjectRadius * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)), camera, canvasRect.width, canvasRect.height);
        }
        candidates.push({ id: entry.id, anchor: { x: (point.x + 1) * canvasRect.width / 2, y: (1 - point.y) * canvasRect.height / 2 },
          width: entry.width, height: entry.height, priority: entry.priority, subjectRect });
      }
      const placements = layoutSceneLabels({ viewport: canvasRect, labels: candidates, obstacles: uiObstacles(canvas, canvasRect), previous });
      const byId = new Map(placements.map(placement => [placement.id, placement]));
      const offsetX = canvasRect.left - parentRect.left, offsetY = canvasRect.top - parentRect.top;
      const next = new Map<string, LabelPoint>();
      for (const entry of entries) {
        const placement = byId.get(entry.id), visible = Boolean(placement?.visible && placement.rect);
        setSceneLabelVisible(entry.node, visible, entry.interactive);
        entry.leader.style.visibility = 'hidden';
        if (!placement?.visible || !placement.rect) continue;
        entry.node.style.transform = `translate(${placement.rect.x + offsetX}px,${placement.rect.y + offsetY}px)`;
        if (placement.offset) next.set(entry.id, placement.offset);
        if (placement.leader) {
          const { from, to } = placement.leader;
          entry.leader.style.width = `${Math.hypot(to.x - from.x, to.y - from.y)}px`;
          entry.leader.style.transform = `translate(${from.x + offsetX}px,${from.y + offsetY}px) rotate(${Math.atan2(to.y - from.y, to.x - from.x)}rad)`;
          entry.leader.style.visibility = 'visible';
        }
      }
      previous = next;
    });
  }, [get]);
  return null;
}
