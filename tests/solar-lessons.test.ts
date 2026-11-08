import { afterEach, describe, expect, it } from 'vitest';
import { solarLessons } from '../src/data/solarLessons';
import { solarLayers } from '../src/data/astronomy';
import { useExplorer } from '../src/state/useExplorer';

const original = useExplorer.getState();
afterEach(() => useExplorer.setState(original, true));
describe('guided solar lesson', () => {
  it('links all four concepts to existing layer IDs and sources', () => {
    expect(solarLessons.map(step => step.stage)).toEqual(['fusion', 'radiative', 'convective', 'atmosphere']);
    const ids = new Set(solarLayers.map(layer => layer.id));
    for (const step of solarLessons) {
      expect(step.layers).toContain(step.primaryLayer);
      expect(step.layers.every(id => ids.has(id))).toBe(true);
      expect(step.source).toMatch(/^https:\/\/(solarscience\.msfc|science)\.nasa\.gov\//);
    }
    expect(solarLessons[3].layers).toEqual(['photosphere', 'chromosphere', 'transition', 'corona']);
  });
  it('step navigation updates selection, collapses exploded layers and enables its animation', () => {
    const state = useExplorer.getState();
    state.enterInterior(); state.set({ exploded: true }); state.startLesson();
    expect(useExplorer.getState()).toMatchObject({ lessonStep: 0, selectedLayer: 'core', energy: true, exploded: false });
    for (const index of [1, 2, 3, 2, 1, 0]) {
      state.setLessonStep(index);
      expect(useExplorer.getState()).toMatchObject({ lessonStep: index, selectedLayer: solarLessons[index].primaryLayer, energy: true, exploded: false });
    }
    for (const invalid of [-1, 4, NaN, .5]) state.setLessonStep(invalid);
    expect(useExplorer.getState().lessonStep).toBe(0);
  });
  it('manual selection, show-all and every scene exit leave a coherent free exploration state', () => {
    const state = useExplorer.getState();
    state.enterInterior(); state.startLesson(); state.selectLayer('corona');
    expect(useExplorer.getState()).toMatchObject({ lessonStep: null, selectedLayer: 'corona', energy: false });
    state.selectLayer('corona'); expect(useExplorer.getState().selectedLayer).toBeNull();
    state.startLesson(); state.selectLayer(null);
    expect(useExplorer.getState()).toMatchObject({ selectedLayer: null, lessonStep: null, energy: false });
    for (const exit of [state.leaveLesson, state.exitInterior, state.overview, () => state.selectBody('earth')]) {
      state.enterInterior(); state.startLesson(); exit();
      expect(useExplorer.getState()).toMatchObject({ lessonStep: null, energy: false });
    }
  });
});
