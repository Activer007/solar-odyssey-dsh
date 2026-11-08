import { create } from 'zustand';
import type { BodyId, SolarLayerId } from '../data/astronomy';
import { solarLessons } from '../data/solarLessons';
import { initialQuality, saveQuality, type Quality } from './qualityPreference';
import { recordLessonStep, recordObservation } from './mission';
export type { Quality } from './qualityPreference';
export type SceneMode = 'overview' | 'body' | 'interior';
export type ViewPreset = 'free' | 'top' | 'side' | 'night';
export const playbackRates = {
  overview: { minLog: 0, maxLog: 3, initial: 100 },
  detail: { minLog: -2, maxLog: 2, initial: .02 },
} as const;
export const playbackView = (mode: SceneMode) => mode === 'overview' ? 'overview' : 'detail';

interface ExplorerState {
  mode: SceneMode; selected: BodyId; paused: boolean; speeds: Record<keyof typeof playbackRates, number>;
  scale: 'educational' | 'real'; quality: Quality; qualitySource: 'default' | 'manual'; orbits: boolean; labels: boolean;
  view: ViewPreset; cameraMode: 'orbit' | 'fly'; cameraRevision: number;
  selectedLayer: SolarLayerId | null; opacity: number; exploded: boolean; energy: boolean; lessonStep: number | null;
  flare: number; navOpen: boolean; infoOpen: boolean; settingsOpen: boolean; helpOpen: boolean; sourcesOpen: boolean; missionOpen: boolean;
  selectBody: (id: BodyId) => void; overview: () => void; enterInterior: () => void; exitInterior: () => void;
  setView: (view: ViewPreset) => void; resetCamera: () => void;
  selectLayer: (id: SolarLayerId | null) => void;
  startLesson: () => void; setLessonStep: (step: number) => void; leaveLesson: () => void;
  setSpeed: (speed: number) => void;
  chooseQuality: (quality: Quality) => void;
  set: (patch: Partial<Omit<ExplorerState, 'set'>>) => void;
}
export const simulationSpeed = (state: Pick<ExplorerState, 'mode' | 'speeds'>) => state.speeds[playbackView(state.mode)];

export const useExplorer = create<ExplorerState>((set, get) => ({
  mode: 'overview', selected: 'sun', paused: false,
  speeds: { overview: playbackRates.overview.initial, detail: playbackRates.detail.initial },
  scale: 'educational', ...initialQuality(), orbits: true, labels: true,
  view: 'free', cameraMode: 'orbit', cameraRevision: 0, selectedLayer: null, opacity: 0.8, exploded: false, energy: false, lessonStep: null,
  flare: 0, navOpen: true, infoOpen: true, settingsOpen: false, helpOpen: false, sourcesOpen: false, missionOpen: false,
  selectBody: (selected) => {
    set((s) => ({ selected, mode: 'body', view: 'free', cameraMode: 'orbit', cameraRevision: s.cameraRevision + 1, selectedLayer: null, lessonStep: null, energy: false }));
    if (selected === 'saturn') recordObservation('saturn');
  },
  overview: () => set((s) => ({ mode: 'overview', view: 'free', cameraMode: 'orbit', cameraRevision: s.cameraRevision + 1, lessonStep: null, energy: false })),
  enterInterior: () => set((s) => ({ mode: 'interior', selected: 'sun', selectedLayer: 'core', lessonStep: null, energy: false, exploded: false, view: 'free', cameraMode: 'orbit', cameraRevision: s.cameraRevision + 1 })),
  exitInterior: () => set((s) => ({ mode: 'body', view: 'free', cameraMode: 'orbit', cameraRevision: s.cameraRevision + 1, lessonStep: null, energy: false })),
  setView: (view) => {
    set((s) => ({ view, cameraRevision: s.cameraRevision + 1 }));
    if (view === 'night' && get().mode === 'body' && get().selected === 'earth') recordObservation('earthNight');
  },
  resetCamera: () => set((s) => ({ view: 'free', cameraRevision: s.cameraRevision + 1 })),
  selectLayer: (id) => set((s) => ({ selectedLayer: s.selectedLayer === id ? null : id, lessonStep: null, energy: s.lessonStep === null ? s.energy : false })),
  startLesson: () => {
    set({ lessonStep: 0, selectedLayer: solarLessons[0].primaryLayer, energy: true, exploded: false });
    recordLessonStep(0);
  },
  setLessonStep: (step) => {
    if (!Number.isInteger(step) || step < 0 || step >= solarLessons.length) return;
    set({ lessonStep: step, selectedLayer: solarLessons[step].primaryLayer, energy: true, exploded: false });
    recordLessonStep(step);
  },
  leaveLesson: () => set({ lessonStep: null, selectedLayer: null, energy: false }),
  setSpeed: (speed) => {
    if (!Number.isFinite(speed)) return;
    set((s) => {
      const view = playbackView(s.mode), { minLog, maxLog } = playbackRates[view];
      return { speeds: { ...s.speeds, [view]: Math.max(10 ** minLog, Math.min(10 ** maxLog, speed)) } };
    });
  },
  chooseQuality: (quality) => { saveQuality(quality); set({ quality, qualitySource: 'manual' }); },
  set: (patch) => set(patch),
}));
