import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { PerspectiveCamera, Vector3 } from 'three';
import { bodies, bodyById } from '../data/astronomy';
import { bodyRadius, orbitalPosition, simulation } from '../simulation/orbits';
import { useExplorer } from '../state/useExplorer';
import { cameraTelemetry } from './Diagnostics';
import { cameraPathSlice, constrainCameraSegment, planCameraPath, sampleCameraPath, type CameraSphere } from './cameraMotion';

interface Flight {
  path: Vector3[]; fromTarget: Vector3; initialFocus: Vector3; elapsed: number; duration: number; previousProgress: number;
}

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, gl, size } = useThree();
  const mode = useExplorer(s => s.mode), selected = useExplorer(s => s.selected), scale = useExplorer(s => s.scale);
  const revision = useExplorer(s => s.cameraRevision), view = useExplorer(s => s.view);
  const cameraMode = useExplorer(s => s.cameraMode), exploded = useExplorer(s => s.exploded);
  const radius = mode === 'interior' ? 5 : mode === 'body' ? bodyRadius(bodyById[selected], scale) : 5;
  const fit = Math.max(1, .9 / Math.max(.25, size.width / size.height));
  const flight = useRef<Flight | null>(null);
  const previousFocus = useRef(new Vector3()), previousFit = useRef(fit), manual = useRef(false);
  const keys = useRef(new Set<string>());
  const scratch = useMemo(() => ({
    focus: new Vector3(), offset: new Vector3(), goal: new Vector3(), desired: new Vector3(),
    delta: new Vector3(), forward: new Vector3(), right: new Vector3(), start: new Vector3(),
  }), []);
  const spheres = useMemo<CameraSphere[]>(() => bodies.map(() => ({ center: new Vector3(), radius: 1 })), []);
  const interiorSphere = useMemo<CameraSphere[]>(() => [{ center: new Vector3(), radius: 1 }], []);
  const focusedSphere = useMemo<CameraSphere[]>(() => [{ center: new Vector3(), radius: 1 }], []);
  const focusNow = () => scratch.focus.set(...(mode === 'body'
    ? orbitalPosition(bodyById[selected], simulation.days, scale) : [0, 0, 0] as [number, number, number]));
  const obstacles = () => {
    if (mode === 'interior') {
      interiorSphere[0].radius = radius * (exploded ? 1.95 : 1.3);
      return interiorSphere;
    }
    if (mode === 'body') {
      // Close-up scenes contain only this body. Invisible planets must not
      // displace a following camera or invalidate its framing destination.
      focusedSphere[0].center.set(...orbitalPosition(bodyById[selected], simulation.days, scale));
      focusedSphere[0].radius = radius * 1.16;
      return focusedSphere;
    }
    bodies.forEach((body, i) => {
      spheres[i].center.set(...orbitalPosition(body, simulation.days, scale));
      spheres[i].radius = bodyRadius(body, scale) * 1.16;
    });
    return spheres;
  };
  const limits = () => ({
    min: mode === 'overview' ? .3 : radius * (mode === 'interior' && exploded ? 1.95 : 1.3),
    max: mode === 'overview' ? 2100 : Math.max(radius * 25, 5),
  });
  const goalNow = (focus: Vector3) => {
    const offset = scratch.offset;
    if (mode === 'overview') {
      offset.set(...(view === 'top' ? [0, 310, .01] : view === 'side' ? [0, 16, 330] : [0, 185, 260]) as [number, number, number]).multiplyScalar(fit);
    } else {
      const distance = (selected === 'saturn' ? 6.8 : selected === 'uranus' ? 6 : mode === 'interior' ? 4.8 : 4) * fit;
      offset.set(...(view === 'top' ? [0, distance, .001] : view === 'side' ? [0, .05, distance]
        : [mode === 'interior' ? 1.4 : 0, mode === 'interior' ? 1 : .55, distance]) as [number, number, number]).multiplyScalar(radius);
      if (mode === 'body' && selected !== 'sun' && (view === 'free' || view === 'night')) {
        offset.copy(focus).multiplyScalar(view === 'night' ? 1 : -1); offset.y = 0;
        offset.normalize().applyAxisAngle(camera.up, view === 'night' ? 0 : .5).multiplyScalar(distance * radius);
        offset.y = radius * (view === 'night' ? .1 : selected === 'saturn' ? 2.5 : .55);
      }
    }
    return scratch.goal.copy(focus).add(offset);
  };

  // Navigation owns flights; layout does not restart them.
  useEffect(() => {
    const c = controls.current; if (!c) return;
    // A new flight must not inherit the previous gesture's angular/pan inertia.
    const savedPosition = camera.position.clone(), savedTarget = c.target.clone();
    c.enableDamping = false; c.update(); c.enableDamping = true;
    camera.position.copy(savedPosition); c.target.copy(savedTarget);
    const focus = focusNow().clone();
    const path = planCameraPath(camera.position, goalNow(focus), obstacles());
    camera.position.copy(path[0]);
    flight.current = {
      path, fromTarget: c.target.clone(), initialFocus: focus, elapsed: 0, previousProgress: 0,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? .1 : 1.65,
    };
    cameraTelemetry.transitioning = true; cameraTelemetry.revision = revision;
    cameraTelemetry.duration = flight.current.duration;
    previousFocus.current.copy(focus); previousFit.current = fit; manual.current = false;
    c.minDistance = 0; c.maxDistance = 5000;
    const perspective = camera as PerspectiveCamera;
    perspective.near = mode === 'overview' ? .05 : Math.max(radius * .005, .000001);
    perspective.far = 5000; perspective.updateProjectionMatrix();
  }, [revision, mode, selected, scale, view, camera, radius]);

  useEffect(() => {
    const c = controls.current; if (!c) return;
    // Preserve a manual orbit and dolly; only adapt an untouched automatic framing.
    if (!manual.current && !flight.current && mode !== 'overview') {
      const offset = camera.position.clone().sub(c.target).multiplyScalar(fit / previousFit.current);
      camera.position.copy(constrainCameraSegment(camera.position, c.target.clone().add(offset), obstacles()));
      camera.lookAt(c.target);
    }
    previousFit.current = fit;
  }, [size.width, size.height]);

  useEffect(() => {
    const root = gl.domElement.closest<HTMLElement>('.app-shell');
    if (!root) return;
    const down = (event: KeyboardEvent) => {
      const s = useExplorer.getState();
      if (s.cameraMode !== 'fly' || s.helpOpen || s.settingsOpen || s.sourcesOpen || s.missionOpen ||
        event.ctrlKey || event.metaKey || event.altKey ||
        (event.target instanceof HTMLElement && event.target.closest('input,select,textarea,button,a,[contenteditable]')) ||
        !['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','ShiftLeft'].includes(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      keys.current.add(event.code);
    };
    const up = (event: KeyboardEvent) => { keys.current.delete(event.code); };
    const clear = () => keys.current.clear();
    root.addEventListener('keydown', down);
    root.addEventListener('keyup', up);
    root.addEventListener('focusout', clear);
    window.addEventListener('blur', clear);
    return () => {
      root.removeEventListener('keydown', down);
      root.removeEventListener('keyup', up);
      root.removeEventListener('focusout', clear);
      window.removeEventListener('blur', clear);
    };
  }, [gl]);

  const interrupt = () => {
    const c = controls.current; if (!c) return;
    if (flight.current) {
      const focus = focusNow(), { min, max } = limits();
      // Translate both ends together: no abandoned interpolated observation center.
      const offset = scratch.offset.copy(camera.position).sub(c.target);
      if (offset.lengthSq() < 1e-20) offset.set(0, .1, 1);
      offset.setLength(Math.max(min, Math.min(max, offset.length())));
      const candidate = scratch.desired.copy(focus).add(offset);
      camera.position.copy(constrainCameraSegment(candidate, candidate, obstacles()));
      c.target.copy(focus); previousFocus.current.copy(focus); flight.current = null;
      c.minDistance = min; c.maxDistance = max; c.update();
    }
    manual.current = true; cameraTelemetry.transitioning = false; gl.domElement.style.cursor = 'grabbing';
  };

  useFrame((_, rawDelta) => {
    const c = controls.current; if (!c) return;
    const focus = focusNow(), guards = obstacles(), dt = Math.min(rawDelta, .1);
    const start = scratch.start.copy(camera.position), active = flight.current, bounds = limits();
    c.minDistance = active ? 0 : bounds.min; c.maxDistance = active ? 5000 : bounds.max;
    if (active) {
      if (mode === 'body') start.add(scratch.delta.copy(focus).sub(previousFocus.current));
      active.elapsed += rawDelta;
      const progress = Math.min(1, active.elapsed / active.duration), eased = 1 - (1 - progress) ** 3;
      const shift = scratch.delta.copy(focus).sub(active.initialFocus);
      active.path[active.path.length - 1].copy(goalNow(focus)).sub(shift);
      const desired = sampleCameraPath(active.path, eased, scratch.desired).add(shift);
      let safe = start.clone();
      for (const waypoint of cameraPathSlice(active.path, active.previousProgress, eased)) {
        waypoint.add(shift);
        const next = constrainCameraSegment(safe, waypoint, guards);
        safe = next;
        if (next.distanceToSquared(waypoint) > radius * radius * 1e-10) break;
      }
      camera.position.copy(safe);
      c.target.lerpVectors(active.fromTarget, active.initialFocus, eased).add(shift); c.update();
      camera.position.copy(constrainCameraSegment(safe, camera.position, guards));
      active.previousProgress = eased;
      if (safe.distanceToSquared(desired) > radius * radius * 1e-10) {
        active.path = planCameraPath(safe, goalNow(focus), guards); active.initialFocus.copy(focus);
        active.fromTarget.copy(c.target); active.elapsed = 0; active.previousProgress = 0;
        active.duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? .1 : Math.max(.25, active.duration * (1 - progress));
      } else if (progress === 1) { c.target.copy(focus); flight.current = null; }
    } else {
      const shift = scratch.delta.copy(focus).sub(previousFocus.current);
      if (mode !== 'overview') {
        camera.position.add(shift); c.target.add(shift);
        // Following an orbit translates the observation frame. Sweep only the
        // user's movement in that frame, against the body's current guard.
        start.add(shift);
      }
      if (cameraMode === 'fly' && keys.current.size) {
        manual.current = true; camera.getWorldDirection(scratch.forward);
        scratch.right.crossVectors(scratch.forward, camera.up).normalize();
        const movement = scratch.delta.set(0,0,0);
        const speed = Math.max(radius * 1.8, mode === 'overview' ? 50 : .001) * dt * (keys.current.has('ShiftLeft') ? 3 : 1);
        if (keys.current.has('KeyW')) movement.addScaledVector(scratch.forward, speed);
        if (keys.current.has('KeyS')) movement.addScaledVector(scratch.forward, -speed);
        if (keys.current.has('KeyD')) movement.addScaledVector(scratch.right, speed);
        if (keys.current.has('KeyA')) movement.addScaledVector(scratch.right, -speed);
        if (keys.current.has('KeyE')) movement.y += speed;
        if (keys.current.has('KeyQ')) movement.y -= speed;
        const old = camera.position.clone();
        const safe = constrainCameraSegment(old, scratch.desired.copy(old).add(movement), guards);
        c.target.add(safe.clone().sub(old)); camera.position.copy(safe);
      }
    }
    if (!active) camera.position.copy(constrainCameraSegment(start, camera.position, guards));
    camera.lookAt(c.target); camera.updateMatrixWorld();
    previousFocus.current.copy(focus); cameraTelemetry.transitioning = flight.current !== null;
    if (flight.current) cameraTelemetry.duration = flight.current.duration;
  });

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.075}
    minDistance={mode === 'overview' ? .3 : radius * (mode === 'interior' && exploded ? 1.95 : 1.3)}
    maxDistance={mode === 'overview' ? 2100 : Math.max(radius * 25, 5)} enablePan={cameraMode === 'orbit'}
    rotateSpeed={.6} zoomSpeed={.8} onStart={interrupt} onEnd={() => { gl.domElement.style.cursor = 'auto'; }} />;
}
