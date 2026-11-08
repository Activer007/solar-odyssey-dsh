import { create } from 'zustand';
import { solarLessons } from '../data/solarLessons';

const key = 'solar-odyssey.mission.v1';
const allSteps = (1 << solarLessons.length) - 1;
type Progress = { lessonSteps: number; earthNight: boolean; saturn: boolean; passed: boolean };
const empty: Progress = { lessonSteps: 0, earthNight: false, saturn: false, passed: false };

function readProgress(): Progress {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null');
    if (value && Number.isInteger(value.lessonSteps) && value.lessonSteps >= 0 && value.lessonSteps <= allSteps) {
      const lessonSteps = value.lessonSteps;
      const earthNight = value.earthNight === true;
      const saturn = value.saturn === true;
      return { lessonSteps, earthNight, saturn, passed: value.passed === true && lessonSteps === allSteps && earthNight && saturn };
    }
  } catch { /* Exploration remains available without storage. */ }
  return empty;
}

export function observations(progress: Progress) {
  return [progress.lessonSteps === allSteps, progress.earthNight, progress.saturn];
}

export const useMission = create<Progress>(() => readProgress());

function record(patch: Partial<Progress>) {
  const current = useMission.getState();
  if (Object.entries(patch).every(([field, value]) => current[field as keyof Progress] === value)) return;
  const next = { ...current, ...patch };
  useMission.setState(next);
  try { globalThis.localStorage?.setItem(key, JSON.stringify(next)); } catch { /* Keep the in-memory progress. */ }
}

export function recordLessonStep(step: number) {
  record({ lessonSteps: useMission.getState().lessonSteps | (1 << step) });
}

export function recordObservation(observation: 'earthNight' | 'saturn') {
  record({ [observation]: true });
}

export function answerMission(answer: string): boolean {
  if (answer !== 'fusion' || !observations(useMission.getState()).every(Boolean)) return false;
  record({ passed: true });
  return true;
}
