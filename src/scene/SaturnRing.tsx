import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const ringVertex = /* glsl */ `
varying vec2 vRingUv;
varying vec3 vRingWorld;
varying vec3 vRingNormal;
void main(){
  vRingUv=uv;
  vec4 world=modelMatrix*vec4(position,1.);
  vRingWorld=world.xyz;
  vRingNormal=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*world;
}`;

const ringFragment = /* glsl */ `
uniform sampler2D uRingTexture;
uniform float uHasTexture;
uniform vec3 uPlanetCenter;
uniform float uPlanetRadius;
varying vec2 vRingUv;
varying vec3 vRingWorld;
varying vec3 vRingNormal;
void main(){
  vec4 sampleColor=texture2D(uRingTexture,vRingUv);
  float u=vRingUv.x;
  float band=.5+.5*sin(u*190.);
  float density=mix(.5+.22*band,sampleColor.a,uHasTexture);
  float edge=smoothstep(0.,.012,u)*(1.-smoothstep(.985,1.,u));
  float luminance=dot(sampleColor.rgb,vec3(.2126,.7152,.0722));
  float detail=mix(.5+.15*band,clamp(sqrt(luminance)*2.3,0.,1.),uHasTexture);
  vec3 sand=mix(vec3(.34,.245,.14),vec3(.88,.76,.55),detail);
  vec3 lightDirection=normalize(-vRingWorld);
  vec3 towardCenter=uPlanetCenter-vRingWorld;
  float closest=dot(towardCenter,lightDirection);
  float missDistance=sqrt(max(0.,dot(towardCenter,towardCenter)-closest*closest));
  float occultation=(1.-smoothstep(uPlanetRadius*.985,uPlanetRadius*1.018,missDistance))*step(0.,closest);
  float incidence=abs(dot(normalize(vRingNormal),lightDirection));
  float illumination=.33+.67*sqrt(incidence);
  vec3 color=sand*illumination*mix(1.,.16,occultation);
  gl_FragColor=vec4(color,density*edge*.96);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Thin ice-particle annulus. The planet's shadow is an analytic ray/sphere test. */
export function SaturnRing({ radius, texture, quality, onClick }: { radius: number; texture: THREE.Texture | null; quality: 'high' | 'low'; onClick?: () => void }) {
  const mesh=useRef<THREE.Mesh>(null);
  const geometry=useMemo(()=>{
    const geometry=new THREE.RingGeometry(radius*1.25,radius*2.32,quality==='high'?192:96,1);
    const position=geometry.attributes.position;
    const uv=geometry.attributes.uv;
    for(let i=0;i<position.count;i++)uv.setXY(i,(Math.hypot(position.getX(i),position.getY(i))/radius-1.25)/1.07,.5);
    return geometry;
  },[radius,quality]);
  const fallback=useMemo(()=>{
    const texture=new THREE.DataTexture(new Uint8Array([190,171,135,220]),1,1);
    texture.needsUpdate=true;
    return texture;
  },[]);
  const uniforms=useMemo(()=>({uRingTexture:{value:texture||fallback},uHasTexture:{value:texture?1:0},uPlanetCenter:{value:new THREE.Vector3()},uPlanetRadius:{value:radius}}),[radius,texture,fallback]);
  useFrame(()=>{if(mesh.current)mesh.current.getWorldPosition(uniforms.uPlanetCenter.value);});
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  useEffect(()=>()=>fallback.dispose(),[fallback]);
  return <mesh ref={mesh} geometry={geometry} rotation={[-Math.PI/2,0,0]} onClick={onClick?(event)=>{event.stopPropagation();onClick();}:undefined}>
    <shaderMaterial vertexShader={ringVertex} fragmentShader={ringFragment} uniforms={uniforms} transparent side={THREE.DoubleSide} depthWrite={false} />
  </mesh>;
}

/** Ring-plane intersection shades Saturn's cloud tops without a shadow-map allocation. */
export function SaturnSurfaceMaterial({ texture, ringTexture, radius, meshRef }: { texture: THREE.Texture|null; ringTexture: THREE.Texture|null; radius:number; meshRef:RefObject<THREE.Mesh|null> }) {
  const uniforms=useMemo(()=>({
    uSaturnCenter:{value:new THREE.Vector3()},
    uSaturnRingNormal:{value:new THREE.Vector3(0,1,0)},
    uSaturnRadius:{value:radius},
    uSaturnRingMap:{value:ringTexture},
    uSaturnHasRingMap:{value:ringTexture?1:0},
  }),[radius,ringTexture]);
  const material=useMemo(()=>{
    const material=new THREE.MeshStandardMaterial({map:texture,color:texture?'#ffffff':'#d6c39b',roughness:1});
    material.onBeforeCompile=(shader)=>{
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSaturnWorldPosition;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvSaturnWorldPosition=(modelMatrix*vec4(position,1.)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vSaturnWorldPosition;
uniform vec3 uSaturnCenter;
uniform vec3 uSaturnRingNormal;
uniform float uSaturnRadius;
uniform sampler2D uSaturnRingMap;
uniform float uSaturnHasRingMap;
`)
        .replace('#include <opaque_fragment>',/* glsl */ `
vec3 ringLightDirection=normalize(-vSaturnWorldPosition);
float planeDenominator=dot(ringLightDirection,uSaturnRingNormal);
if(abs(planeDenominator)>.0001){
  float planeDistance=dot(uSaturnCenter-vSaturnWorldPosition,uSaturnRingNormal)/planeDenominator;
  if(planeDistance>uSaturnRadius*.0005){
    vec3 ringIntersection=vSaturnWorldPosition+ringLightDirection*planeDistance-uSaturnCenter;
    float ringRadius=length(ringIntersection)/uSaturnRadius;
    float ringCoordinate=(ringRadius-1.25)/1.07;
    if(ringCoordinate>0.&&ringCoordinate<1.){
      float ringAlpha=mix(.65,texture2D(uSaturnRingMap,vec2(ringCoordinate,.5)).a,uSaturnHasRingMap);
      float ringPenumbra=smoothstep(0.,.015,ringCoordinate)*(1.-smoothstep(.985,1.,ringCoordinate));
      outgoingLight*=1.-ringAlpha*ringPenumbra*.78;
    }
  }
}
#include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=> 'saturn-analytic-ring-shadow-v1';
    return material;
  },[texture,uniforms]);
  useFrame(()=>{
    if(!meshRef.current)return;
    meshRef.current.getWorldPosition(uniforms.uSaturnCenter.value);
    uniforms.uSaturnRingNormal.value.set(0,1,0).transformDirection(meshRef.current.matrixWorld);
  });
  useEffect(()=>()=>material.dispose(),[material]);
  return <primitive object={material} attach="material" />;
}
