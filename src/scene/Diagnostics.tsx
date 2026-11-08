import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Mesh, Points, Vector2, Vector3 } from 'three';
import type { OrbitControls } from 'three-stdlib';
import { useExplorer } from '../state/useExplorer';
import { simulation, orbitalPosition } from '../simulation/orbits';
import { bodyById } from '../data/astronomy';
import { renderPipeline } from './renderPipeline';

export interface DiagnosticSnapshot {
  geometries: number; textures: number; programs: number; calls: number; fps: number;
  camera: number[]; target: number[]; focus: number[]; projectedTarget: number[];
  targetOffset: number; transitioning: boolean; mode: string; selected: string;
  days: number; quality: string; fov: number; scale: 'educational' | 'real';
  dpr: number; drawingBuffer: { w: number; h: number }; viewport: { w: number; h: number };
  antialias: boolean; renderer: string; vendor: string; webglVersion: string;
  meshVertices: number; triangles: number; pointsVertices: number; energyParticles: number;
  postprocessing: { active: boolean; bloom: boolean; multisampling: number; passes: number };
  frameSequence: number; cameraTransitionDuration: number;
  sampledAt: number; animationElapsed: number; animationDelta: number;
}
export const cameraTelemetry = { transitioning: false, revision: -1, duration: 0 };
declare global { interface Window { __solarDiagnostics?: () => DiagnosticSnapshot; } }

/** Read-only development evidence. Counts come from the renderer and live scene. */
export function Diagnostics() {
  const { gl, camera, controls, scene, get } = useThree();
  const meter = useRef({ frames: 0, seconds: 0, fps: 0, sequence: 0 });
  useFrame((_, dt) => {
    const m = meter.current; m.frames++; m.sequence++; m.seconds += dt;
    if (m.seconds > .7) { m.fps = Math.round(m.frames / m.seconds); m.frames = 0; m.seconds = 0; }
  });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const context = gl.getContext(), debug = context.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(context.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER));
    const vendor = String(context.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : context.VENDOR));
    const webglVersion = String(context.getParameter(context.VERSION));
    window.__solarDiagnostics = () => {
      const s = useExplorer.getState();
      const focus = new Vector3(...(s.mode === 'body' ? orbitalPosition(bodyById[s.selected], simulation.days, s.scale) : [0, 0, 0] as [number, number, number]));
      const target = (controls as OrbitControls | null)?.target || new Vector3();
      let meshVertices = 0, triangles = 0, pointsVertices = 0, energyParticles = 0;
      scene.traverseVisible(object => {
        if (object instanceof Mesh) {
          const geometry = object.geometry;
          meshVertices += geometry.getAttribute('position')?.count || 0;
          triangles += (geometry.index?.count || geometry.getAttribute('position')?.count || 0) / 3;
        } else if (object instanceof Points) {
          const count = object.geometry.getAttribute('position')?.count || 0;
          pointsVertices += count;
          if (object.name === 'solar-energy-particles') energyParticles += count;
        }
      });
      const composer = renderPipeline.composer;
      const passes = composer?.passes.filter(pass => pass.enabled) || [];
      const bloom = passes.some(pass => {
        const effects = (pass as unknown as { effects?: { name: string }[] }).effects;
        return effects?.some(effect => effect.name === 'BloomEffect');
      });
      const buffer = gl.getDrawingBufferSize(new Vector2()), size = get().size;
      return {
        geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
        programs: gl.info.programs?.length || 0, calls: gl.info.render.calls, fps: meter.current.fps,
        camera: camera.position.toArray(), target: target.toArray(), focus: focus.toArray(),
        projectedTarget: focus.clone().project(camera).toArray(), targetOffset: target.distanceTo(focus),
        transitioning: cameraTelemetry.transitioning || cameraTelemetry.revision !== s.cameraRevision,
        mode: s.mode, selected: s.selected, days: simulation.days, quality: s.quality, scale: s.scale,
        fov: 'fov' in camera ? Number(camera.fov) : 42, dpr: gl.getPixelRatio(),
        drawingBuffer: { w: buffer.x, h: buffer.y }, viewport: { w: size.width, h: size.height },
        antialias: context.getContextAttributes()?.antialias || false, renderer, vendor, webglVersion,
        meshVertices, triangles, pointsVertices, energyParticles,
        postprocessing: { active: passes.length > 0, bloom, multisampling: composer?.multisampling || 0, passes: passes.length },
        frameSequence: meter.current.sequence, cameraTransitionDuration: cameraTelemetry.duration,
        sampledAt: simulation.sampledAt, animationElapsed: simulation.elapsed, animationDelta: simulation.animationDelta,
      };
    };
    return () => { delete window.__solarDiagnostics; };
  }, [gl, camera, controls, scene, get]);
  return null;
}
