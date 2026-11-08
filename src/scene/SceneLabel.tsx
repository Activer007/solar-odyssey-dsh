import { useCallback, useId, useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { useExplorer } from '../state/useExplorer';
import { mountSceneLabel, setSceneLabelVisible } from './sceneLabelDom';
import { registerSceneLabel } from './sceneLabelRegistry';
import type { RegisteredSceneLabel } from './sceneLabelRegistry';

export interface SceneLabelProps {
  position: [number, number, number];
  text: string;
  subtext?: string;
  color?: string;
  className?: string;
  onClick?: () => void;
  surface?: boolean;
  labelId?: string;
  priority?: number;
  /** Radius in the parent's local coordinates, independent of annotation pixel size. */
  subjectRadius?: number;
  ariaLabel?: string;
}

/** DOM ownership stays here; one per-canvas manager projects and lays out every label. */
export function SceneLabel({ position, text, subtext, color, className = '', onClick, surface = false, labelId, priority, subjectRadius, ariaLabel }: SceneLabelProps) {
  const group = useRef<Group>(null), handler = useRef(onClick);
  const generatedId = useId(), id = labelId || `scene-label-${generatedId}`;
  const gl = useThree(s => s.gl), labels = useExplorer(s => s.labels);
  const interactive = Boolean(onClick), rank = priority ?? (surface || className.includes('solar-layer-label') ? 100 : 50);
  useLayoutEffect(() => { handler.current = onClick; }, [onClick]);
  const click = useCallback(() => handler.current?.(), []);
  useLayoutEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!labels || !parent) return;
    const mounted = mountSceneLabel(parent, { text, subtext, color, className, onClick: interactive ? click : undefined, ariaLabel });
    mounted.node.setAttribute('data-label-id', id);
    setSceneLabelVisible(mounted.node, false, interactive);
    const leader = parent.ownerDocument.createElement('div');
    leader.className = 'projected-label-leader'; leader.setAttribute('aria-hidden', 'true'); parent.appendChild(leader);
    const entry: RegisteredSceneLabel = { id, node: mounted.node, leader, group, priority: rank, surface, subjectRadius, interactive };
    const unregister = registerSceneLabel(gl.domElement, entry);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => { entry.width = undefined; entry.height = undefined; });
    observer?.observe(mounted.node);
    return () => { unregister(); observer?.disconnect(); mounted.dispose(); leader.remove(); };
  }, [gl, labels, text, subtext, color, className, interactive, click, id, rank, surface, subjectRadius, ariaLabel]);
  return <group ref={group} position={position} />;
}
