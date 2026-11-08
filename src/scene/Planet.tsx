import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { texturePath } from '../data/texturePath';
import type { BodyData } from '../data/astronomy';
import type { Quality } from '../state/useExplorer';
import { simulation } from '../simulation/orbits';
import { SceneLabel } from './SceneLabel';
import { useLocalTexture } from './textureResources';
import { SaturnRing, SaturnSurfaceMaterial } from './SaturnRing';

/** Missing night data must contribute zero light, including while loading. */
export function applyEarthTextureFallback(material: THREE.MeshStandardMaterial, day: THREE.Texture | null, night: THREE.Texture | null, bodyColor: string) {
  material.map = day;
  material.color.set(day ? '#ffffff' : bodyColor);
  material.emissiveMap = night;
  material.emissive.set(night ? '#ffffff' : '#000000');
  material.emissiveIntensity = night ? 1.1 : 0;
  material.needsUpdate = true;
}

const atmosphereVertex = `varying vec3 vNormal; varying vec3 vView; void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`;
const atmosphereFragment = `varying vec3 vNormal;varying vec3 vView;uniform vec3 color;void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),3.2);gl_FragColor=vec4(color,rim*.36);}`;

export function Planet({ body, radius, quality, onClick, focused }: {body: BodyData; radius: number; quality: Quality; onClick: () => void; focused: boolean}) {
  const rotation = useRef<THREE.Group>(null);
  const surface = useRef<THREE.Mesh>(null);
  const cloud = useRef<THREE.Mesh>(null);
  const day = useLocalTexture(body.texture);
  const night = useLocalTexture(body.id === 'earth' ? texturePath('2k_earth_nightmap.jpg') : undefined);
  const clouds = useLocalTexture(body.id === 'earth' ? texturePath('2k_earth_clouds.jpg') : undefined, false);
  const ringTexture = useLocalTexture(body.id === 'saturn' ? texturePath('2k_saturn_ring_alpha.png') : undefined);
  const segments = quality === 'high' ? 96 : 48;
  const nightMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: body.color, roughness: 1, emissive: '#000000', emissiveIntensity: 0 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldNormal; varying vec3 vWorldPosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldNormal=normalize(mat3(modelMatrix)*normal); vWorldPosition=(modelMatrix*vec4(position,1.)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldNormal; varying vec3 vWorldPosition;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat nightMask=1.-smoothstep(-0.18,0.12,dot(normalize(vWorldNormal),normalize(-vWorldPosition)));totalEmissiveRadiance*=nightMask;');
    };
    return mat;
  }, [body.color]);
  useEffect(() => { applyEarthTextureFallback(nightMaterial, day, night, body.color); }, [day, night, nightMaterial, body.color]);
  useEffect(() => () => nightMaterial.dispose(), [nightMaterial]);
  useFrame(() => {
    const hours = Math.abs((body as BodyData & { rotationHours?: number }).rotationHours || 24);
    if (rotation.current) rotation.current.rotation.y = simulation.days * 24 / hours * Math.PI * 2;
    if (cloud.current) cloud.current.rotation.y = simulation.days * 0.019;
  });
  return <group rotation={[0, 0, -body.axialTilt * Math.PI / 180]}>
    <group ref={rotation}>
      <mesh ref={surface} castShadow={focused} receiveShadow={focused} onClick={(e) => {e.stopPropagation();onClick();}}>
        <sphereGeometry args={[radius, segments, segments]} />
        {body.id === 'earth' ? <primitive object={nightMaterial} attach="material" /> : body.id === 'saturn' ? <SaturnSurfaceMaterial texture={day} ringTexture={ringTexture} radius={radius} meshRef={surface} /> : <meshStandardMaterial key={day?.uuid||'fallback'} map={day} color={day ? '#ffffff' : body.color} roughness={1} />}
      </mesh>
      {body.id === 'earth' && clouds && <mesh ref={cloud} scale={1.012}>
        <sphereGeometry args={[radius, segments, segments]} />
        <meshStandardMaterial color="#ffffff" alphaMap={clouds} transparent opacity={0.52} depthWrite={false} />
      </mesh>}
      {focused && body.id === 'mars' && <SceneLabel labelId="feature-mars-olympus" subjectRadius={radius} surface position={[radius * .35, radius * .55, radius * .84]} text="奥林帕斯山" subtext="示意位置 · 约 22 km 高"/>}
      {focused && body.id === 'jupiter' && <SceneLabel labelId="feature-jupiter-red-spot" subjectRadius={radius} surface position={[radius * .55, -radius * .27, radius * .82]} text="大红斑" subtext="持续数百年的巨型风暴 · 示意位置"/>}
    </group>
    {['earth', 'venus', 'uranus', 'neptune'].includes(body.id) && <mesh scale={1.055}>
      <sphereGeometry args={[radius, 64, 48]} />
      <shaderMaterial vertexShader={atmosphereVertex} fragmentShader={atmosphereFragment} uniforms={{color: {value: new THREE.Color(body.id === 'venus' ? '#f2c985' : '#4a9bff')}}} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>}
    {body.id === 'saturn' && <SaturnRing radius={radius} texture={ringTexture} quality={quality} onClick={onClick} />}
    {body.id === 'uranus' && <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[radius * 1.815, radius * 1.84, 96]} /><meshBasicMaterial color="#879ba2" transparent opacity={0.1} side={THREE.DoubleSide} /></mesh>}
  </group>;
}
