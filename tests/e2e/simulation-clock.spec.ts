import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DiagnosticSnapshot } from '../../src/scene/Diagnostics';

// Browser plugin not available. Use the existing Chromium/SwiftShader workflow.
// This limits frame scheduling, not performance.now, timers, the model clock or
// document visibility. It is a correctness test, not a GPU performance claim.
interface ClockFrame extends DiagnosticSnapshot { frameStartedAt: number; frameEndedAt: number }
declare global { interface Window { __clockQaFrames: ClockFrame[] } }
const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') messages.push(message.text()); });
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
    let serial = 0, lastFrame = 0;
    const pending = new Map<number, { timer?: number; frame?: number }>();
    window.__clockQaFrames = [];
    window.requestAnimationFrame = callback => {
      const id = ++serial, entry: { timer?: number; frame?: number } = {};
      pending.set(id, entry);
      entry.timer = window.setTimeout(() => {
        entry.frame = raf(timestamp => {
          pending.delete(id);
          const frameStartedAt = performance.now();
          callback(timestamp);
          const snapshot = window.__solarDiagnostics?.();
          if (snapshot && snapshot.frameSequence !== lastFrame) {
            lastFrame = snapshot.frameSequence;
            window.__clockQaFrames.push({ ...snapshot, frameStartedAt, frameEndedAt: performance.now() });
            if (window.__clockQaFrames.length > 300) window.__clockQaFrames.shift();
          }
        });
      }, 500);
      return id;
    };
    window.cancelAnimationFrame = id => {
      const entry = pending.get(id);
      if (!entry) return;
      window.clearTimeout(entry.timer);
      if (entry.frame !== undefined) cancel(entry.frame);
      pending.delete(id);
    };
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Solar Odyssey/);
  await expect(page.getByRole('heading', { name: '我们的太阳系', exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Boolean(window.__solarDiagnostics))).toBe(true);
  await page.getByRole('button', { name: '暂停模拟', exact: true }).click();
  await page.getByRole('button', { name: '重置模拟时间至J2000', exact: true }).click();
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page), 'no application, shader, console errors or warnings').toEqual([]);
});

async function frames(page: Page, count = 6) {
  const after = await page.evaluate(() => performance.now());
  await expect.poll(() => page.evaluate(after => window.__clockQaFrames.filter(frame => frame.frameStartedAt >= after).length, after),
    { timeout: 20000, intervals: [100, 250] }).toBeGreaterThanOrEqual(count);
  return page.evaluate(({ after, count }) => window.__clockQaFrames.filter(frame => frame.frameStartedAt >= after).slice(0, count), { after, count });
}

function assertRate(samples: ClockFrame[], speed: number) {
  const first = samples[0], last = samples[samples.length - 1];
  // Independent wall time is sampled immediately BEFORE the R3F callback. The
  // expected value does not derive from the model's own settlement timestamp.
  const seconds = (last.frameStartedAt - first.frameStartedAt) / 1000;
  const actualDays = last.days - first.days, expectedDays = seconds * speed;
  expect(seconds).toBeGreaterThan(2);
  expect(Math.abs(actualDays - expectedDays) / expectedDays).toBeLessThan(.03);
  for (let i = 1; i < samples.length; i++) {
    expect(samples[i].frameStartedAt - samples[i - 1].frameStartedAt).toBeGreaterThan(450);
    expect(samples[i].animationDelta).toBeGreaterThan(0);
    expect(samples[i].animationDelta).toBeLessThanOrEqual(.1);
  }
  expect(last.animationElapsed - first.animationElapsed).toBeCloseTo((samples.length - 1) * .1, 5);
  return { speed, seconds, actualDays, expectedDays, actualDaysPerSecond: actualDays / seconds, samples };
}

async function evidence(page: Page, name: string, data: unknown) {
  const output = process.env.SOLAR_QA_OUTPUT;
  if (!output) return;
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, name + '.json'), JSON.stringify(data, null, 2));
  await page.screenshot({ path: join(output, name + '.png') });
}

test('clock: approximately 2 FPS preserves 0.1, 10 and 100 days/second with bounded visual animation', async ({ page }) => {
  const results = [];
  for (const [slider, speed] of [['1', 10], ['2', 100], ['-1', .1]] as const) {
    await page.getByLabel('时间流速', { exact: true }).fill(slider);
    await page.getByRole('button', { name: '恢复模拟', exact: true }).click();
    results.push(assertRate(await frames(page), speed));
    await page.getByRole('button', { name: '暂停模拟', exact: true }).click();
  }
  await evidence(page, 'clock-low-fps-rates', results);
});

test('clock: low-FPS pause, running reset and resume keep the date and following camera coherent', async ({ page }) => {
  await expect(page.getByTestId('simulation-date')).toHaveText('2000.01.01');
  await page.getByTestId('nav-earth').click();
  await expect.poll(() => page.evaluate(() => window.__solarDiagnostics!().transitioning), { timeout: 20000 }).toBe(false);
  await page.getByRole('button', { name: '恢复模拟', exact: true }).click();
  const running = await frames(page);
  assertRate(running, 10);
  for (const sample of running) expect(sample.targetOffset).toBeLessThan(.001);
  await page.getByRole('button', { name: '暂停模拟', exact: true }).click();
  const paused = await frames(page, 3);
  expect(paused.every(frame => frame.days === paused[0].days && frame.animationDelta === 0)).toBe(true);
  expect(paused[2].animationElapsed).toBe(paused[0].animationElapsed);
  await page.getByRole('button', { name: '重置模拟时间至J2000', exact: true }).click();
  expect((await frames(page, 2)).every(frame => frame.days === 0)).toBe(true);
  await expect(page.getByTestId('simulation-date')).toHaveText('2000.01.01');
  await page.getByRole('button', { name: '恢复模拟', exact: true }).click();
  await frames(page, 2);
  await page.getByRole('button', { name: '重置模拟时间至J2000', exact: true }).click();
  const reset = await frames(page);
  assertRate(reset, 10);
  await page.getByRole('button', { name: '暂停模拟', exact: true }).click();
  const snapshot = await page.evaluate(() => window.__solarDiagnostics!());
  const date = new Date(Date.UTC(2000, 0, 1, 12) + snapshot.days * 86400000);
  const dateString = `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${String(date.getUTCDate()).padStart(2, '0')}`;
  await expect(page.getByTestId('simulation-date')).toHaveText(dateString);
  await evidence(page, 'clock-controls-earth', { running, paused, reset, snapshot });
});
