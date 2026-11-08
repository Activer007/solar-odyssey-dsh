import { describe, it, expect } from 'vitest';
import { bodies, bodyById, solarLayers } from '../src/data/astronomy';
import { AU_KM, solveKepler, orbitalPosition, bodyRadius } from '../src/simulation/orbits';
import { useExplorer } from '../src/state/useExplorer';
describe('scientific orbit model', () => {
  it('solves the Kepler equation at high eccentricity and anomaly boundaries', () => {
    for(const e of [0,.0068,.2056,.8]) for(const m of [-Math.PI,0,.02,2,Math.PI*2]) {
      const E=solveKepler(m,e);expect(E-e*Math.sin(E)).toBeCloseTo(m,8);
    }
  });
  it('returns to the same position after one period for every planet', () => {
    for(const body of bodies.slice(1)) {
      const start=orbitalPosition(body,0,'real'), end=orbitalPosition(body,body.periodDays,'real');
      start.forEach((v,i)=>expect(end[i]).toBeCloseTo(v,7));
      const distance=Math.hypot(...start)/28;
      expect(distance).toBeGreaterThanOrEqual(body.orbit!.semiMajorAxisAU*(1-body.orbit!.eccentricity)-1e-8);
      expect(distance).toBeLessThanOrEqual(body.orbit!.semiMajorAxisAU*(1+body.orbit!.eccentricity)+1e-8);
    }
  });
  it('preserves the same physical radius-to-AU conversion for all nine bodies',()=>{
    for(const body of bodies) expect(bodyRadius(body,'real')/28).toBeCloseTo(body.radiusKm/AU_KM,12);
    expect(orbitalPosition(bodyById.sun,200,'real')).toEqual([0,0,0]);
  });
  it('has nine unique bodies, seven unique layers and traceable scientific sources',()=>{
    expect(new Set(bodies.map(x=>x.id)).size).toBe(9);expect(new Set(solarLayers.map(x=>x.id)).size).toBe(7);
    for(const entry of [...bodies,...solarLayers])expect(entry.source).toMatch(/^https:\/\//);
    for(const body of bodies.slice(1)){expect(body.periodDays).toBeGreaterThan(0);expect(body.orbit!.eccentricity).toBeLessThan(1);}
  });
});
describe('navigation state invariants',()=>{
  it('completes panorama → Sun → interior → exterior → panorama with coherent target',()=>{
    const s=useExplorer.getState();s.selectBody('jupiter');expect(useExplorer.getState().mode).toBe('body');
    s.selectBody('sun');s.enterInterior();expect(useExplorer.getState()).toMatchObject({mode:'interior',selected:'sun',selectedLayer:'core',cameraMode:'orbit'});
    s.exitInterior();expect(useExplorer.getState().mode).toBe('body');s.overview();expect(useExplorer.getState().mode).toBe('overview');
  });
});
