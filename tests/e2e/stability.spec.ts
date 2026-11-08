import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bodyById, type BodyId } from '../../src/data/astronomy';
import { bodyRadius, orbitalPosition } from '../../src/simulation/orbits';

// Browser plugin not available in this environment. Use the repository's real
// Playwright/Chromium workflow; all input below goes through the rendered UI.
type Vector = [number, number, number];
interface Snapshot {
  camera: Vector; target?: Vector; focus?: Vector; projectedTarget?: Vector;
  targetOffset?: number; transitioning?: boolean; selected: BodyId;
  mode: string; days: number; scale?: 'educational' | 'real';
}
interface BrowserHealth { errors: string[]; expectedNightFailures: number; allowNightFailure: boolean }
const health = new WeakMap<Page, BrowserHealth>();
const nightPath = '/textures/2k_earth_nightmap.jpg';
const output = process.env.SOLAR_QA_OUTPUT;
const magnitude = (v: Vector) => Math.hypot(...v);
const subtract = (a: Vector, b: Vector): Vector => a.map((n, i) => n - b[i]) as Vector;
const distance = (a: Vector, b: Vector) => magnitude(subtract(a, b));
const direction = (a: Vector, b: Vector) => {
  const offset = subtract(a, b), length = magnitude(offset);
  return offset.map(n => n / length) as Vector;
};
const dot = (a: Vector, b: Vector) => a.reduce((sum, n, i) => sum + n * b[i], 0);
async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => window.__solarDiagnostics!()) as unknown as Promise<Snapshot>;
}
function focusOf(s: Snapshot): Vector {
  return s.focus || orbitalPosition(bodyById[s.selected], s.days, s.scale || 'educational');
}
async function capture(page: Page, name: string) {
  if (!output) return;
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: join(output, name + '.png') });
}
async function settled(page: Page) {
  // Poll the actual transition when available. The fallback permits the first
  // regression to reproduce against the pre-fix diagnostic interface.
  if ((await snapshot(page)).transitioning === undefined) await page.waitForTimeout(1900);
  else await expect.poll(async () => (await snapshot(page)).transitioning, { timeout: 12000 }).toBe(false);
  await page.waitForTimeout(220); // Let OrbitControls damping complete.
}
async function gestureSettled(page: Page) {
  // Damping is frame based. Software WebGL can render very few frames during a
  // fixed delay, so wait for the actual camera offset to stop changing.
  let previous = await snapshot(page), stable = 0;
  await expect.poll(async () => {
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    const current = await snapshot(page);
    const movement = distance(subtract(current.camera, focusOf(current)), subtract(previous.camera, focusOf(previous)));
    const radius = bodyRadius(bodyById[current.selected], current.scale || 'educational');
    stable = movement < radius * .001 ? stable + 1 : 0;
    previous = current;
    return stable;
  }, { timeout: 20000, intervals: [250] }).toBeGreaterThanOrEqual(3);
}
async function boot(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Solar Odyssey/);
  await expect(page.getByRole('heading', { name: '我们的太阳系', exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Boolean(window.__solarDiagnostics))).toBe(true);
  await page.getByRole('button', { name: '暂停模拟', exact: true }).click();
  await page.getByRole('button', { name: '重置模拟时间至J2000', exact: true }).click();
  await settled(page);
}
async function moveToCanvas(page: Page, x = .5, y = .42) {
  const bounds = await page.locator('canvas').boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width * x, bounds!.y + bounds!.height * y);
  return bounds!;
}
async function dragCanvas(page: Page, dx = .2, dy = .08) {
  const bounds = await moveToCanvas(page);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * (.5 + dx), bounds.y + bounds.height * (.42 + dy), { steps: 12 });
  await page.mouse.up();
}
async function assertTargetTracked(page: Page, selected: BodyId) {
  const s = await snapshot(page), radius = bodyRadius(bodyById[selected], s.scale || 'educational');
  expect(s.selected).toBe(selected);
  const focus = focusOf(s);
  expect(s.camera.every(Number.isFinite)).toBe(true);
  // This also fails on the old implementation without new telemetry: an early
  // wheel event leaves the camera observing the abandoned panorama origin.
  expect(distance(s.camera, focus), 'selected body must remain in its close-up distance range').toBeLessThan(radius * 25.1);
  if (s.target) expect(distance(s.target, focus), 'OrbitControls target must follow the selected body').toBeLessThan(radius * .02);
  if (s.targetOffset !== undefined) expect(s.targetOffset).toBeLessThan(radius * .02);
  if (s.projectedTarget) {
    expect(Math.abs(s.projectedTarget[0])).toBeLessThan(.85);
    expect(Math.abs(s.projectedTarget[1])).toBeLessThan(.85);
    expect(s.projectedTarget[2]).toBeGreaterThan(-1);
    expect(s.projectedTarget[2]).toBeLessThan(1);
  }
  return s;
}
async function labels(page: Page, enabled: boolean) {
  await page.getByRole('button', { name: '画质与显示设置', exact: true }).click();
  const toggle = page.getByRole('button', { name: '显示三维标注', exact: true });
  if (await toggle.getAttribute('aria-pressed') !== String(enabled)) await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', String(enabled));
  await page.getByRole('button', { name: '继续探索', exact: true }).click();
}

// Inspect a disk inside the Earth itself, excluding the atmosphere, scene UI,
// black background and Bloom. This is an object-specific visual assertion.
async function earthNightPixels(page: Page) {
  const s = await snapshot(page), center = s.projectedTarget || [0, 0, 0];
  const radius = bodyRadius(bodyById.earth, s.scale || 'educational');
  const relativeRadius = radius / distance(s.camera, focusOf(s)) / (2 * Math.tan(42 * Math.PI / 360));
  const png = await page.locator('canvas').screenshot();
  return page.evaluate(async ({ base64, center, relativeRadius }) => {
    const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const cx = (center[0] + 1) * canvas.width / 2, cy = (1 - center[1]) * canvas.height / 2;
    const r = relativeRadius * canvas.height * .72;
    let count = 0, white = 0, warm = 0, light = 0;
    for (let y = Math.max(0, Math.ceil(cy - r)); y < Math.min(canvas.height, cy + r); y++) {
      for (let x = Math.max(0, Math.ceil(cx - r)); x < Math.min(canvas.width, cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        const i = (y * canvas.width + x) * 4, [red, green, blue] = [pixels[i], pixels[i + 1], pixels[i + 2]];
        count++; light += .2126 * red + .7152 * green + .0722 * blue;
        if (Math.min(red, green, blue) > 175 && Math.max(red, green, blue) - Math.min(red, green, blue) < 38) white++;
        if (red > 75 && green > 45 && red > blue * 1.3 && green > blue * 1.15) warm++;
      }
    }
    return { count, whiteFraction: white / count, warmFraction: warm / count, warmPixels: warm, luminance: light / count };
  }, { base64: png.toString('base64'), center, relativeRadius });
}

test.beforeEach(async ({ page }) => {
  const state: BrowserHealth = { errors: [], expectedNightFailures: 0, allowNightFailure: false };
  health.set(page, state);
  page.on('pageerror', error => state.errors.push('JavaScript: ' + error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    // Do not whitelist Shader/GLSL errors, generic image errors, or page errors.
    // Only one exact resource error from the deliberately failed night map is expected.
    const expectedResourceError = state.allowNightFailure
      && new URL(message.location().url || 'http://invalid').pathname === nightPath
      && /^Failed to load resource: (the server responded with a status of 503 \(Service Unavailable\)|net::ERR_FAILED)$/.test(message.text());
    if (expectedResourceError) state.expectedNightFailures++;
    else state.errors.push('Console: ' + message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(health.get(page)!.errors, 'no application, JavaScript or shader errors').toEqual([]);
});

test('stage 1: Neptune interrupt regression: immediate wheel, drag and successive targets', async ({ page }) => {
  await boot(page);
  await page.getByTestId('nav-neptune').click();
  await moveToCanvas(page);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(350);
  await capture(page, 'stage1-neptune-wheel-interrupt');
  await assertTargetTracked(page, 'neptune');
  await dragCanvas(page, -.18, .1);
  await page.waitForTimeout(350);
  await assertTargetTracked(page, 'neptune');
  for (const id of ['earth', 'saturn', 'neptune'] as BodyId[]) {
    await page.getByTestId('nav-' + id).click();
    await page.waitForTimeout(75);
  }
  await moveToCanvas(page);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(350);
  await assertTargetTracked(page, 'neptune');
  await capture(page, 'stage1-neptune-continuous-targets');
});

test('stage 1: interrupted drag and rapid overview/body/interior transitions retain a valid target', async ({ page }) => {
  await boot(page);
  await page.getByTestId('nav-neptune').click();
  await dragCanvas(page, .18, -.1);
  await page.waitForTimeout(350);
  await assertTargetTracked(page, 'neptune');
  await page.getByTestId('nav-sun').click();
  await page.getByTestId('enter-interior').click();
  await page.getByRole('button', { name: '返回太阳外部', exact: true }).click();
  await page.getByRole('button', { name: '返回太阳系全景', exact: true }).click();
  await page.getByTestId('nav-neptune').click();
  await settled(page);
  await assertTargetTracked(page, 'neptune');
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  await settled(page);
  let s = await assertTargetTracked(page, 'neptune');
  expect(direction(s.camera, focusOf(s))[1]).toBeGreaterThan(.99);
  await page.getByRole('button', { name: '侧视', exact: true }).click();
  await settled(page);
  s = await assertTargetTracked(page, 'neptune');
  expect(Math.abs(direction(s.camera, focusOf(s))[1])).toBeLessThan(.03);
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await settled(page);
  s = await assertTargetTracked(page, 'neptune');
  expect(direction(s.camera, focusOf(s))[1]).toBeGreaterThan(.05);
});

test('stage 1: resize and panel changes preserve user orbit direction and zoom intent', async ({ page }) => {
  await boot(page);
  await page.getByTestId('nav-earth').click();
  await settled(page);
  await dragCanvas(page, -.22, .12);
  await moveToCanvas(page);
  await page.mouse.wheel(0, -440);
  await gestureSettled(page);
  const before = await snapshot(page), beforeFocus = focusOf(before);
  const initialDirection = direction(before.camera, beforeFocus), initialDistance = distance(before.camera, beforeFocus);
  const checkIntent = async () => {
    await page.waitForTimeout(650);
    const after = await snapshot(page), focus = focusOf(after);
    expect(dot(initialDirection, direction(after.camera, focus)), 'layout must preserve the user orbit direction').toBeGreaterThan(.995);
    const ratio = distance(after.camera, focus) / initialDistance;
    expect(ratio, 'layout must preserve zoom, except a small safety fit').toBeGreaterThan(.85);
    expect(ratio).toBeLessThan(1.25);
    await assertTargetTracked(page, 'earth');
  };
  await page.setViewportSize({ width: 1280, height: 720 });
  await checkIntent();
  await page.getByRole('button', { name: '收起科普信息', exact: true }).click();
  await checkIntent();
  await page.getByRole('button', { name: '展开科普信息', exact: true }).click();
  await checkIntent();
  await page.getByRole('button', { name: '收起天体导航', exact: true }).click();
  await checkIntent();
  await page.getByRole('button', { name: '展开天体导航', exact: true }).click();
  await checkIntent();
  await capture(page, 'stage1-resize-user-orbit-1280');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(650);
  const portrait = await snapshot(page);
  expect(dot(initialDirection, direction(portrait.camera, focusOf(portrait)))).toBeGreaterThan(.995);
  // Portrait may increase the framing distance, but it may never approach the
  // body beyond the user's zoom intention or reselect a default camera angle.
  expect(distance(portrait.camera, focusOf(portrait))).toBeGreaterThan(initialDistance * .85);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await capture(page, 'stage1-resize-user-orbit-portrait');
});

test('stage 1: running simulation translates camera and controls with the selected moving body', async ({ page }) => {
  await boot(page);
  await page.getByTestId('nav-earth').click();
  await settled(page);
  await dragCanvas(page, .14, -.08);
  await gestureSettled(page);
  await page.getByLabel('时间流速', { exact: true }).fill('2');
  const before = await assertTargetTracked(page, 'earth');
  await page.getByRole('button', { name: '恢复模拟', exact: true }).click();
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: '暂停模拟', exact: true }).click();
  const after = await assertTargetTracked(page, 'earth');
  expect(after.days).toBeGreaterThan(before.days + 4);
  const bodyMovement = subtract(focusOf(after), focusOf(before));
  const cameraMovement = subtract(after.camera, before.camera);
  expect(magnitude(bodyMovement)).toBeGreaterThan(bodyRadius(bodyById.earth, 'educational'));
  expect(distance(cameraMovement, bodyMovement), 'camera offset must remain attached while Earth moves').toBeLessThan(.03);
  expect(dot(direction(before.camera, focusOf(before)), direction(after.camera, focusOf(after)))).toBeGreaterThan(.999);
});

test('stage 1: three-dimensional labels turn off and on in every scene mode', async ({ page }) => {
  await boot(page);
  for (const mode of ['overview', 'body', 'interior']) {
    if (mode === 'body') await page.getByTestId('nav-jupiter').click();
    if (mode === 'interior') {
      await page.getByTestId('nav-sun').click();
      await page.getByTestId('enter-interior').click();
      await page.getByTestId('layer-radiative').click();
    }
    await settled(page);
    await expect.poll(() => page.locator('.projected-label').count()).toBeGreaterThan(0);
    await labels(page, false);
    await expect(page.locator('.projected-label:visible'), mode + ' labels must all be hidden').toHaveCount(0);
    const interactiveHidden = await page.locator('.projected-label').evaluateAll(nodes => nodes.filter(node => {
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden'
        && (style.pointerEvents !== 'none' || (node as HTMLElement).tabIndex >= 0);
    }).length);
    expect(interactiveHidden, mode + ' must have no clickable or keyboard focusable invisible label').toBe(0);
    await capture(page, 'stage1-labels-off-' + mode);
    await labels(page, true);
    await expect.poll(() => page.locator('.projected-label').count()).toBeGreaterThan(0);
    if (mode !== 'body') await expect.poll(() => page.locator('.projected-label:visible').count()).toBeGreaterThan(0);
  }
});

test('stage 1: delayed Earth night map stays dark until the real city texture arrives', async ({ page }) => {
  let release!: () => void, intercepted = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**' + nightPath, async route => { intercepted++; await gate; await route.continue(); });
  try {
    await boot(page);
    await page.getByTestId('nav-earth').click();
    await page.getByRole('button', { name: '观察夜间灯光', exact: true }).click();
    await settled(page);
    expect(intercepted).toBe(1);
    const pending = await earthNightPixels(page);
    expect(pending.count, 'Earth disk must occupy enough pixels for an actual visual check').toBeGreaterThan(1000);
    await capture(page, 'stage1-earth-night-delayed');
    expect(pending.whiteFraction, 'missing emissive map must never illuminate the entire night side').toBeLessThan(.12);
    expect(pending.luminance).toBeLessThan(95);
    const response = page.waitForResponse(response => response.url().endsWith(nightPath) && response.ok());
    release(); await response;
    // J2000's night view includes ocean. Require distinct city-light pixels
    // inside the planet disk, without assuming a mostly urban hemisphere.
    await expect.poll(async () => (await earthNightPixels(page)).warmFraction, { timeout: 10000 }).toBeGreaterThan(pending.warmFraction + .0003);
    const loaded = await earthNightPixels(page);
    expect(loaded.warmPixels).toBeGreaterThan(20);
    console.log('EARTH DELAY ROI', JSON.stringify({ pending, loaded }));
    expect(loaded.whiteFraction).toBeLessThan(.12);
    await capture(page, 'stage1-earth-night-loaded');
  } finally { release(); }
});

test('stage 1: Earth night map failure has an explicit finite retry that actually recovers', async ({ page }) => {
  let requests = 0;
  health.get(page)!.allowNightFailure = true;
  await page.route('**' + nightPath, async route => {
    requests++;
    if (requests === 1) await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Intentional night-map regression failure' });
    else await route.continue();
  });
  await boot(page);
  await page.getByTestId('nav-earth').click();
  await page.getByRole('button', { name: '观察夜间灯光', exact: true }).click();
  await settled(page);
  const retry = page.getByRole('button', { name: /重试.*纹理|重试.*资源|重试加载/ });
  await expect(retry).toBeVisible();
  const failed = await earthNightPixels(page);
  expect(failed.whiteFraction).toBeLessThan(.12);
  expect(failed.luminance).toBeLessThan(95);
  await page.waitForTimeout(800);
  expect(requests, 'failed requests must not be automatically retried forever').toBe(1);
  expect(health.get(page)!.expectedNightFailures).toBe(1);
  await capture(page, 'stage1-earth-night-failed');
  const success = page.waitForResponse(response => response.url().endsWith(nightPath) && response.ok());
  await retry.click(); await success;
  expect(requests, 'user retry must issue a new request instead of returning a cached rejection').toBe(2);
  await expect.poll(async () => (await earthNightPixels(page)).warmFraction, { timeout: 10000 }).toBeGreaterThan(failed.warmFraction + .0003);
  await expect(retry).toBeHidden();
  await capture(page, 'stage1-earth-night-recovered');
});

test('stage 1: WebGL context loss exposes a visible recovery entrance', async ({ page }) => {
  await boot(page);
  const supported = await page.locator('canvas').evaluate(canvas => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext(); return true;
  });
  expect(supported, 'software Chromium must expose context-loss testing').toBe(true);
  const recovery = page.getByRole('button', { name: /恢复.*渲染|恢复.*场景|重新加载/ });
  await expect(recovery).toBeVisible();
  await expect(page.getByText(/WebGL.*中断|图形.*中断|渲染.*中断|图形上下文.*丢失/).first()).toBeVisible();
  await capture(page, 'stage1-context-loss-recovery');
  await recovery.click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.__solarDiagnostics)), { timeout: 15000 }).toBe(true);
  await page.getByTestId('nav-earth').click();
  await settled(page);
  await assertTargetTracked(page, 'earth');
});
