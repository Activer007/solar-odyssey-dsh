import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DiagnosticSnapshot } from '../../src/scene/Diagnostics';
import { solarLayerById, type SolarLayerId } from '../../src/data/solarStructure';

// Browser plugin not available. Use the repository Chromium/WebGL workflow.
// Geometry topology, winding and radial energy bounds have independent unit
// tests; these checks exercise their rendered composition and real UI linkage.
const layerNames = {
  core: '核心区', radiative: '辐射区', convective: '对流区', photosphere: '光球层',
  chromosphere: '色球层', transition: '过渡区', corona: '日冕',
} as const;
const lessonLayers = ['core', 'radiative', 'convective', 'photosphere'] as const;
const lessonTitles = ['核心聚变', '辐射扩散', '对流循环', '光球辐射与太阳大气'];
const layerExtent = (id: SolarLayerId) => 5 * solarLayerById[id].displayOuter * 1.1;
const lessonExtent = (index: number) => layerExtent(index === 3 ? 'corona' : lessonLayers[index]);
const errors = new WeakMap<Page, string[]>();
const subtract = (a: number[], b: number[]) => a.map((value, index) => value - b[index]);
const length = (point: number[]) => Math.hypot(...point);
const distance = (a: number[], b: number[]) => length(subtract(a, b));
const averageDifference = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
async function snapshot(page: Page): Promise<DiagnosticSnapshot> {
  return page.evaluate(() => window.__solarDiagnostics!());
}
async function frames(page: Page, count: number) {
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
    stable = distance(current.camera, previous.camera) < .003 && distance(current.target, previous.target) < .003 ? stable + 1 : 0;
    previous = current;
    return stable;
  }, { timeout: 20000, intervals: [150] }).toBeGreaterThanOrEqual(3);
}
async function capture(page: Page, name: string) {
  const output = process.env.SOLAR_QA_OUTPUT;
  if (!output) return;
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: join(output, name + '.png') });
}

interface ModelImage {
  signature: number[];
  samples: number;
  occupiedFraction: number;
  colorBuckets: number;
  warmInterior: number;
  redBand: number;
  violetBand: number;
  nearPlumes: number;
  farPlumes: number;
}
async function modelImage(page: Page, extent = 6.8): Promise<ModelImage> {
  const state = await snapshot(page);
  expect(state.mode, 'this visual region must contain the solar interior itself').toBe('interior');
  const cameraDistance = distance(state.camera, state.focus);
  // Isolate the projected model. Corona checks use its full extent, while the
  // expanded model gets a separate wider crop.
  const relativeRadius = extent / cameraDistance / (2 * Math.tan(state.fov * Math.PI / 360));
  const png = await page.locator('canvas').screenshot();
  return page.evaluate(async ({ base64, center, relativeRadius }) => {
    const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
    const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
    const sourceContext = source.getContext('2d')!; sourceContext.drawImage(image, 0, 0);
    const radius = relativeRadius * source.height;
    const cx = (center[0] + 1) * source.width / 2, cy = (1 - center[1]) * source.height / 2;
    const region = document.createElement('canvas'); region.width = 64; region.height = 64;
    const context = region.getContext('2d')!;
    context.drawImage(source, cx - radius, cy - radius, radius * 2, radius * 2, 0, 0, 64, 64);
    const pixels = context.getImageData(0, 0, 64, 64).data;
    const signature: number[] = [], buckets = new Set<string>();
    let occupied = 0, samples = 0, warmInterior = 0, redBand = 0, violetBand = 0;
    let nearPlumes = 0, farPlumes = 0, nearSamples = 0, farSamples = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const radial = Math.hypot(x - 31.5, y - 31.5) / 31;
      if (radial > 1) continue;
      const i = (y * 64 + x) * 4, red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2];
      signature.push(red, green, blue); samples++;
      const brightest = Math.max(red, green, blue), darkest = Math.min(red, green, blue);
      if (brightest > 42 && brightest - darkest > 20) {
        occupied++;
        buckets.add([red, green, blue].map(value => Math.floor(value / 48)).join(','));
      }
      if (radial < .58 && red > 115 && green > 68 && red - blue > 43 && green - blue > 21) warmInterior++;
      if (red > 130 && green < red * .7 && Math.abs(green - blue) < red * .2) redBand++;
      if (blue > 105 && blue > red * 1.07 && red > green * 1.08) violetBand++;
      const nearWhite = darkest > 40 && brightest - darkest < 23;
      if (radial >= .69 && radial < .87) { nearSamples++; if (nearWhite) nearPlumes++; }
      if (radial >= .89) { farSamples++; if (nearWhite) farPlumes++; }
    }
    return { signature, samples, occupiedFraction: occupied / samples, colorBuckets: buckets.size,
      warmInterior, redBand, violetBand, nearPlumes: nearPlumes / nearSamples, farPlumes: farPlumes / farSamples };
  }, { base64: png.toString('base64'), center: state.projectedTarget, relativeRadius });
}
function assertModelVisible(image: ModelImage, minimum = .08) {
  expect(image.samples, 'projected object region must contain enough image samples').toBeGreaterThan(2500);
  expect(image.occupiedFraction, 'the solar model must actually render in its projected region').toBeGreaterThan(minimum);
  expect(image.colorBuckets, 'the cutaway must retain visible material detail').toBeGreaterThan(2);
}
function assertCoronaVisible(image: ModelImage) {
  expect(image.nearPlumes, 'white streamers should occupy part of the outer annulus').toBeGreaterThan(.035);
  expect(image.nearPlumes, 'the halo should retain gaps between streamers').toBeLessThan(.45);
  expect(image.farPlumes, 'white streamers should fade toward their tips').toBeLessThan(image.nearPlumes * .55);
}
async function visualSettled(page: Page, extent = 6.8) {
  let previous = await modelImage(page, extent), stable = 0;
  await expect.poll(async () => {
    await frames(page, 1);
    const current = await modelImage(page, extent);
    stable = averageDifference(previous.signature, current.signature) < .4 ? stable + 1 : 0;
    previous = current;
    return stable;
  }, { timeout: 20000, intervals: [150] }).toBeGreaterThanOrEqual(2);
  return previous;
}
async function assertStep(page: Page, index: number) {
  await expect(page.getByTestId('lesson-step-' + index)).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('.lesson-card h2')).toHaveText(lessonTitles[index]);
  await expect(page.getByTestId('energy-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.layer-detail h2')).toHaveText(layerNames[lessonLayers[index]]);
  for (const id of Object.keys(layerNames)) {
    const highlighted = index === 3 ? ['photosphere', 'chromosphere', 'transition', 'corona'].includes(id) : id === lessonLayers[index];
    await expect(page.getByTestId('layer-' + id)).toHaveAttribute('aria-pressed', String(highlighted));
  }
  await expect(page.locator('.lesson-animation')).toBeVisible();
  await frames(page, 6);
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
  await page.getByTestId('nav-sun').click();
  await settled(page);
  await page.getByTestId('enter-interior').click();
  await settled(page);
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page), 'no application, JavaScript or shader errors').toEqual([]);
});

test('stage 2: four teaching steps link layers, explanations and animated structure, then return to free exploration', async ({ page }) => {
  test.setTimeout(120000);
  await page.getByTestId('show-all-layers').click();
  assertModelVisible(await visualSettled(page));
  await page.getByTestId('lesson-start').click();
  await assertStep(page, 0);
  await expect(page.getByTestId('lesson-prev')).toBeDisabled();
  await expect(page.locator('.lesson-card')).toContainText('氢核');
  await expect(page.locator('.lesson-card')).toContainText('氦核');
  await page.getByRole('button', { name: '恢复模拟', exact: true }).click();
  await frames(page, 8);
  assertModelVisible(await modelImage(page, lessonExtent(0)));
  await capture(page, 'stage2-lesson-1-fusion');
  for (const index of [1, 2, 3]) {
    await page.getByTestId('lesson-next').click();
    await assertStep(page, index);
    if (index === 3) await page.getByRole('button', { name: '暂停模拟', exact: true }).click();
    const image = index === 3 ? await visualSettled(page, lessonExtent(index)) : await modelImage(page, lessonExtent(index));
    assertModelVisible(image);
    if (index === 3) {
      await expect(page.getByTestId('solar-color-note')).toContainText('示意配色');
      expect(image.warmInterior).toBeGreaterThan(250);
      expect(image.redBand).toBeGreaterThan(25);
      expect(image.violetBand).toBeGreaterThan(12);
      assertCoronaVisible(image);
    }
    await capture(page, 'stage2-lesson-' + (index + 1));
    if (index === 3) await page.getByRole('button', { name: '恢复模拟', exact: true }).click();
  }
  await expect(page.getByTestId('lesson-next')).toBeDisabled();
  await expect(page.locator('.lesson-card')).toContainText('传导');
  await expect(page.locator('.lesson-card')).toContainText('太阳风');
  await page.getByTestId('lesson-prev').click();
  await assertStep(page, 2);
  await expect(page.locator('.lesson-card')).toContainText('上升');
  await expect(page.locator('.lesson-card')).toContainText('下沉');
  await page.getByTestId('lesson-step-1').click();
  await assertStep(page, 1);
  await expect(page.locator('.lesson-card')).toContainText('再发射');
  await expect(page.locator('.lesson-card')).toContainText('回折');
  await page.getByTestId('lesson-step-0').click();
  await assertStep(page, 0);
  await page.getByTestId('lesson-exit').click();
  await expect(page.getByTestId('lesson-start')).toBeVisible();
  await expect(page.locator('.lesson-card')).toHaveCount(0);
  await expect(page.getByTestId('energy-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.layer-detail')).toHaveCount(0);
  await page.getByRole('button', { name: '返回太阳外部', exact: true }).click();
  await settled(page);
  expect((await snapshot(page)).mode).toBe('body');
  await expect(page.getByTestId('enter-interior')).toBeVisible();
  await page.getByRole('button', { name: '返回太阳系全景', exact: true }).click();
  await settled(page);
  await expect(page.getByRole('heading', { name: '我们的太阳系', exact: true })).toBeVisible();
});

test('stage 2: seven cancellable layers render from the front and rear with opacity and expansion', async ({ page }) => {
  test.setTimeout(240000);
  await page.getByTestId('show-all-layers').click();
  for (const id of Object.keys(layerNames) as SolarLayerId[]) {
    const name = layerNames[id];
    const layer = page.getByTestId('layer-' + id);
    await layer.click();
    await expect(layer).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.layer-detail h2')).toHaveText(name);
    await expect(page.locator('.layer-detail .source-link')).toHaveAttribute('href', /^https:\/\//);
    const image = await visualSettled(page, layerExtent(id));
    if (id === 'corona') assertCoronaVisible(image);
    else assertModelVisible(image);
    await capture(page, 'stage2-layer-' + id + '-front');
    await layer.click();
    await expect(layer).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.layer-detail')).toHaveCount(0);
  }
  await page.getByTestId('layer-radiative').click();
  await page.getByTestId('show-all-layers').click();
  for (const id of Object.keys(layerNames)) await expect(page.getByTestId('layer-' + id)).toHaveAttribute('aria-pressed', 'false');
  const front = await visualSettled(page), before = await snapshot(page);
  assertModelVisible(front);
  await capture(page, 'stage2-closed-shells-front');
  const bounds = await page.locator('canvas').boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width * .18, bounds!.y + bounds!.height * .22);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * .82, bounds!.y + bounds!.height * .22, { steps: 20 });
  await page.mouse.up();
  await settled(page);
  const after = await snapshot(page), from = subtract(before.camera, before.focus), to = subtract(after.camera, after.focus);
  expect(from.reduce((sum, value, index) => sum + value * to[index], 0) / length(from) / length(to), 'the actual camera must reach the back of the model').toBeLessThan(-.25);
  const rear = await visualSettled(page);
  assertModelVisible(rear);
  expect(averageDifference(front.signature, rear.signature), 'rear geometry must produce a different object image').toBeGreaterThan(2);
  await capture(page, 'stage2-closed-shells-rear');
  for (const id of Object.keys(layerNames) as SolarLayerId[]) {
    const layer = page.getByTestId('layer-' + id);
    await layer.click();
    await expect(layer).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.layer-detail h2')).toHaveText(layerNames[id]);
    const image = await visualSettled(page, layerExtent(id));
    if (id === 'corona') assertCoronaVisible(image);
    else assertModelVisible(image);
    await capture(page, 'stage2-layer-' + id + '-rear');
    await layer.click();
    await expect(layer).toHaveAttribute('aria-pressed', 'false');
  }
  await page.getByTestId('show-all-layers').click();
  await visualSettled(page);
  await page.getByRole('slider', { name: '外层透明度', exact: true }).fill('0.3');
  const transparent = await visualSettled(page);
  assertModelVisible(transparent, .04);
  expect(averageDifference(rear.signature, transparent.signature), 'opacity must affect rendered shell materials').toBeGreaterThan(.5);
  await capture(page, 'stage2-shells-transparent-rear');
  await page.getByTestId('lesson-start').click();
  await assertStep(page, 0);
  const expand = page.getByRole('button', { name: '分层展开', exact: true });
  await expand.click();
  await expect(expand).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('energy-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.lesson-card')).toHaveCount(0);
  await expect(page.getByTestId('lesson-start')).toBeVisible();
  await page.getByTestId('show-all-layers').click();
  await page.getByRole('slider', { name: '外层透明度', exact: true }).fill('0.65');
  await settled(page);
  const expanded = await visualSettled(page, 10.4);
  assertModelVisible(expanded, .025);
  await capture(page, 'stage2-shells-expanded-rear');
  await expand.click();
  await expect(expand).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await settled(page);
  await page.getByTestId('energy-toggle').click();
  await expect(page.getByTestId('energy-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '恢复模拟', exact: true }).click();
  await frames(page, 10);
  assertModelVisible(await modelImage(page));
  await capture(page, 'stage2-free-energy-exploration');
  await page.getByRole('button', { name: '返回太阳系全景', exact: true }).click();
  await settled(page);
  await expect(page.getByRole('heading', { name: '我们的太阳系', exact: true })).toBeVisible();
});
