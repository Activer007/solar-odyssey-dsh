import { test, expect } from '@playwright/test';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build, preview, type PreviewServer } from 'vite';
import type { DiagnosticSnapshot } from '../../src/scene/Diagnostics';

interface LifecycleSample {
  type: string; trusted: boolean; visibility: DocumentVisibilityState; at: number;
  clock: DiagnosticSnapshot | null;
}
declare global { interface Window { __clockLifecycleEvents: LifecycleSample[] } }
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function availablePort() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local CDP port');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

// Browser plugin not available. A normal Playwright page forces focus emulation
// and stays visible in headless Chromium. A noDefaults CDP connection to the
// default context preserves NATIVE visibility/freeze events; never mock them.
test('clock: native tab hiding, freezing and minimizing never accrue background time', async ({ playwright }) => {
  test.setTimeout(120000);
  const port = await availablePort();
  const owner = await playwright.chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    headless: true,
    args: [`--remote-debugging-port=${port}`, '--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const tempParent = resolve(tmpdir()), fixture = mkdtempSync(join(tempParent, 'solar-clock-native-'));
  let appServer: PreviewServer | undefined;
  try {
    // Freezing closes Vite's HMR socket and its client reloads the whole app,
    // even with server.hmr=false. Use a real static build with ONLY the read-only
    // diagnostics retained (the sole import.meta.env.DEV branch in app source).
    const outDir = join(fixture, 'dist');
    await build({ define: { 'import.meta.env.DEV': 'true' }, build: { outDir, emptyOutDir: false }, logLevel: 'error' });
    appServer = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    const address = appServer.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('No local app port');
    const appUrl = `http://127.0.0.1:${address.port}/`;
    const browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
    try {
      const context = browser.contexts()[0], page = await context.newPage();
      const errors: string[] = [];
      const navigation: string[] = [], sockets: string[] = [];
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigation.push(frame.url()); });
      page.on('websocket', socket => sockets.push(socket.url()));
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.bringToFront();
      await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveTitle(/Solar Odyssey/);
      await expect(page.getByRole('heading', { name: '我们的太阳系', exact: true })).toBeVisible();
      await expect(page.locator('canvas')).toBeVisible();
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => Boolean(window.__solarDiagnostics))).toBe(true);
      // Register AFTER the app's layout-effect listeners. Native event dispatch
      // may run a microtask checkpoint between listeners, so an init-script
      // observer + queueMicrotask can still see the PRE-settlement clock value.
      await page.evaluate(() => {
        window.__clockLifecycleEvents = [];
        const record = (event: Event) => window.__clockLifecycleEvents.push({
          type: event.type, trusted: event.isTrusted, visibility: document.visibilityState, at: performance.now(),
          clock: window.__solarDiagnostics?.() || null,
        });
        for (const type of ['visibilitychange', 'freeze', 'resume']) document.addEventListener(type, record);
        for (const type of ['pagehide', 'pageshow']) window.addEventListener(type, record);
      });
      await page.getByRole('button', { name: '暂停模拟', exact: true }).click();
      await page.getByRole('button', { name: '重置模拟时间至J2000', exact: true }).click();
      await page.getByLabel('时间流速', { exact: true }).fill('2');
      await page.getByRole('button', { name: '恢复模拟', exact: true }).click();
      await wait(600);
      const cdp = await context.newCDPSession(page), other = await context.newPage();
      await other.goto('about:blank');
      await other.bringToFront();
      await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden');
      const hidden = await page.evaluate(() => window.__clockLifecycleEvents.filter(event => event.type === 'visibilitychange' && event.visibility === 'hidden').at(-1)!);
      expect(hidden.trusted).toBe(true);
      expect(hidden.clock).not.toBeNull();
      await wait(1200);
      expect(await page.evaluate(() => window.__solarDiagnostics!().days)).toBe(hidden.clock!.days);
      await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
      await wait(1200); // Do not evaluate JavaScript while the renderer is frozen.
      await cdp.send('Page.setWebLifecycleState', { state: 'active' });
      await wait(1000);
      const background = await page.evaluate(() => ({ clock: window.__solarDiagnostics!(), events: window.__clockLifecycleEvents }));
      expect(background.clock.days).toBe(hidden.clock!.days);
      expect(background.clock.animationElapsed).toBe(hidden.clock!.animationElapsed);
      expect(background.clock.animationDelta).toBe(0);
      for (const type of ['freeze', 'resume']) expect(background.events.some(event => event.type === type && event.trusted && event.visibility === 'hidden')).toBe(true);
      await page.bringToFront();
      await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
      const shown = await page.evaluate(() => window.__clockLifecycleEvents.filter(event => event.type === 'visibilitychange' && event.visibility === 'visible').at(-1)!);
      expect(shown.trusted).toBe(true);
      expect(shown.at - hidden.at).toBeGreaterThan(3000);
      expect(shown.clock!.days).toBe(hidden.clock!.days);
      expect(shown.clock!.animationDelta).toBe(0);
      await expect(page.getByRole('button', { name: '暂停模拟', exact: true })).toBeVisible();
      const before = await page.evaluate(() => ({ ...window.__solarDiagnostics!(), wallTime: performance.now() }));
      await wait(1500);
      const after = await page.evaluate(() => ({ ...window.__solarDiagnostics!(), wallTime: performance.now() }));
      const rate = (after.days - before.days) / ((after.wallTime - before.wallTime) / 1000);
      expect(after.frameSequence).toBeGreaterThan(before.frameSequence);
      expect(rate).toBeGreaterThan(90);
      expect(rate).toBeLessThan(110);
      expect(after.animationDelta).toBeLessThanOrEqual(.1);
      // The pause choice survives native minimize/restore as well as tab changes.
      await page.getByRole('button', { name: '暂停模拟', exact: true }).click();
      const paused = await page.evaluate(() => window.__solarDiagnostics!());
      const { windowId } = await cdp.send('Browser.getWindowForTarget');
      try {
        await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
        await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden');
        await wait(1000);
      } finally {
        await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
        await page.bringToFront();
      }
      await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
      await wait(600);
      const restored = await page.evaluate(() => window.__solarDiagnostics!());
      expect(restored.days).toBe(paused.days);
      expect(restored.animationElapsed).toBe(paused.animationElapsed);
      await expect(page.getByRole('button', { name: '恢复模拟', exact: true })).toBeVisible();
      expect(errors).toEqual([]);
      expect(navigation).toEqual([appUrl]);
      expect(sockets).toEqual([]);
      const output = process.env.SOLAR_QA_OUTPUT;
      if (output) {
        mkdirSync(output, { recursive: true });
        writeFileSync(join(output, 'clock-native-lifecycle.json'), JSON.stringify({ hidden, background, shown, before, after, rate, paused, restored, events: await page.evaluate(() => window.__clockLifecycleEvents), errors, navigation, sockets }, null, 2));
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.getByTestId('simulation-date')).toBeVisible();
        await page.screenshot({ path: join(output, 'clock-native-restored-mobile.png') });
      }
    } finally { await browser.close(); }
  } finally {
    await owner.close();
    if (appServer) await new Promise<void>((resolve, reject) => appServer!.httpServer.close(error => error ? reject(error) : resolve()));
    // Delete only the exact temporary fixture created above, never a repo path.
    const target = resolve(fixture);
    if (dirname(target) !== tempParent || !basename(target).startsWith('solar-clock-native-')) throw new Error('Unsafe fixture cleanup');
    rmSync(target, { recursive: true, force: true });
  }
});
