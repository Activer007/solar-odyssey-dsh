import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { SceneLabel } from './SceneLabel';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshBasicMaterial, Points, ShaderMaterial } from 'three';
import { displayRadius, solarLayers } from '../data/solarStructure';
import type { SolarLayerId } from '../data/solarStructure';
import { createSolarShellGeometry } from './solarGeometry';
import { energyKindsForStage, energyPathColor, sampleEnergyPath } from './solarEnergy';
import type { EnergyStage } from './solarEnergy';
import { interiorFragmentShader, interiorVertexShader } from './solarShaders';
import { simulation } from '../simulation/clock';

export interface SolarInteriorProps {
  radius: number;
  selectedLayer: SolarLayerId | null;
  onSelect: (id: SolarLayerId) => void;
  opacity: number;
  exploded: boolean;
  energy: boolean;
  energyStage?: EnergyStage | null;
  highlightedLayers?: readonly SolarLayerId[];
  paused: boolean;
  quality: 'high' | 'low';
}

function Layer({ index, selectedLayer, highlightedLayers, onSelect, opacity, exploded, paused, quality }: Omit<SolarInteriorProps, 'radius' | 'energy'> & { index: number }) {
  const definition = solarLayers[index];
  const group = useRef<Group>(null);
  const material = useRef<ShaderMaterial>(null);
  const time = useRef(0);
  const geometry = useMemo(() => createSolarShellGeometry(definition.displayInner, definition.displayOuter, {
    widthSegments: quality === 'high' ? 80 : 40, heightSegments: quality === 'high' ? 56 : 32,
  }), [definition.displayInner, definition.displayOuter, quality]);
  const selected = highlightedLayers !== undefined ? highlightedLayers.includes(definition.id) : selectedLayer === definition.id;
  const focused = highlightedLayers !== undefined || selectedLayer !== null;
  const muted = focused && !selected;
  const targetOpacity = muted ? .045 : index < 3 ? 1 : Math.max(.1, opacity);
  const uniforms = useMemo(() => ({
    uColor: { value: new Color(definition.color) }, uTime: { value: 0 },
    uOpacity: { value: 1 }, uKind: { value: index },
  }), [definition.color, index]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => {
    if (!paused) time.current += simulation.animationDelta;
    if (material.current) {
      material.current.uniforms.uTime.value = time.current;
      material.current.uniforms.uOpacity.value += (targetOpacity - material.current.uniforms.uOpacity.value) * (1 - Math.exp(-delta * 6));
    }
    if (group.current) {
      const target = exploded ? (index - 2) * .155 : 0;
      group.current.position.x += (target - group.current.position.x) * (1 - Math.exp(-delta * 4));
    }
  });
  const click = (event: import('@react-three/fiber').ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect(definition.id); };
  return <group ref={group}>
    <mesh geometry={geometry} onClick={click} renderOrder={muted ? index : 20 + index}>
      <shaderMaterial ref={material} vertexShader={interiorVertexShader} fragmentShader={interiorFragmentShader} uniforms={uniforms} transparent depthWrite={!muted && index < 3} />
    </mesh>
    <mesh rotation={[Math.PI / 2, 0, Math.PI / 2]} raycast={() => undefined}>
      <torusGeometry args={[definition.displayOuter, selected ? .004 : .0015, 4, 96, Math.PI]} />
      <meshBasicMaterial color={definition.color} transparent opacity={selected ? .85 : .25} toneMapped={false} depthWrite={false} />
    </mesh>
    {selectedLayer === definition.id ? <SceneLabel labelId={`layer-${definition.id}`} priority={100} subjectRadius={definition.displayOuter} position={[displayRadius(definition.id, .5) * .6, displayRadius(definition.id, .5) * .8, .02]} text={definition.name} color={definition.color} className="solar-layer-label" /> : null}
  </group>;
}

const energyVertex = /* glsl */ `
attribute vec3 color;
varying vec3 vColor;
uniform float uSize;
void main(){
  vColor=color;
  vec4 mv=modelViewMatrix*vec4(position,1.);
  gl_PointSize=clamp(uSize/-mv.z,1.5,10.);
  gl_Position=projectionMatrix*mv;
}`;
const energyFragment = /* glsl */ `
varying vec3 vColor;
void main(){
  float d=length(gl_PointCoord-.5)*2.;
  if(d>1.)discard;
  gl_FragColor=vec4(vColor,pow(1.-d,1.3)*.9);
  #include <colorspace_fragment>
}`;

/** Guided steps use fewer dots so a single process keeps its direction and color legible. */
export function energyParticleCount(quality: 'high' | 'low', stage?: EnergyStage | null): number {
  const high = quality === 'high';
  switch (stage) {
    case 'fusion': return high ? 100 : 40;
    case 'radiative': return high ? 160 : 60;
    case 'convective': return high ? 80 : 40;
    case 'atmosphere': return high ? 240 : 100;
    default: return high ? 480 : 160;
  }
}

function EnergyParticles({ quality, paused, visible, stage }: { quality: 'high' | 'low'; paused: boolean; visible: boolean; stage?: EnergyStage | null }) {
  const points = useRef<Points>(null);
  const elapsed = useRef(0);
  const count = energyParticleCount(quality, stage);
  const kinds = useMemo(() => energyKindsForStage(stage), [stage]);
  const scratchColor = useMemo(() => new Color(), []);
  const geometry = useMemo(() => {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const kind = kinds[i % kinds.length], phase = (i * .61803398875) % 1;
      sampleEnergyPath(kind, phase, Math.floor(i / kinds.length) % 5).toArray(positions, i * 3);
      scratchColor.set(energyPathColor(kind, phase)).toArray(colors, i * 3);
    }
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    return geometry;
  }, [count, kinds, scratchColor]);
  const uniforms = useMemo(() => ({ uSize: { value: stage ? 50 : 65 } }), [stage]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    if (paused || !visible) return;
    elapsed.current += simulation.animationDelta;
    const t = elapsed.current;
    const position = geometry.attributes.position, color = geometry.attributes.color;
    for (let i = 0; i < count; i++) {
      const kind = kinds[i % kinds.length], phase = (t * .09 + i * .61803398875) % 1;
      const point = sampleEnergyPath(kind, phase, Math.floor(i / kinds.length) % 5);
      position.setXYZ(i, point.x, point.y, point.z);
      scratchColor.set(energyPathColor(kind, phase));
      color.setXYZ(i, scratchColor.r, scratchColor.g, scratchColor.b);
    }
    position.needsUpdate = true;
    color.needsUpdate = true;
  });
  return <points name="solar-energy-particles" ref={points} geometry={geometry} visible={visible} renderOrder={40} frustumCulled={false} raycast={() => undefined}>
    <shaderMaterial vertexShader={energyVertex} fragmentShader={energyFragment} uniforms={uniforms} transparent depthWrite={false} blending={AdditiveBlending} />
  </points>;
}

function FlowLines({ visible, quality, stage }: { visible: boolean; quality: 'high' | 'low'; stage?: EnergyStage | null }) {
  const curves = useMemo(() => {
    const result: BufferGeometry[] = [], color = new Color();
    const lanes = quality === 'high' ? 5 : 3, steps = quality === 'high' ? 80 : 48;
    for (const kind of energyKindsForStage(stage)) for (let lane = 0; lane < lanes; lane++) {
      const positions: number[] = [], colors: number[] = [];
      for (let j = 0; j < steps - 1; j++) for (const sample of [j, j + 1]) {
        const phase = sample / (steps - 1);
        sampleEnergyPath(kind, phase, lane).toArray(positions, positions.length);
        color.set(energyPathColor(kind, phase)).toArray(colors, colors.length);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
      result.push(geometry);
    }
    return result;
  }, [quality, stage]);
  useEffect(() => () => curves.forEach((curve) => curve.dispose()), [curves]);
  return <group visible={visible}>{curves.map((geometry, i) => <lineSegments key={i} geometry={geometry} raycast={() => undefined} renderOrder={39}>
    <lineBasicMaterial vertexColors transparent opacity={stage === 'convective' ? .9 : .55} toneMapped={false} depthWrite={false} />
  </lineSegments>)}</group>;
}

/** Four input nuclei and an illustrative helium nucleus, greatly enlarged and accelerated. */
function FusionModel({ visible, paused }: { visible: boolean; paused: boolean }) {
  const hydrogens = useRef<Group>(null);
  const helium = useRef<Group>(null);
  const wave = useRef<Mesh>(null);
  const elapsed = useRef(0);
  useFrame(() => {
    if (!visible) return;
    if (!paused) elapsed.current += simulation.animationDelta;
    const progress = (elapsed.current / 7) % 1;
    const convergence = Math.max(.05, 1 - Math.min(1, progress / .62));
    if (hydrogens.current) {
      hydrogens.current.visible = progress < .62;
      hydrogens.current.children.forEach((child, i) => {
        const angle = i * Math.PI * .5 + elapsed.current * .15;
        child.position.set(Math.cos(angle) * .075 * convergence, Math.sin(angle) * .075 * convergence, Math.sin(angle * 2) * .025 * convergence);
      });
    }
    if (helium.current) {
      helium.current.visible = progress >= .62;
      helium.current.rotation.y = elapsed.current * .8;
    }
    if (wave.current) {
      const released = Math.max(0, (progress - .62) / .38);
      wave.current.visible = released > 0;
      wave.current.scale.setScalar(.01 + released * .34);
      (wave.current.material as MeshBasicMaterial).opacity = (1 - released) * .8;
    }
  });
  return <group visible={visible} position={[.105, 0, .105]}>
    <group ref={hydrogens}>{[0, 1, 2, 3].map((i) => <mesh key={i}>
      <sphereGeometry args={[.012, 12, 8]} /><meshBasicMaterial color="#fff6ce" toneMapped={false} />
    </mesh>)}</group>
    <group ref={helium}>{[[-.008, -.008, 0], [.008, -.008, 0], [0, .008, -.008], [0, .008, .008]].map((p, i) => <mesh key={i} position={p as [number, number, number]}>
      <sphereGeometry args={[.012, 12, 8]} /><meshBasicMaterial color={i < 2 ? '#ffb463' : '#fff4b5'} toneMapped={false} />
    </mesh>)}</group>
    <mesh ref={wave} rotation={[0, Math.PI / 4, 0]}>
      <torusGeometry args={[1, .008, 4, 48]} /><meshBasicMaterial color="#fff1a8" transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
    </mesh>
  </group>;
}

export function SolarInterior(props: SolarInteriorProps) {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (group.current) {
      const scale = group.current.scale.x;
      group.current.scale.setScalar(scale + (props.radius - scale) * (1 - Math.exp(-delta * 5)));
    }
  });
  return <group ref={group} scale={props.radius * .84}>
    {solarLayers.map((layer, index) => <Layer key={layer.id} {...props} index={index} />)}
    <FlowLines visible={props.energy && !props.exploded} quality={props.quality} stage={props.energyStage} />
    <EnergyParticles quality={props.quality} paused={props.paused} visible={props.energy && !props.exploded} stage={props.energyStage} />
    <FusionModel visible={props.energy && !props.exploded && (!props.energyStage || props.energyStage === 'fusion')} paused={props.paused} />
  </group>;
}

export default SolarInterior;
