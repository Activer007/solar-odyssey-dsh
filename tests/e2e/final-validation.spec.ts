import { test, expect, type Page, type Browser, type CDPSession } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bodyById } from '../../src/data/astronomy';
import { bodyRadius } from '../../src/simulation/orbits';
import type { DiagnosticSnapshot } from '../../src/scene/Diagnostics';

// Browser plugin not available. These are real Chromium/WebGL browser tests.
// The repository explicitly launches ANGLE/SwiftShader. Touch is browser-native
// CDP input in an emulated mobile context, not a physical phone benchmark.
type FinalSnapshot = DiagnosticSnapshot;
interface Rect { x: number; y: number; width: number; height: number; text: string }
interface SurfaceImage { signature: number[]; samples: number; whiteFraction: number; occupiedFraction: number; luminanceMean: number; luminanceStd: number }
const health = new WeakMap<Page, string[]>();
const subtract = (a: number[], b: number[]) => a.map((value, i) => value - b[i]);
const length = (a: number[]) => Math.hypot(...a);
const distance = (a: number[], b: number[]) => length(subtract(a, b));
const dotDirection = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0) / length(a) / length(b);
const imageDifference = (a: SurfaceImage, b: SurfaceImage) => a.signature.reduce((sum, value, i) => sum + Math.abs(value - b.signature[i]), 0) / a.signature.length;
const quantile = (sorted: number[], fraction: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)))];
async function snapshot(page: Page): Promise<FinalSnapshot> {
  return page.evaluate(() => window.__solarDiagnostics!()) as unknown as Promise<FinalSnapshot>;
}
async function frames(page: Page, count = 3) {
  await page.evaluate(async count => {
    for (let i = 0; i < count; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }, count);
}
async function settled(page: Page) {
  await expect.poll(async () => (await snapshot(page)).transitioning, { timeout: 15000 }).toBe(false);
  let previous = await snapshot(page), stable = 0;
  await expect.poll(async () => {
    await frames(page, 1);
    const current = await snapshot(page);
    const normalizedMovement = distance(subtract(current.camera, current.focus), subtract(previous.camera, previous.focus)) / Math.max(.000001, distance(current.camera, current.focus));
    stable = normalizedMovement < .0003 ? stable + 1 : 0;
    previous = current;
    return stable;
  }, { timeout: 20000, intervals: [150] }).toBeGreaterThanOrEqual(3);
}
async function boot(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Solar Odyssey/);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.scene-caption h2')).toContainText('向着群星');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Boolean(window.__solarDiagnostics))).toBe(true);
  await page.getByRole('button', { name: '暂停模拟', exact: true }).click();
  await page.getByRole('button', { name: '重置模拟时间至J2000', exact: true }).click();
  await settled(page);
}
async function chooseBody(page: Page, id: string) {
  if ((page.viewportSize()?.width || 1440) < 760 && await page.locator('.body-navigation').evaluate(node => node.classList.contains('collapsed'))) {
    await page.getByRole('button', { name: '切换天体导航', exact: true }).click();
  }
  await page.getByTestId('nav-' + id).click();
  await settled(page);
}
async function ensureInfo(page: Page) {
  const reopen = page.getByRole('button', { name: '展开科普信息', exact: true });
  if (await reopen.isVisible()) await reopen.click();
}
async function quality(page: Page, value: 'high' | 'low') {
  await page.getByRole('button', { name: '画质与显示设置', exact: true }).click();
  await page.getByRole('button', { name: value === 'high' ? /高画质/ : /流畅模式/ }).click();
  await page.getByRole('button', { name: '继续探索', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).quality).toBe(value);
  await frames(page, 4);
}
async function capture(page: Page, name: string) {
  const output = process.env.SOLAR_QA_OUTPUT;
  if (!output) return;
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: join(output, name + '.png') });
}
function save(name: string, value: unknown) {
  const output = process.env.SOLAR_QA_OUTPUT;
  if (!output) return;
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, name + '.json'), JSON.stringify(value, null, 2) + '\n', 'utf8');
}
async function environment(page: Page, browser: Browser) {
  const state = await snapshot(page);
  return { browserVersion: browser.version(), userAgent: await page.evaluate(() => navigator.userAgent), os: process.platform,
    renderer: state.renderer, vendor: state.vendor, webglVersion: state.webglVersion,
    configuredBackend: 'ANGLE/SwiftShader (--use-angle=swiftshader)', viewport: page.viewportSize(),
    canvasCSS: state.viewport, drawingBuffer: state.drawingBuffer, dpr: state.dpr, quality: state.quality,
    contextAntialias: state.antialias, cpuThrottling: 1,
    limitation: 'Software WebGL and emulated touch do not establish physical GPU/phone performance or hardware 60 FPS.' };
}
async function surfaceImage(page: Page, radius: number, outer = .75, inner = 0): Promise<SurfaceImage> {
  const state = await snapshot(page), cameraDistance = distance(state.camera, state.focus);
  const relativeRadius = radius * outer / cameraDistance / (2 * Math.tan(state.fov * Math.PI / 360));
  const png = await page.locator('canvas').screenshot();
  return page.evaluate(async ({ base64, center, relativeRadius, excludedRatio }) => {
    const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
    const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
    source.getContext('2d')!.drawImage(image, 0, 0);
    const r = relativeRadius * image.height, cx = (center[0] + 1) * image.width / 2, cy = (1 - center[1]) * image.height / 2;
    const region = document.createElement('canvas'); region.width = 96; region.height = 96;
    const context = region.getContext('2d')!;
    context.drawImage(source, cx - r, cy - r, r * 2, r * 2, 0, 0, 96, 96);
    const pixels = context.getImageData(0, 0, 96, 96).data;
    const signature: number[] = []; let samples = 0, white = 0, occupied = 0, sum = 0, squared = 0;
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      const radial = Math.hypot(x - 47.5, y - 47.5) / 47;
      if (radial > 1 || radial < excludedRatio) continue;
      const i = (y * 96 + x) * 4, red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2];
      signature.push(red, green, blue); samples++;
      if (Math.min(red, green, blue) > 210 && Math.max(red, green, blue) - Math.min(red, green, blue) < 35) white++;
      if (Math.max(red, green, blue) > 35 && Math.max(red, green, blue) - Math.min(red, green, blue) > 10) occupied++;
      const luminance = .2126 * red + .7152 * green + .0722 * blue; sum += luminance; squared += luminance * luminance;
    }
    const mean = sum / samples;
    return { signature, samples, whiteFraction: white / samples, occupiedFraction: occupied / samples, luminanceMean: mean, luminanceStd: Math.sqrt(Math.max(0, squared / samples - mean * mean)) };
  }, { base64: png.toString('base64'), center: state.projectedTarget, relativeRadius, excludedRatio: inner / outer });
}
function conciseSurface(image: SurfaceImage) {
  const { signature: _signature, ...metrics } = image;
  return metrics;
}
async function labelLayout(page: Page) {
  return page.evaluate(() => {
    const rect = (node: Element) => {
      const bounds = node.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, text: (node.getAttribute('aria-label') || node.textContent || '').trim() };
    };
    const visible = (node: Element) => {
      const style = getComputedStyle(node), bounds = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && bounds.width > 0 && bounds.height > 0;
    };
    const labels = [...document.querySelectorAll('.projected-label')].filter(visible).map(rect);
    const controls = [...document.querySelectorAll('.app-header,.body-navigation:not(.collapsed),.information-panel,.timeline,.view-controls,.scene-breadcrumb,.scene-caption,.reopen-info,.reopen-nav,.resource-status')].filter(visible).map(rect);
    return { canvas: rect(document.querySelector('canvas')!), labels, controls, total: document.querySelectorAll('.projected-label').length };
  });
}
function overlaps(a: Rect, b: Rect) {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1
    && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
}
async function assertLabelsFit(page: Page) {
  await frames(page, 5);
  const layout = await labelLayout(page);
  expect(layout.labels.length).toBeGreaterThan(0);
  for (let i = 0; i < layout.labels.length; i++) {
    const label = layout.labels[i], canvas = layout.canvas;
    expect(label.x, label.text + ' left bound').toBeGreaterThanOrEqual(canvas.x - 1);
    expect(label.y, label.text + ' top bound').toBeGreaterThanOrEqual(canvas.y - 1);
    expect(label.x + label.width, label.text + ' right bound').toBeLessThanOrEqual(canvas.x + canvas.width + 1);
    expect(label.y + label.height, label.text + ' bottom bound').toBeLessThanOrEqual(canvas.y + canvas.height + 1);
    for (const other of layout.labels.slice(i + 1)) expect(overlaps(label, other), label.text + ' overlaps ' + other.text).toBe(false);
    for (const control of layout.controls) expect(overlaps(label, control), label.text + ' overlaps UI ' + control.text.slice(0, 40)).toBe(false);
  }
  return layout;
}
async function drag(page: Page) {
  const bounds = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * .28, bounds.y + bounds.height * .3);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .49, bounds.y + bounds.height * .36, { steps: 12 });
  await page.mouse.up();
  await settled(page);
}

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  health.set(page, messages);
  page.on('pageerror', error => messages.push('JavaScript: ' + error.message));
  page.on('console', message => { if (message.type() === 'error') messages.push('Console: ' + message.text()); });
});
test.afterEach(async ({ page }) => {
  expect(health.get(page), 'no application, JavaScript or shader errors').toEqual([]);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`final: desktop ${viewport.width}x${viewport.height} labels and object-specific Sun/Saturn views`, async ({ page, browser }) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    await boot(page);
    await chooseBody(page, 'mercury');
    await page.getByRole('button', { name: '返回太阳系全景', exact: true }).click();
    await settled(page);
    const layout = await assertLabelsFit(page);
    const mercury = page.locator('.projected-label').filter({ hasText: '水星' });
    await expect(mercury).toBeVisible();
    await capture(page, 'final-overview-' + viewport.width);
    await mercury.click();
    await settled(page);
    expect((await snapshot(page)).selected).toBe('mercury');
    expect((await snapshot(page)).mode).toBe('body');
    await chooseBody(page, 'sun');
    const sun = await surfaceImage(page, 5);
    expect(sun.samples).toBeGreaterThan(5000);
    expect(sun.whiteFraction, 'solar surface should retain detail instead of becoming a white disk').toBeLessThan(.25);
    expect(sun.luminanceStd, 'surface-specific region must retain tonal detail').toBeGreaterThan(5);
    await capture(page, 'final-sun-' + viewport.width);
    await chooseBody(page, 'saturn');
    const radius = bodyRadius(bodyById.saturn, 'educational');
    const freeRing = await surfaceImage(page, radius, 2.35, 1.12);
    expect(freeRing.occupiedFraction, 'colored ring pixels must exist outside Saturn itself').toBeGreaterThan(.005);
    await capture(page, 'final-saturn-free-' + viewport.width);
    await page.getByRole('button', { name: '俯视', exact: true }).click();
    await settled(page);
    const topRing = await surfaceImage(page, radius, 2.35, 1.12);
    expect(topRing.occupiedFraction).toBeGreaterThan(.005);
    expect(imageDifference(freeRing, topRing), 'actual ring image must change with viewing angle').toBeGreaterThan(2);
    await capture(page, 'final-saturn-top-' + viewport.width);
    save('final-desktop-' + viewport.width, { environment: await environment(page, browser), layout,
      sun: conciseSurface(sun), saturnRingFree: conciseSurface(freeRing), saturnRingTop: conciseSurface(topRing) });
  });
}

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(point => ({ ...point, radiusX: 1, radiusY: 1, force: 1 })) });
}
test.describe('final mobile native touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  test('390x844 trusted one-finger orbit and two-finger zoom complete the solar lesson flow', async ({ page, browser }) => {
    test.setTimeout(120000);
    await boot(page);
    await chooseBody(page, 'earth');
    const bounds = (await page.locator('canvas').boundingBox())!;
    const evidencePromise = page.locator('canvas').evaluate(canvas => new Promise<{ trusted: boolean; touches: number }[]>(resolve => {
      const records: { trusted: boolean; touches: number }[] = [];
      const finish = () => { canvas.removeEventListener('touchstart', record); canvas.removeAttribute('data-qa-touch-ready'); clearTimeout(timer); resolve(records); };
      const record = (event: Event) => {
        const touchEvent = event as TouchEvent;
        records.push({ trusted: event.isTrusted, touches: touchEvent.touches.length });
        if (touchEvent.touches.length === 2) finish();
      };
      const timer = window.setTimeout(finish, 45000);
      canvas.addEventListener('touchstart', record, { passive: true });
      canvas.setAttribute('data-qa-touch-ready', 'true');
    })).catch(() => []);
    await expect(page.locator('canvas')).toHaveAttribute('data-qa-touch-ready', 'true');
    const cdp = await page.context().newCDPSession(page);
    const before = await snapshot(page);
    let afterRotate = before, afterPinch = before;
    let touchActive = false;
    try {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
      const x = bounds.x + bounds.width * .45, y = bounds.y + bounds.height * .4;
      await touch(cdp, 'touchStart', [{ x, y, id: 1 }]);
      touchActive = true;
      for (let step = 1; step <= 12; step++) {
        await touch(cdp, 'touchMove', [{ x: x + bounds.width * .2 * step / 12, y: y + bounds.height * .06 * step / 12, id: 1 }]);
        await frames(page, 1);
      }
      await touch(cdp, 'touchEnd', []);
      touchActive = false;
      await settled(page);
      afterRotate = await snapshot(page);
      const cx = bounds.x + bounds.width * .5, cy = bounds.y + bounds.height * .43;
      await touch(cdp, 'touchStart', [{ x: cx - 34, y: cy, id: 1 }, { x: cx + 34, y: cy, id: 2 }]);
      touchActive = true;
      for (let step = 1; step <= 12; step++) {
        const spread = 34 + step / 12 * 44;
        await touch(cdp, 'touchMove', [{ x: cx - spread, y: cy, id: 1 }, { x: cx + spread, y: cy, id: 2 }]);
        await frames(page, 1);
      }
      await touch(cdp, 'touchEnd', []);
      touchActive = false;
      await settled(page);
      afterPinch = await snapshot(page);
    } finally {
      // CDP rejects an extra touchEnd once the gesture already ended. Only
      // release a still-active gesture after an interrupted/error path.
      try { if (touchActive) await touch(cdp, 'touchEnd', []); }
      finally { await cdp.detach(); }
    }
    const touchEvents = await evidencePromise;
    expect(touchEvents.some(event => event.trusted && event.touches === 1), 'one-finger input must be a browser-native trusted touch').toBe(true);
    expect(touchEvents.some(event => event.trusted && event.touches === 2), 'pinch input must contain two actual trusted touches').toBe(true);
    expect(dotDirection(subtract(before.camera, before.focus), subtract(afterRotate.camera, afterRotate.focus)), 'one-finger drag must rotate the actual camera').toBeLessThan(.995);
    expect(distance(afterPinch.camera, afterPinch.focus), 'spreading two fingers must dolly the camera inward').toBeLessThan(distance(afterRotate.camera, afterRotate.focus) * .88);
    expect(distance(afterPinch.target, afterPinch.focus)).toBeLessThan(bodyRadius(bodyById.earth, 'educational') * .1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await capture(page, 'final-mobile-touch-earth');
    await chooseBody(page, 'sun');
    await ensureInfo(page);
    await page.getByTestId('enter-interior').click();
    await settled(page);
    await page.getByTestId('lesson-start').click();
    for (let index = 0; index < 4; index++) {
      await expect(page.getByTestId('lesson-step-' + index)).toHaveAttribute('aria-current', 'step');
      if (index < 3) await page.getByTestId('lesson-next').click();
    }
    await page.locator('.lesson-card h2').scrollIntoViewIfNeeded();
    await capture(page, 'final-mobile-solar-lesson');
    await page.getByTestId('lesson-exit').click();
    await expect(page.getByTestId('lesson-start')).toBeVisible();
    await page.getByRole('button', { name: '返回太阳系全景', exact: true }).click();
    await settled(page);
    expect((await snapshot(page)).mode).toBe('overview');
    await capture(page, 'final-mobile-overview');
    save('final-mobile-touch', { environment: await environment(page, browser), touchEvents, before, afterRotate, afterPinch,
      limitation: 'Trusted CDP touch exercises Chromium gesture handling at 390x844; no physical mobile device was used.' });
  });
});

function assertPipeline(state: FinalSnapshot, high: boolean) {
  expect(state.antialias, 'context antialias is fixed at creation rather than incorrectly toggled through React props').toBe(false);
  expect(state.postprocessing.active).toBe(high);
  expect(state.postprocessing.bloom).toBe(high);
  if (high) {
    expect(state.postprocessing.multisampling, 'high quality uses actual offscreen MSAA').toBeGreaterThan(0);
    expect(state.postprocessing.multisampling).toBeLessThanOrEqual(4);
    expect(state.postprocessing.passes).toBeGreaterThan(0);
  } else {
    expect(state.postprocessing.multisampling).toBe(0);
    expect(state.postprocessing.passes).toBe(0);
  }
}
function assertCameraPreserved(before: FinalSnapshot, after: FinalSnapshot, tolerance: number) {
  expect(after.mode).toBe(before.mode);
  expect(after.selected).toBe(before.selected);
  expect(after.scale).toBe(before.scale);
  expect(distance(subtract(before.camera, before.focus), subtract(after.camera, after.focus)), 'quality changes must preserve the manual camera orbit and dolly').toBeLessThan(tolerance);
  expect(distance(before.target, after.target)).toBeLessThan(tolerance);
}
test.describe('final quality with a high-density display', () => {
  // Without this a normal DPR=1 host can legitimately render both presets at
  // DPR=1, which cannot prove that the DPR limit is really changing.
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  test('high-low-high changes actual resolution, geometry, particles and MSAA without resetting the camera', async ({ page, browser }) => {
    test.setTimeout(150000);
    await boot(page);
    expect((await snapshot(page)).quality, 'a fresh browser uses the conservative initial preset').toBe('low');
    await quality(page, 'high');
    await chooseBody(page, 'earth');
    await drag(page);
    const high = await snapshot(page);
    expect(high.dpr).toBeCloseTo(1.5, 3);
    expect(high.drawingBuffer.w / high.viewport.w).toBeCloseTo(high.dpr, 1);
    expect(high.drawingBuffer.h / high.viewport.h).toBeCloseTo(high.dpr, 1);
    assertPipeline(high, true);
    await quality(page, 'low');
    const low = await snapshot(page);
    expect(low.dpr).toBeCloseTo(1, 3);
    expect(low.drawingBuffer.w / low.viewport.w).toBeCloseTo(1, 1);
    expect(low.meshVertices, 'low quality must use fewer actual mesh vertices').toBeLessThan(high.meshVertices / 1.4);
    expect(low.triangles, 'low quality must reduce actual triangle count').toBeLessThan(high.triangles / 1.4);
    expect(low.pointsVertices, 'low quality must reduce actual star/point geometry').toBeLessThan(high.pointsVertices);
    assertPipeline(low, false);
    assertCameraPreserved(high, low, bodyRadius(bodyById.earth, 'educational') * .03);
    await quality(page, 'high');
    const restored = await snapshot(page);
    expect(restored.dpr).toBeCloseTo(high.dpr, 3);
    expect(restored.meshVertices).toBe(high.meshVertices);
    expect(restored.pointsVertices).toBe(high.pointsVertices);
    assertPipeline(restored, true);
    assertCameraPreserved(high, restored, bodyRadius(bodyById.earth, 'educational') * .03);
    await capture(page, 'final-quality-high-earth');
    await chooseBody(page, 'sun');
    const highSun = await surfaceImage(page, 5);
    expect(highSun.whiteFraction, 'Bloom must not wash the object-specific solar surface into white').toBeLessThan(.25);
    expect(highSun.luminanceStd).toBeGreaterThan(5);
    await capture(page, 'final-sun-high-bloom');
    await quality(page, 'low');
    const lowSun = await surfaceImage(page, 5);
    expect(lowSun.whiteFraction).toBeLessThan(.25);
    expect(lowSun.luminanceStd).toBeGreaterThan(5);
    await capture(page, 'final-sun-low-no-bloom');
    await quality(page, 'high');
    await page.getByTestId('enter-interior').click();
    await settled(page);
    await page.getByTestId('show-all-layers').click();
    await page.getByTestId('energy-toggle').click();
    await frames(page, 4);
    const highInterior = await snapshot(page);
    expect(highInterior.energyParticles).toBeGreaterThan(0);
    await quality(page, 'low');
    const lowInterior = await snapshot(page);
    expect(lowInterior.energyParticles, 'low quality must reduce real energy particle geometry').toBeGreaterThan(0);
    expect(lowInterior.energyParticles).toBeLessThan(highInterior.energyParticles);
    expect(lowInterior.meshVertices).toBeLessThan(highInterior.meshVertices);
    expect(lowInterior.pointsVertices).toBeLessThan(highInterior.pointsVertices);
    assertPipeline(lowInterior, false);
    assertCameraPreserved(highInterior, lowInterior, .03);
    await quality(page, 'high');
    const restoredInterior = await snapshot(page);
    expect(restoredInterior.energyParticles).toBe(highInterior.energyParticles);
    assertPipeline(restoredInterior, true);
    await capture(page, 'final-quality-high-interior');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => page.evaluate(() => typeof window.__solarDiagnostics === 'function')).toBe(true);
    await expect.poll(async () => (await snapshot(page)).quality).toBe('high');
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    save('final-quality', { environment: await environment(page, browser), high, low, restored,
      highInterior, lowInterior, restoredInterior, highSun: conciseSurface(highSun), lowSun: conciseSurface(lowSun), manualOverrideSurvivedReload: true });
  });
});

async function resourceState(page: Page, label: string) {
  await frames(page, 4);
  const state = await snapshot(page), layout = await labelLayout(page);
  return { label, mode: state.mode, selected: state.selected, scale: state.scale, quality: state.quality, days: state.days,
    camera: state.camera, target: state.target, dpr: state.dpr, postprocessing: state.postprocessing,
    geometries: state.geometries, textures: state.textures, programs: state.programs,
    meshVertices: state.meshVertices, pointsVertices: state.pointsVertices,
    labelDOM: { total: layout.total, visible: layout.labels.length } };
}
async function representativeCycle(page: Page) {
  for (const id of ['earth', 'saturn', 'sun']) await chooseBody(page, id);
  await page.getByTestId('enter-interior').click();
  await settled(page);
  await page.getByTestId('lesson-start').click();
  await frames(page, 3);
  await page.getByTestId('lesson-step-2').click();
  await frames(page, 3);
  await page.getByTestId('lesson-step-3').click();
  await frames(page, 3);
  await page.getByTestId('lesson-exit').click();
  await page.getByRole('button', { name: '返回太阳系全景', exact: true }).click();
  await settled(page);
}
async function frameSample(page: Page, scenario: string) {
  const before = await snapshot(page);
  const sample = await page.evaluate(async requestedFrames => {
    const samples: { sampledAt: number; sequence: number }[] = [];
    const started = performance.now(); let previousSequence = -1;
    while (samples.length < requestedFrames && performance.now() - started < 45000) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const state = window.__solarDiagnostics!();
      if (state.frameSequence !== previousSequence) {
        samples.push({ sampledAt: performance.now(), sequence: state.frameSequence });
        previousSequence = state.frameSequence;
      }
    }
    return { samples, requestedFrames, durationMs: performance.now() - started };
  }, 90);
  expect(sample.samples.length, 'a performance sample needs enough distinct rendered frames').toBeGreaterThanOrEqual(30);
  const intervals = sample.samples.slice(1).map((frame, i) => frame.sampledAt - sample.samples[i].sampledAt).filter(value => value > 0);
  const sorted = [...intervals].sort((a, b) => a - b), fps = intervals.map(ms => 1000 / ms).sort((a, b) => a - b);
  return { scenario, method: 'One read-only rAF observation per distinct R3F frameSequence; no screenshots during sampling.',
    requestedFrames: sample.requestedFrames, observedFrames: sample.samples.length, durationMs: sample.durationMs,
    viewport: before.viewport, drawingBuffer: before.drawingBuffer, quality: before.quality, dpr: before.dpr,
    renderer: before.renderer, cpuThrottling: 1, frameIntervalsMs: intervals,
    intervalMs: { p50: quantile(sorted, .5), p95: quantile(sorted, .95), max: sorted[sorted.length - 1] },
    instantaneousFPS: { p05: quantile(fps, .05), p50: quantile(fps, .5), p95: quantile(fps, .95) } };
}
test('final: two warm cycles plus ten representative cycles retain bounded resources and record software-WebGL frame distributions', async ({ page, browser }) => {
  test.setTimeout(600000);
  await boot(page);
  await quality(page, 'high');
  const env = await environment(page, browser), warm = [];
  for (let i = 0; i < 2; i++) {
    await representativeCycle(page);
    warm.push(await resourceState(page, 'warm-' + (i + 1)));
  }
  const baseline = warm[warm.length - 1], cycles = [];
  await capture(page, 'final-resource-warm-overview');
  for (let i = 0; i < 10; i++) {
    await representativeCycle(page);
    cycles.push(await resourceState(page, 'measured-' + (i + 1)));
    save('final-resources', { environment: env, warmCycles: warm, baseline, measuredCycles: cycles,
      limitation: 'Same-state renderer/DOM counts test the exercised switching paths. They do not prove long-term whole-process memory is leak-free.' });
  }
  expect(cycles).toHaveLength(10);
  for (const cycle of cycles) {
    expect(cycle.mode).toBe('overview'); expect(cycle.selected).toBe('sun');
    expect(cycle.scale).toBe(baseline.scale); expect(cycle.quality).toBe(baseline.quality); expect(cycle.days).toBe(baseline.days);
    expect(cycle.dpr).toBe(baseline.dpr);
    expect(cycle.postprocessing).toEqual(baseline.postprocessing);
    expect(cycle.geometries, cycle.label + ' geometry allocation must remain bounded after warm-up').toBeLessThanOrEqual(baseline.geometries + 2);
    expect(cycle.textures, cycle.label + ' textures must not keep accumulating').toBeLessThanOrEqual(baseline.textures + 1);
    expect(cycle.programs, cycle.label + ' shader programs must not keep accumulating').toBeLessThanOrEqual(baseline.programs + 1);
    expect(cycle.labelDOM.total, cycle.label + ' must not leak labels').toBe(baseline.labelDOM.total);
    expect(distance(cycle.camera, baseline.camera)).toBeLessThan(.01);
    expect(distance(cycle.target, baseline.target)).toBeLessThan(.01);
  }
  await capture(page, 'final-resource-ten-cycles-overview');
  await page.getByRole('button', { name: '恢复模拟', exact: true }).click();
  await chooseBody(page, 'sun');
  const sun = await frameSample(page, 'animated-sun-closeup');
  await page.getByTestId('enter-interior').click();
  await settled(page);
  await page.getByTestId('show-all-layers').click();
  await page.getByTestId('energy-toggle').click();
  const interior = await frameSample(page, 'animated-interior-all-energy-processes');
  await page.getByRole('button', { name: '返回太阳系全景', exact: true }).click();
  await settled(page);
  const overview = await frameSample(page, 'running-overview');
  save('final-performance', { environment: env, samples: [sun, interior, overview],
    limitation: 'Observed browser frame intervals on software WebGL are not physical GPU measurements or evidence of hardware 60 FPS.' });
  console.log('FINAL RESOURCE COUNTS', JSON.stringify({ baseline, cycles }));
  console.log('FINAL FRAME DISTRIBUTIONS', JSON.stringify([sun, interior, overview].map(({ scenario, observedFrames, durationMs, intervalMs, instantaneousFPS }) => ({ scenario, observedFrames, durationMs, intervalMs, instantaneousFPS }))));
});

test('final: prefers-reduced-motion changes the actual camera flight and still reaches the selected target', async ({ page, browser }) => {
  await boot(page);
  await chooseBody(page, 'earth');
  const normal = await snapshot(page);
  expect(normal.cameraTransitionDuration).toBeGreaterThan(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  const clickedAt = page.getByTestId('nav-neptune').evaluate(button => new Promise<number>(resolve => {
    button.addEventListener('click', () => { button.removeAttribute('data-qa-flight-ready'); resolve(performance.now()); }, { once: true });
    button.setAttribute('data-qa-flight-ready', 'true');
  }));
  await expect(page.getByTestId('nav-neptune')).toHaveAttribute('data-qa-flight-ready', 'true');
  await page.getByTestId('nav-neptune').click();
  const started = await clickedAt;
  await expect.poll(async () => {
    const state = await snapshot(page);
    return state.selected === 'neptune' && !state.transitioning;
  }, { timeout: 15000, intervals: [25] }).toBe(true);
  const ended = await page.evaluate(() => performance.now()), reduced = await snapshot(page);
  expect(reduced.cameraTransitionDuration, 'JavaScript flight duration must honor reduced motion').toBeLessThanOrEqual(.11);
  expect(reduced.cameraTransitionDuration).toBeGreaterThan(0);
  const radius = bodyRadius(bodyById.neptune, reduced.scale);
  expect(distance(reduced.target, reduced.focus)).toBeLessThan(radius * .02);
  expect(distance(reduced.camera, reduced.focus)).toBeLessThan(radius * 25.1);
  expect(Math.abs(reduced.projectedTarget[0])).toBeLessThan(.85);
  expect(Math.abs(reduced.projectedTarget[1])).toBeLessThan(.85);
  await capture(page, 'final-reduced-motion-neptune');
  save('final-reduced-motion', { environment: await environment(page, browser), normalFlightDurationSeconds: normal.cameraTransitionDuration,
    reducedFlightDurationSeconds: reduced.cameraTransitionDuration, clickToObservedArrivalMs: ended - started, reduced,
    limitation: 'Wall time includes browser frame and observation delay; no hardware latency target is claimed.' });
});
