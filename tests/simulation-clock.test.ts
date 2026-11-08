import { describe, expect, it } from 'vitest';
import { SimulationClock } from '../src/simulation/clock';

function harness(playback = { paused: false, speed: 10, visible: true }) {
  let milliseconds = 0;
  const clock = new SimulationClock(() => milliseconds);
  clock.start(playback);
  return { clock, wait: (seconds: number) => { milliseconds += seconds * 1000; } };
}

describe('foreground simulation rate independent of rendered frame rate', () => {
  it('advances the advertised days per real second at 2 FPS while capping only animation steps', () => {
    const { clock, wait } = harness({ paused: false, speed: 100, visible: true });
    for (let frame = 0; frame < 6; frame++) {
      wait(.5); clock.advanceFrame();
      expect(clock.days).toBeCloseTo((frame + 1) * 50, 10);
      expect(clock.animationDelta).toBeCloseTo(.1, 12);
    }
    expect(clock.days).toBeCloseTo(300, 10);
    expect(clock.elapsed).toBeCloseTo(.6, 12);
  });

  it('preserves a full second at normal frame rate without artificially slowing animations', () => {
    const { clock, wait } = harness({ paused: false, speed: 10, visible: true });
    for (let frame = 0; frame < 60; frame++) {
      wait(1 / 60); clock.advanceFrame();
      expect(clock.animationDelta).toBeCloseTo(1 / 60, 12);
    }
    expect(clock.days).toBeCloseTo(10, 10);
    expect(clock.elapsed).toBeCloseTo(1, 10);
  });

  it('counts a long foreground stall fully without turning it into a long animation step', () => {
    const { clock, wait } = harness({ paused: false, speed: 2.5, visible: true });
    wait(60); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(150, 10);
    expect(clock.animationDelta).toBeCloseTo(.1, 12);
    expect(clock.elapsed).toBeCloseTo(.1, 12);
    clock.advanceFrame();
    expect(clock.days).toBeCloseTo(150, 10);
    expect(clock.animationDelta).toBe(0);
    expect(clock.elapsed).toBeCloseTo(.1, 12);
  });

  it('keeps decorative animation time independent of the orbital speed setting', () => {
    const { clock, wait } = harness({ paused: false, speed: .1, visible: true });
    wait(.05); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(.005, 12);
    expect(clock.animationDelta).toBeCloseTo(.05, 12);
    clock.setPlayback({ paused: false, speed: 100 });
    wait(.05); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(5.005, 10);
    expect(clock.animationDelta).toBeCloseTo(.05, 12);
    expect(clock.elapsed).toBeCloseTo(.1, 12);
  });
});

describe('playback changes between rendered frames', () => {
  it('settles the old speed before changing rate, pausing or resuming', () => {
    const { clock, wait } = harness();
    wait(.2); clock.setPlayback({ paused: false, speed: 100 });
    expect(clock.days).toBeCloseTo(2, 12);
    wait(.15); clock.setPlayback({ paused: true, speed: 100 });
    expect(clock.days).toBeCloseTo(17, 10);
    expect(clock.animationDelta).toBe(0);
    wait(.65); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(17, 10);
    expect(clock.animationDelta).toBe(0);
    wait(.2); clock.setPlayback({ paused: false, speed: 5 });
    wait(.4); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(19, 10);
  });

  it('preserves short run intervals separated by a pause even when no frame was rendered', () => {
    const { clock, wait } = harness();
    wait(.25); clock.setPlayback({ paused: true, speed: 10 });
    expect(clock.days).toBeCloseTo(2.5, 12);
    wait(50); clock.setPlayback({ paused: false, speed: 100 });
    wait(.3); clock.setPlayback({ paused: true, speed: 100 });
    expect(clock.days).toBeCloseTo(32.5, 10);
    wait(20); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(32.5, 10);
    expect(clock.animationDelta).toBe(0);
  });

  it('does not lose or double-count time when unchanged playback settings are applied', () => {
    const { clock, wait } = harness();
    wait(.1); clock.setPlayback({ paused: false, speed: 10 });
    wait(.2); clock.setPlayback({ paused: false, speed: 10 });
    wait(.3); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(6, 12);
  });
});

describe('hidden-page policy and lifecycle anchors', () => {
  it('counts until hide, discards the background gap, then resumes at the latest speed', () => {
    const { clock, wait } = harness();
    wait(.3); clock.setVisible(false);
    expect(clock.days).toBeCloseTo(3, 12);
    wait(100); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(3, 12);
    expect(clock.animationDelta).toBe(0);
    clock.setPlayback({ paused: false, speed: 100 });
    wait(500); clock.setVisible(true); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(3, 12);
    expect(clock.animationDelta).toBe(0);
    wait(.2); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(23, 9);
    expect(clock.animationDelta).toBeCloseTo(.1, 12);
  });

  it('keeps a pause selected in the background after the page becomes visible', () => {
    const { clock, wait } = harness();
    wait(.1); clock.setVisible(false);
    wait(10); clock.setPlayback({ paused: true, speed: 20 });
    wait(10); clock.setVisible(true);
    wait(5); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(1, 12);
    expect(clock.animationDelta).toBe(0);
    clock.setPlayback({ paused: false, speed: 20 });
    wait(.5); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(11, 12);
  });

  it('handles repeated visibility events and several hidden cycles without catch-up', () => {
    const { clock, wait } = harness();
    wait(.2); clock.setVisible(true);
    wait(.3); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(5, 12);
    wait(.1); clock.setVisible(false);
    wait(100); clock.setVisible(false);
    wait(20); clock.setVisible(true);
    wait(.2); clock.setVisible(true);
    wait(.3); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(11, 10);
    wait(.4); clock.setVisible(false);
    wait(100); clock.setVisible(true);
    wait(.1); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(16, 10);
  });

  it('does not leak pre-hide animation remainder into the first resumed frame', () => {
    const { clock, wait } = harness();
    wait(.05); clock.advanceFrame();
    expect(clock.elapsed).toBeCloseTo(.05, 12);
    wait(.02); clock.setVisible(false);
    wait(60); clock.setVisible(true); clock.advanceFrame();
    expect(clock.animationDelta).toBe(0);
    wait(.04); clock.advanceFrame();
    expect(clock.animationDelta).toBeCloseTo(.04, 12);
    expect(clock.elapsed).toBeCloseTo(.09, 10);
  });

  it('can start hidden and receive playback events without ever advancing the hidden interval', () => {
    const { clock, wait } = harness({ paused: false, speed: 10, visible: false });
    wait(30); clock.setPlayback({ paused: true, speed: 100 });
    wait(30); clock.setPlayback({ paused: false, speed: 50 });
    wait(30); clock.advanceFrame();
    expect(clock.days).toBe(0);
    clock.setVisible(true);
    wait(.2); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(10, 10);
  });
});

describe('reset and mount lifecycle', () => {
  it('resets at the event boundary while running and stays frozen when reset while paused', () => {
    const { clock, wait } = harness();
    wait(.5); clock.resetDays();
    expect(clock.days).toBe(0);
    wait(.2); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(2, 12);
    wait(.1); clock.setPlayback({ paused: true, speed: 10 });
    expect(clock.days).toBeCloseTo(3, 12);
    wait(.5); clock.resetDays();
    wait(100); clock.advanceFrame();
    expect(clock.days).toBe(0);
    expect(clock.animationDelta).toBe(0);
    clock.setPlayback({ paused: false, speed: 100 });
    wait(.5); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(50, 10);
  });

  it('settles before stop and never catches up the unmounted interval on restart', () => {
    const { clock, wait } = harness();
    wait(.25); clock.stop();
    expect(clock.days).toBeCloseTo(2.5, 12);
    wait(100); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(2.5, 12);
    expect(clock.animationDelta).toBe(0);
    clock.start({ paused: false, speed: 100, visible: true });
    clock.advanceFrame();
    expect(clock.days).toBeCloseTo(2.5, 12);
    expect(clock.animationDelta).toBe(0);
    wait(.3); clock.advanceFrame();
    expect(clock.days).toBeCloseTo(32.5, 10);
  });

  it('keeps a newly constructed clock stopped until explicitly started', () => {
    let milliseconds = 0;
    const clock = new SimulationClock(() => milliseconds);
    milliseconds = 50000;
    clock.advanceFrame();
    expect(clock.days).toBe(0);
    expect(clock.animationDelta).toBe(0);
    clock.start({ paused: false, speed: 10, visible: true });
    milliseconds += 100;
    clock.advanceFrame();
    expect(clock.days).toBeCloseTo(1, 12);
  });
});
