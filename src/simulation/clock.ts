export interface PlaybackSettings {
  paused: boolean;
  /** Simulated days per real foreground second. */
  speed: number;
}

export const MAX_ANIMATION_STEP_SECONDS = 0.1;

/** The model uses a monotonic clock; visual effects use a separate bounded step.
 * Changes settle the preceding interval before applying the new setting, so a
 * slow render cannot apply a new speed/pause state retroactively.
 */
export class SimulationClock {
  days = 0;
  elapsed = 0;
  animationDelta = 0;

  private connected = false;
  private visible = false;
  private playback: PlaybackSettings = { paused: false, speed: 10 };
  private lastTime = 0;
  private pendingAnimationSeconds = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Timestamp of the last model settlement, for read-only diagnostics. */
  get sampledAt() { return this.lastTime; }

  start(settings: PlaybackSettings & { visible: boolean }) {
    if (this.connected) this.stop();
    this.playback = { paused: settings.paused, speed: settings.speed };
    this.visible = settings.visible;
    this.lastTime = this.now();
    this.connected = true;
    this.clearAnimationStep();
  }

  private settle() {
    const now = this.now();
    if (!Number.isFinite(now) || now < this.lastTime) return;
    const seconds = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!this.connected || !this.visible || this.playback.paused) return;
    this.days += seconds * this.playback.speed;
    this.pendingAnimationSeconds += seconds;
  }

  private clearAnimationStep() {
    this.pendingAnimationSeconds = 0;
    this.animationDelta = 0;
  }

  advanceFrame() {
    this.settle();
    this.animationDelta = Math.min(this.pendingAnimationSeconds, MAX_ANIMATION_STEP_SECONDS);
    this.pendingAnimationSeconds = 0;
    this.elapsed += this.animationDelta;
  }

  setPlayback(settings: PlaybackSettings) {
    this.settle();
    if (this.playback.paused !== settings.paused) this.clearAnimationStep();
    this.playback = { paused: settings.paused, speed: settings.speed };
  }

  setVisible(visible: boolean) {
    this.settle();
    if (this.visible !== visible) this.clearAnimationStep();
    this.visible = visible;
  }

  resetDays() {
    this.settle();
    this.days = 0;
  }

  stop() {
    this.settle();
    this.connected = false;
    this.clearAnimationStep();
  }
}

export const simulation = new SimulationClock();
