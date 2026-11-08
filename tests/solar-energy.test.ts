import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { displayRadius, solarLayerById } from '../src/data/solarStructure';
import { energyKindsForStage, energyPathColor, energyPathRanges, energySphericalPoint, sampleEnergyPath } from '../src/scene/solarEnergy';
import type { EnergyPathKind } from '../src/scene/solarEnergy';

const phases = Array.from({ length: 401 }, (_, index) => index / 400);
const radialSteps = (kind: EnergyPathKind, lane = 0) => phases.slice(1).map((phase, index) =>
  sampleEnergyPath(kind, phase, lane).length() - sampleEnergyPath(kind, phases[index], lane).length());

describe('canonical solar energy coordinates', () => {
  it('preserves the requested radius at high latitude instead of adding a Cartesian y component', () => {
    for (const radius of [.02, .25, .7, .93, 1, 1.22, 1.8]) {
      for (const latitude of [-1.4, -.8, 0, .8, 1.4]) {
        expect(energySphericalPoint(radius, .55, latitude).length()).toBeCloseTo(radius, 12);
      }
    }
  });

  it('keeps every actual sampled norm in its declared region and in the visible quadrant', () => {
    for (const kind of energyKindsForStage()) {
      const { min, max } = energyPathRanges[kind];
      for (const lane of [-3, 0, 1, 7, 32]) for (const phase of phases) {
        const point = sampleEnergyPath(kind, phase, lane);
        expect(point.toArray().every(Number.isFinite)).toBe(true);
        expect(point.length()).toBeGreaterThanOrEqual(min - 1e-12);
        expect(point.length()).toBeLessThanOrEqual(max + 1e-12);
        expect(point.x).toBeGreaterThan(0);
        expect(point.z).toBeGreaterThan(0);
      }
    }
  });

  it('uses canonical shell intervals for all internal transport and explicit external ranges', () => {
    expect(energyPathRanges.fusion.max).toBeLessThan(solarLayerById.core.displayOuter);
    expect(energyPathRanges.radiative.min).toBeGreaterThan(solarLayerById.radiative.displayInner);
    expect(energyPathRanges.radiative.max).toBeLessThan(solarLayerById.radiative.displayOuter);
    expect(energyPathRanges.convective.min).toBeGreaterThan(solarLayerById.convective.displayInner);
    expect(energyPathRanges.convective.max).toBeLessThan(solarLayerById.convective.displayOuter);
    expect(sampleEnergyPath('convective', .5, 0).length()).toBeLessThan(solarLayerById.convective.displayOuter);
    expect(energyPathRanges.conduction.min).toBeGreaterThanOrEqual(solarLayerById.transition.displayInner);
    expect(energyPathRanges.conduction.max).toBeLessThanOrEqual(solarLayerById.corona.displayOuter);
    expect(energyPathRanges.photons.min).toBe(solarLayerById.photosphere.displayOuter);
    expect(energyPathRanges.photons.max).toBeGreaterThan(solarLayerById.corona.displayOuter);
    expect(energyPathRanges.wind.min).toBe(displayRadius('corona', .5));
    expect(energyPathRanges.wind.max).toBeGreaterThan(solarLayerById.corona.displayOuter);
  });
});

describe('distinct solar energy transport mechanisms', () => {
  it('shows radial reversals within an overall outward radiative diffusion', () => {
    const steps = radialSteps('radiative', 4);
    expect(steps.some(step => step < -1e-5)).toBe(true);
    expect(steps.some(step => step > 1e-4)).toBe(true);
    expect(sampleEnergyPath('radiative', 1, 4).length()).toBeGreaterThan(sampleEnergyPath('radiative', 0, 4).length() + .3);
  });

  it('closes convection cells and distinguishes hot rising from cool sinking plasma', () => {
    for (const lane of [0, 2, 17]) {
      expect(sampleEnergyPath('convective', 0, lane).distanceTo(sampleEnergyPath('convective', 1, lane))).toBeLessThan(1e-12);
      const steps = radialSteps('convective', lane);
      expect(steps.slice(0, 200).every(step => step > 0)).toBe(true);
      expect(steps.slice(200).every(step => step < 0)).toBe(true);
    }
    const rising = new Color(energyPathColor('convective', .25)), sinking = new Color(energyPathColor('convective', .75));
    expect(rising.r).toBeGreaterThan(rising.b);
    expect(sinking.b).toBeGreaterThan(sinking.r);
  });

  it('conducts heat inward while photons and the depicted wind travel outward', () => {
    expect(radialSteps('conduction').every(step => step < 0)).toBe(true);
    expect(radialSteps('photons').every(step => step > 0)).toBe(true);
    expect(radialSteps('wind').every(step => step > 0)).toBe(true);
    expect(sampleEnergyPath('conduction', 0, 0).length()).toBeGreaterThan(solarLayerById.corona.displayInner);
    expect(sampleEnergyPath('conduction', 1, 0).length()).toBeLessThan(solarLayerById.transition.displayOuter);
  });

  it('connects two photospheric magnetic footpoints through the corona rather than escaping outward', () => {
    const first = sampleEnergyPath('magnetic', 0, 2), last = sampleEnergyPath('magnetic', 1, 2);
    expect(first.length()).toBeCloseTo(solarLayerById.photosphere.displayOuter, 12);
    expect(last.length()).toBeCloseTo(first.length(), 12);
    expect(first.distanceTo(last)).toBeGreaterThan(.1);
    expect(sampleEnergyPath('magnetic', .5, 2).length()).toBeGreaterThan(solarLayerById.corona.displayInner);
    expect(radialSteps('magnetic').some(step => step < 0)).toBe(true);
  });

  it('selects the teaching step mechanisms without omitting inward atmospheric transport', () => {
    expect(energyKindsForStage('fusion')).toEqual(['fusion']);
    expect(energyKindsForStage('radiative')).toEqual(['radiative']);
    expect(energyKindsForStage('convective')).toEqual(['convective']);
    expect(energyKindsForStage('atmosphere')).toEqual(['photons', 'magnetic', 'conduction', 'wind']);
    expect(new Set(energyKindsForStage(null)).size).toBe(7);
    const modified = energyKindsForStage(); modified.pop();
    expect(energyKindsForStage()).toHaveLength(7);
  });
});
