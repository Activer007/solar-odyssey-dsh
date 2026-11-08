import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('requires all observations and the correct answer, then restores completed progress', async () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  const { useExplorer } = await import('../src/state/useExplorer');
  const { answerMission, observations, useMission } = await import('../src/state/mission');
  const explorer = useExplorer.getState();
  explorer.selectBody('saturn');
  explorer.setView('night');
  explorer.enterInterior();
  explorer.startLesson();
  explorer.setLessonStep(3);
  expect(observations(useMission.getState())).toEqual([false, false, true]);
  expect(answerMission('fusion')).toBe(false);
  explorer.setLessonStep(1);
  explorer.setLessonStep(2);
  explorer.selectBody('earth');
  explorer.setView('night');
  expect(observations(useMission.getState())).toEqual([true, true, true]);
  expect(answerMission('radiation')).toBe(false);
  expect(answerMission('fusion')).toBe(true);
  vi.resetModules();
  const restored = await import('../src/state/mission');
  expect(restored.useMission.getState().passed).toBe(true);
});
