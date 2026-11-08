import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BackSide, Group, MeshBasicMaterial, ShaderMaterial, Vector3, CatmullRomCurve3 } from 'three';
import { coronaFragmentShader, sunFragmentShader, sunVertexShader } from './solarShaders';
import { simulation } from '../simulation/clock';

export interface SunProps {
  radius: number;
  quality: 'high' | 'low';
  flare: number;
  paused: boolean;
  onClick?: () => void;
}

function Prominences({ quality, time, flare }: { quality: 'high' | 'low'; time: React.RefObject<number>; flare: React.RefObject<number> }) {
  const group = useRef<Group>(null);
  const curves = useMemo(() => Array.from({ length: quality === 'high' ? 10 : 5 }, (_, i) => {
    const sectors = [.3, .34, .42, 1.8, 1.86, 3.4, 3.46, 4.65, 4.72, 5.6];
    const a = sectors[i * (quality === 'high' ? 1 : 2)];
    const width = .035 + (i % 3) * .012;
    const height = i === 4 ? .15 : .045 + (i % 4) * .02;
    return new CatmullRomCurve3(Array.from({ length: 33 }, (__, j) => {
      const u = j / 32;
      const envelope = Math.sin(u * Math.PI);
      const angle = a + (u - .5) * width * 2 + Math.sin(u * Math.PI * 7 + i) * .004 * envelope;
      const r = 1.003 + envelope * height + Math.sin(u * Math.PI * 9 + i * 2) * .003 * envelope;
      const z = Math.sin(i * 4.1) * .18;
      const planarRadius = Math.sqrt(r * r - z * z);
      return new Vector3(Math.cos(angle) * planarRadius, Math.sin(angle) * planarRadius, z);
    }));
  }), [quality]);
  useFrame(() => {
    if (!group.current) return;
    group.current.children.forEach((child, i) => {
      const pulse = .6 + Math.sin(time.current * .55 + Math.floor(i / 2)) * .18 + flare.current * .4;
      ((child as import('three').Mesh).material as MeshBasicMaterial).opacity = pulse * (i % 2 ? .19 : .85);
    });
  });
  return <group ref={group}>{curves.flatMap((curve, i) => [<mesh key={`${i}-core`}>
    <tubeGeometry args={[curve, quality === 'high' ? 60 : 28, .003 + (i % 3) * .0008, 5, false]} />
    <meshBasicMaterial color={i % 2 ? '#ffad41' : '#ff6c1c'} transparent opacity={.65} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
  </mesh>, <mesh key={`${i}-glow`}>
    <tubeGeometry args={[curve, quality === 'high' ? 60 : 28, .009 + (i % 3) * .001, 5, false]} />
    <meshBasicMaterial color="#ff6114" transparent opacity={.15} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
  </mesh>])}</group>;
}

export function Sun({ radius, quality, flare, paused, onClick }: SunProps) {
  const root = useRef<Group>(null);
  const surface = useRef<ShaderMaterial>(null);
  const corona = useRef<ShaderMaterial>(null);
  const time = useRef(0);
  const flareStrength = useRef(0);
  const lastFlare = useRef(flare);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uFlare: { value: 0 } }), []);
  const coronaUniforms = useMemo(() => ({ uTime: { value: 0 }, uFlare: { value: 0 }, uScale: { value: 1.55 }, uOpacity: { value: .65 } }), []);
  useFrame(() => {
    const delta = simulation.animationDelta;
    if (!paused) time.current += delta;
    if (flare !== lastFlare.current) { flareStrength.current = 2.5; lastFlare.current = flare; }
    if (!paused) flareStrength.current *= Math.exp(-delta * .65);
    if (surface.current) {
      surface.current.uniforms.uTime.value = time.current;
      surface.current.uniforms.uFlare.value = flareStrength.current;
    }
    if (corona.current) {
      corona.current.uniforms.uTime.value = time.current;
      corona.current.uniforms.uFlare.value = flareStrength.current;
    }
    if (root.current && !paused) root.current.rotation.y += delta * .012;
  });
  return <group scale={radius}>
    <group ref={root}>
      <mesh onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}>
        <sphereGeometry args={[1, quality === 'high' ? 96 : 48, quality === 'high' ? 64 : 32]} />
        <shaderMaterial ref={surface} vertexShader={sunVertexShader} fragmentShader={sunFragmentShader} uniforms={uniforms} />
      </mesh>
      <Prominences quality={quality} time={time} flare={flareStrength} />
    </group>
    <mesh scale={1.55} raycast={() => undefined}>
      <sphereGeometry args={[1, quality === 'high' ? 80 : 40, 48]} />
      <shaderMaterial ref={corona} vertexShader={sunVertexShader} fragmentShader={coronaFragmentShader} uniforms={coronaUniforms} transparent side={BackSide} depthWrite={false} blending={AdditiveBlending} />
    </mesh>
    <mesh scale={1.012} raycast={() => undefined}>
      <sphereGeometry args={[1, 64, 40]} />
      <meshBasicMaterial color="#ff7a15" side={BackSide} transparent opacity={.4} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  </group>;
}

export default Sun;
