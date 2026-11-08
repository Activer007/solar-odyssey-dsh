import { useRef, useMemo, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import type { EffectComposer as EffectComposerImpl } from 'postprocessing';
import * as THREE from 'three';
import { bodies } from '../data/astronomy';
import type { BodyData } from '../data/astronomy';
import { useExplorer } from '../state/useExplorer';
import { orbitalPosition, bodyRadius, simulation } from '../simulation/orbits';
import { Planet } from './Planet';
import { Sun } from './Sun';
import { SolarInterior } from './SolarInterior';
import { CameraRig } from './CameraRig';
import { Space } from './Space';
import { SceneLabel } from './SceneLabel';
import { Diagnostics } from './Diagnostics';
import { disposeTextureResources } from './textureResources';
import { RendererHealth } from './RendererHealth';
import { solarLessons } from '../data/solarLessons';
import { renderPipeline } from './renderPipeline';
import { SceneLabelLayout } from './SceneLabelLayout';
import { SimulationClock } from './SimulationClock';

function PostEffects() {
  const owned = useRef<EffectComposerImpl | null>(null);
  const connect = useCallback((value: EffectComposerImpl | null) => {
    const previous = owned.current, composer = value ?? null;
    owned.current = composer;
    if (composer || renderPipeline.composer === previous) renderPipeline.composer = composer;
  }, []);
  const gl = useThree(s => s.gl);
  const context = gl.getContext();
  const samples = 'MAX_SAMPLES' in context ? Math.min(4, Number(context.getParameter(context.MAX_SAMPLES)) || 0) : 0;
  // MSAA is applied to a replaceable render target. The canvas context's
  // antialias attribute is fixed at creation and never pretends to toggle.
  return <EffectComposer ref={connect} multisampling={samples}>
    <Bloom luminanceThreshold={1.05} luminanceSmoothing={.4} intensity={.4} mipmapBlur />
  </EffectComposer>;
}

function Orbit({body}: {body:BodyData}) {
  const scale=useExplorer(s=>s.scale);
  const geo=useMemo(()=>{
    const points=[];
    for(let i=0;i<=256;i++) points.push(new THREE.Vector3(...orbitalPosition(body,body.periodDays*i/256,scale)));
    return new THREE.BufferGeometry().setFromPoints(points);
  },[body,scale]);
  useEffect(()=>()=>geo.dispose(),[geo]);
  return <lineLoop geometry={geo}><lineBasicMaterial color="#426076" transparent opacity={.3}/></lineLoop>;
}
function Celestial({body}: {body:BodyData}) {
  const group=useRef<THREE.Group>(null);
  const scale=useExplorer(s=>s.scale), quality=useExplorer(s=>s.quality), mode=useExplorer(s=>s.mode), selected=useExplorer(s=>s.selected), labels=useExplorer(s=>s.labels), paused=useExplorer(s=>s.paused), flare=useExplorer(s=>s.flare);
  const radius=bodyRadius(body,scale);
  useFrame(()=>{if(group.current)group.current.position.set(...orbitalPosition(body,simulation.days,scale));},-1);
  const select=()=>useExplorer.getState().selectBody(body.id);
  return <group ref={group}>
    {body.id==='sun' ? <Sun radius={radius} quality={quality} paused={paused} flare={flare} onClick={select}/> : <Planet body={body} radius={radius} quality={quality} onClick={select} focused={mode==='body'&&selected===body.id}/>}
    {mode==='overview'&&labels&&<SceneLabel labelId={`body-${body.id}`} priority={selected===body.id?100:50}
      subjectRadius={radius*(body.id==='saturn'?2.4:body.id==='uranus'?1.84:1)} position={[0,radius+(scale==='real'?0:1.8),0]} text={body.name} color={body.color}
      subtext={scale==='real'?'辅助定位 · 标记大小非天体直径':undefined} className={`body-label ${scale==='real'?'real-marker':''}`} onClick={select}/>}
  </group>;
}
function World() {
  const mode=useExplorer(s=>s.mode), quality=useExplorer(s=>s.quality), orbits=useExplorer(s=>s.orbits), selectedLayer=useExplorer(s=>s.selectedLayer), opacity=useExplorer(s=>s.opacity), exploded=useExplorer(s=>s.exploded), energy=useExplorer(s=>s.energy), paused=useExplorer(s=>s.paused);
  const selected=useExplorer(s=>s.selected);
  const lessonStep=useExplorer(s=>s.lessonStep);
  const lesson=lessonStep===null?null:solarLessons[lessonStep];
  return <>
    <color attach="background" args={['#05080d']}/>
    <SimulationClock/><Space quality={quality}/>
    <ambientLight intensity={.075}/>
    <pointLight position={[0,0,0]} intensity={3.2} decay={0} color="#fff5e6"/>
    {mode==='interior' ? <><ambientLight intensity={1.3}/><SolarInterior radius={5} quality={quality} selectedLayer={selectedLayer} onSelect={id=>useExplorer.getState().selectLayer(id)} opacity={opacity} exploded={exploded} energy={energy} energyStage={lesson?.stage} highlightedLayers={lesson?.layers} paused={paused}/></> : <>
      {mode==='overview'&&orbits&&bodies.slice(1).map(b=><Orbit key={b.id} body={b}/>)}
      {bodies.filter(body=>mode==='overview'||body.id===selected).map(body=><Celestial key={body.id} body={body}/>)}
    </>}
    <CameraRig/><Diagnostics/><RendererHealth/><SceneLabelLayout/>
    {quality==='high'&&<PostEffects/>}
  </>;
}
export function Scene() {
  useEffect(()=>()=>disposeTextureResources(),[]);
  const quality=useExplorer(s=>s.quality);
  const navOpen=useExplorer(s=>s.navOpen), infoOpen=useExplorer(s=>s.infoOpen);
  return <div className={`scene-viewport ${navOpen?'':'nav-collapsed'} ${infoOpen?'':'info-collapsed'}`}>
    <Canvas shadows={quality==='high'} dpr={quality==='high' ? [1,1.5] : 1} camera={{position:[0,185,260],fov:42,near:.05,far:5000}} gl={{antialias:false,alpha:false,powerPreference:'high-performance',toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:1}} fallback={<div className="webgl-fallback">此设备未能启用 WebGL。请使用支持 WebGL 2 的现代浏览器并启用硬件加速。</div>}><World/></Canvas>
  </div>;
}
