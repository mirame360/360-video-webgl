/* global document, PointerEvent, window */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';

const port = 4174;
const hostUrl = `http://127.0.0.1:${port}`;
const demoUrl = `${hostUrl}/?e2e=1`;
const resultsDir = 'test-results/android-emulator';
let browser;
let server;

function adb(...args) {
  return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tryAdb(...args) {
  try {
    return adb(...args);
  } catch (error) {
    console.warn(`adb ${args.join(' ')} failed:`, error.stderr?.toString() || error.message);
    return '';
  }
}

async function waitForUrl(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server or remote debugging socket is still starting.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server?.once('exit', resolve)),
    delay(5_000).then(() => server?.kill('SIGKILL')),
  ]);
}

async function run() {
  mkdirSync(resultsDir, { recursive: true });
  server = spawn('npm', ['run', 'demo', '--', '--host', '0.0.0.0', '--port', String(port), '--strictPort'], {
    env: process.env,
    stdio: 'inherit',
  });

  await waitForUrl(hostUrl);
  adb('wait-for-device');
  adb('reverse', `tcp:${port}`, `tcp:${port}`);
  tryAdb('shell', 'am', 'force-stop', 'com.android.chrome');
  tryAdb('shell', 'pm', 'clear', 'com.android.chrome');
  adb(
    'shell',
    'sh',
    '-c',
    'echo "chrome --disable-fre --no-default-browser-check --no-first-run --remote-debugging-port=9222" > /data/local/tmp/chrome-command-line',
  );
  adb(
    'shell',
    'am',
    'start',
    '-n',
    'com.android.chrome/com.google.android.apps.chrome.Main',
    '--ez',
    'com.android.chrome.firstrun.skip',
    'true',
    '-d',
    demoUrl,
  );
  adb('forward', 'tcp:9222', 'localabstract:chrome_devtools_remote');

  await waitForUrl('http://127.0.0.1:9222/json/version', 45_000);
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  if (!context) throw new Error('Android Chrome did not expose a browser context');

  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto(demoUrl, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#viewer')).toHaveAttribute('data-webgl360-mode', 'webgl');
  await expect(page.locator('#viewer canvas')).toBeVisible();
  await expect(page.locator('#viewer video')).toHaveCount(1);
  await expect(page.locator('#player-ui')).toBeVisible();

  await page.locator('#ui-big-play').click();
  await expect.poll(() => page.evaluate(() => window.__webgl360Player?.getState().isPaused)).toBe(false);

  await page.locator('#ui-mute').click();
  await expect.poll(() => page.evaluate(() => window.__webgl360Player?.getState().isMuted)).toBe(true);

  const initialFov = await page.evaluate(() => window.__webgl360Player?.getState().fov);
  await page.locator('#ui-zoom-in').click();
  await expect.poll(() => page.evaluate(() => window.__webgl360Player?.getState().fov)).toBeLessThan(initialFov);

  await page.locator('#viewer').evaluate((element) => {
    element.setPointerCapture = () => {};
    const pointer = (type, pointerId, x, y) => {
      element.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: y,
        isPrimary: pointerId === 1,
        pointerId,
        pointerType: 'touch',
      }));
    };
    pointer('pointerdown', 1, 100, 160);
    pointer('pointerdown', 2, 180, 160);
    pointer('pointermove', 2, 260, 160);
    pointer('pointerup', 2, 260, 160);
    pointer('pointerup', 1, 100, 160);
  });
  await expect.poll(() => page.evaluate(() => window.__webgl360Player?.getState().fov)).toBeLessThan(initialFov);

  await page.locator('#ui-quality').selectOption('720p');
  await expect(page.locator('#viewer')).toHaveAttribute('data-webgl360-quality', '720p');

  await page.locator('#ui-motion').click();
  await expect.poll(() => page.evaluate(() => window.__webgl360Player?.getState().isMotionEnabled)).toBe(true);
  await page.locator('#ui-motion').click();
  await expect.poll(() => page.evaluate(() => window.__webgl360Player?.getState().isMotionEnabled)).toBe(false);

  await page.locator('#api-stereo-on').click();
  await expect(page.locator('#viewer')).toHaveAttribute('data-webgl360-stereo', 'true');
  await page.locator('#api-stereo-off').click();

  await page.locator('#api-sub-track').selectOption('es');
  await expect(page.locator('.webgl-360-subtitle-control__button')).toHaveAttribute('data-active', 'true');

  await page.locator('#ui-fullscreen').click();
  await expect.poll(() => page.evaluate(() => (
    Boolean(document.fullscreenElement)
    || document.querySelector('#viewer-container')?.classList.contains('is-pseudo-fullscreen')
  ))).toBe(true);

  await page.screenshot({ path: `${resultsDir}/success.png`, fullPage: true });
}

try {
  await run();
  console.log('Android Chrome emulator checks passed.');
} catch (error) {
  console.error(error);
  try {
    const page = browser?.contexts()[0]?.pages()[0];
    await page?.screenshot({ path: `${resultsDir}/failure.png`, fullPage: true });
  } catch (screenshotError) {
    console.error('Could not capture Android failure screenshot:', screenshotError);
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stopServer();
  process.exit(process.exitCode ?? 0);
}
