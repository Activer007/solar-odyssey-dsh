import { Vector3 } from 'three';
import { displayRadius, solarLayerById } from '../data/solarStructure';

export type EnergyStage = 'fusion' | 'radiative' | 'convective' | 'atmosphere';
export type EnergyPathKind = 'fusion' | 'radiative' | 'convective' | 'photons' | 'magnetic' | 'conduction' | 'wind';
export interface EnergyPathRange { readonly min: number; readonly max: number; }

const TAU = Math.PI * 2;
const ALL_KINDS: readonly EnergyPathKind[] = ['fusion', 'radiative', 'convective', 'photons', 'magnetic', 'conduction', 'wind'];
const STAGE_KINDS: Record<EnergyStage, readonly EnergyPathKind[]> = {
  fusion: ['fusion'], radiative: ['radiative'], convective: ['convective'],
  atmosphere: ['photons', 'magnetic', 'conduction', 'wind'],
};
const unitPhase = (phase: number) => Number.isFinite(phase) ? Math.max(0, Math.min(1, phase)) : 0;

/** Normalized teaching radii, not measured photon travel or atmospheric extent.
 * The two explicit external endpoints keep photons/wind distinct from shells.
 */
export const energyPathRanges: Readonly<Record<EnergyPathKind, EnergyPathRange>> = {
  fusion: { min: displayRadius('core', .18), max: displayRadius('core', .8) },
  radiative: { min: displayRadius('radiative', .05), max: displayRadius('radiative', .95) },
  convective: { min: displayRadius('convective', .06), max: displayRadius('convective', .94) },
  photons: { min: solarLayerById.photosphere.displayOuter, max: solarLayerById.corona.displayOuter * 1.4 },
  magnetic: { min: solarLayerById.photosphere.displayOuter, max: displayRadius('corona', .95) },
  conduction: { min: displayRadius('transition', .05), max: displayRadius('corona', .7) },
  wind: { min: displayRadius('corona', .5), max: solarLayerById.corona.displayOuter * 1.5 },
};

/** Y-up spherical coordinates preserve exactly the requested radial distance. */
export function energySphericalPoint(radius: number, azimuth: number, latitude: number): Vector3 {
  const horizontal = radius * Math.cos(latitude);
  return new Vector3(horizontal * Math.cos(azimuth), radius * Math.sin(latitude), horizontal * Math.sin(azimuth));
}

export function energyKindsForStage(stage?: EnergyStage | null): EnergyPathKind[] {
  return [...(stage ? STAGE_KINDS[stage] : ALL_KINDS)];
}

/** One sampler drives both static flow lines and animated particles.
 * All paths occupy the open +X/+Z cutaway quadrant, without a Cartesian offset
 * that would otherwise move them out of their canonical radial region.
 */
export function sampleEnergyPath(kind: EnergyPathKind, phase: number, lane: number): Vector3 {
  const p = unitPhase(phase), laneId = Number.isFinite(lane) ? lane : 0;
  const seed = ((laneId * .3819660112501051) % 1 + 1) % 1;
  let azimuth = .18 + seed * 1.2;
  let latitude = Math.sin(laneId * 2.399963229728653) * .58;
  const range = energyPathRanges[kind];
  let fraction: number;
  switch (kind) {
    case 'fusion':
      fraction = .5 - .5 * Math.cos(TAU * p);
      azimuth += Math.sin(TAU * p) * .07;
      latitude += Math.cos(TAU * p) * .04;
      break;
    case 'radiative':
      // An overall outward diffusion with several local radial reversals.
      // This is a schematic trajectory, not a simulation of individual photons.
      fraction = p + .04 * Math.sin(TAU * 6 * p);
      azimuth += Math.sin(TAU * 10 * p + laneId) * .055;
      latitude += Math.sin(TAU * 7 * p + laneId * .7) * .035;
      break;
    case 'convective':
      // A closed cell: first half rises, second half sinks along the other side.
      fraction = .5 - .5 * Math.cos(TAU * p);
      azimuth += Math.sin(TAU * p) * .075;
      latitude += Math.sin(TAU * p) * .035;
      break;
    case 'magnetic':
      // Two photospheric footpoints joined by a coronal magnetic arch.
      fraction = Math.sin(Math.PI * p);
      azimuth += (2 * p - 1) * .11;
      latitude += Math.sin(Math.PI * p) * .04;
      break;
    case 'conduction':
      // Downward heat conduction from the corona into the transition region.
      fraction = 1 - p;
      azimuth += Math.sin(Math.PI * p) * .025;
      break;
    case 'photons':
      fraction = p;
      break;
    case 'wind':
      fraction = p;
      azimuth += Math.sin(Math.PI * p) * .035;
      latitude += Math.sin(Math.PI * p) * .025;
      break;
  }
  const radius = range.min + (range.max - range.min) * Math.max(0, Math.min(1, fraction));
  return energySphericalPoint(radius, azimuth, latitude);
}

/** Color codes are explanatory; they do not represent measured plasma color. */
export function energyPathColor(kind: EnergyPathKind, phase: number): string {
  if (kind === 'convective') return unitPhase(phase) < .5 ? '#ff9749' : '#66bbf4';
  return {
    fusion: '#fff5ba', radiative: '#ffedaa', photons: '#fff4ad',
    magnetic: '#e7a6ef', conduction: '#77d5e7', wind: '#a6ddff',
  }[kind];
}
