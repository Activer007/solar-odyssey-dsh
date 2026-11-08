import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bodyById } from '../../src/data/astronomy';
import { bodyRadius } from '../../src/simulation/orbits';
import type { DiagnosticSnapshot } from '../../src/scene/Diagnostics';

// Browser plugin not available. The repository Playwright workflow supplies
// Chromium software WebGL; CPU throttling below is a stress condition, not a
// measurement of a physical GPU or a guarantee of a particular frame rate.
type Vector = number[];
interface Frame extends DiagnosticSnapshot { sampledAt: number }
const errors = new WeakMap<Page, string[]>();
const subtract = (a: Vector, b: Vector) => a.map((value, i) => value - b[i]);
const length = (a: Vector) => Math.hypot(...a);
const distance = (a: Vector, b: Vector) => length(subtract(a, b));

// Independent geometric invariant: the closest point of the complete segment
// must stay outside the body. Checking only recorded endpoints misses tunneling.
function closestSegmentDistance(start: Vector, end: Vector, center: Vector) {
  const delta = subtract(end, start), relative = subtract(center, start);
  const squaredLength = delta.reduce((sum, value) => sum + value * value, 0);
  const projection = squaredLength === 0 ? 0
    : Math.max(0, Math.min(1, relative.reduce((sum, value, i) => sum + value * delta[i], 0) / squaredLength));
  return distance(start.map((value, i) => value + delta[i] * projection), center);
}
async function snapshot(page: Page) {
  return page.evaluate(() => window.__solarDiagnostics!());
}
async function settled(page: Page) {
  await expect.poll(async () => (await snapshot(page)).transitioning, { timeout: 15000 }).toBe(false);
}
async function sampleFrames(page: Page, count: number): Promise<Frame[]> {
  // One sample per real animation frame, rather than repeated reads of a stale
  // diagnostic during a slow software-rendered frame. This is read-only.
  return page.evaluate(async count => {
    const frames = [];
    for (let i = 0; i < count; i++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      frames.push({ ...window.__solarDiagnostics!(), sampledAt: performance.now() });
    }
    return frames;
  }, count);
}
async function capture(page: Page, name: string) {
  const output = process.env.SOLAR_QA_OUTPUT;
  if (!output) return;
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: join(output, name + '.png') });
}
function frameIntervals(frames: Frame[]) {
  return frames.slice(1).map((frame, i) => frame.sampledAt - frames[i].sampledAt);
}

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', error => messages.push('JavaScript: ' + error.message));
  page.on('console', message => { if (message.type() === 'error') messages.push('Console: ' + message.text()); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Solar Odyssey/);
  await expect(page.getByRole('heading', { name: '我们的太阳系', exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Boolean(window.__solarDiagnostics))).toBe(true);
  await page.getByRole('button', { name: '暂停模拟', exact: true }).click();
  await page.getByRole('button', { name: '重置模拟时间至J2000', exact: true }).click();
  await settled(page);
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page), 'no application, JavaScript or shader errors').toEqual([]);
});

test('stage 1: Shift+W under CPU throttling stops before true-scale Mercury on every movement segment', async ({ page }) => {
  await page.getByLabel('场景比例', { exact: true }).selectOption('real');
  await page.getByTestId('nav-mercury').click();
  await settled(page);
  await page.getByRole('button', { name: '侧视', exact: true }).click();
  await settled(page);
  await page.getByRole('button', { name: '观察模式', exact: true }).click();
  await expect(page.getByRole('button', { name: '自由飞行', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Clear the settings button's focus using an empty part of the actual canvas;
  // the application deliberately ignores flight keys in focused UI controls.
  const bounds = await page.locator('canvas').boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x + bounds!.width * .8, bounds!.y + bounds!.height * .2);
  const initial = await snapshot(page), radius = bodyRadius(bodyById.mercury, 'real');
  expect(radius, 'this is a small body in the uniform physical scale').toBeLessThan(.001);
  expect(initial.selected).toBe('mercury');
  const cdp = await page.context().newCDPSession(page);
  let frames: Frame[] = [];
  try {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    frames = await sampleFrames(page, 32);
  } finally {
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
  }
  const samples = [initial, ...frames];
  for (let i = 0; i < samples.length; i++) {
    const frame = samples[i];
    expect(frame.mode).toBe('body');
    expect(frame.selected).toBe('mercury');
    expect(frame.days).toBe(0);
    expect(frame.camera.every(Number.isFinite)).toBe(true);
    expect(distance(frame.focus, initial.focus)).toBeLessThan(radius * 1e-5);
    expect(distance(frame.camera, frame.focus), 'camera endpoint stays outside the safety sphere').toBeGreaterThanOrEqual(radius * 1.16 * (1 - 1e-5));
    if (i > 0) {
      expect(closestSegmentDistance(samples[i - 1].camera, frame.camera, frame.focus), 'the full movement segment must not cut through Mercury').toBeGreaterThanOrEqual(radius * 1.16 * (1 - 1e-5));
    }
  }
  const last = frames[frames.length - 1];
  expect(distance(initial.camera, initial.focus) - distance(last.camera, last.focus), 'real keyboard flight must actually advance toward Mercury').toBeGreaterThan(radius);
  expect(distance(last.camera, last.focus), 'holding forward must reach the guard, then stop instead of crossing').toBeLessThan(radius * 1.25);
  console.log('FLIGHT FRAME SAMPLE', JSON.stringify({ body: 'mercury', scale: 'real', cpuThrottle: 6, frames: frames.length, frameIntervalsMs: frameIntervals(frames), radius, finalDistance: distance(last.camera, last.focus) }));
  await capture(page, 'stage1-mercury-high-speed-flight');
});

test('stage 1: 100-day-per-second Earth following preserves camera offset during slow rendered frames', async ({ page }) => {
  await page.getByTestId('nav-earth').click();
  await settled(page);
  await page.getByRole('button', { name: '侧视', exact: true }).click();
  await settled(page);
  await page.getByLabel('时间流速', { exact: true }).fill('2');
  await expect(page.locator('.speed-control output')).toContainText('100');
  const initial = await snapshot(page), offset = subtract(initial.camera, initial.focus);
  const radius = bodyRadius(bodyById.earth, 'educational');
  const cdp = await page.context().newCDPSession(page);
  let frames: Frame[] = [];
  try {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await page.getByRole('button', { name: '恢复模拟', exact: true }).click();
    frames = await sampleFrames(page, 40);
    await page.getByRole('button', { name: '暂停模拟', exact: true }).click();
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
  }
  for (const frame of frames) {
    expect(frame.camera.every(Number.isFinite)).toBe(true);
    expect(frame.transitioning).toBe(false);
    expect(distance(subtract(frame.camera, frame.focus), offset), 'orbital following translates the observation frame without false collisions').toBeLessThan(radius * .005);
    expect(distance(frame.target, frame.focus), 'controls target remains centered while the planet moves').toBeLessThan(radius * .005);
    expect(distance(frame.camera, frame.focus)).toBeGreaterThan(radius * 1.16);
  }
  const last = frames[frames.length - 1];
  expect(last.days).toBeGreaterThan(initial.days + 1);
  expect(distance(last.focus, initial.focus), 'the moving planet must travel a meaningful distance').toBeGreaterThan(radius);
  console.log('FOLLOW FRAME SAMPLE', JSON.stringify({ body: 'earth', scale: 'educational', speedDaysPerSecond: 100, cpuThrottle: 6, frames: frames.length, frameIntervalsMs: frameIntervals(frames), simulatedDays: last.days - initial.days, maximumOffsetError: Math.max(...frames.map(frame => distance(subtract(frame.camera, frame.focus), offset))) }));
  await capture(page, 'stage1-earth-high-speed-follow');
});
