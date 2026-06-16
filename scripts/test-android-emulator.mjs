import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const port = 4174;
const hostUrl = `http://127.0.0.1:${port}`;
const demoUrl = `${hostUrl}/?e2e=1`;
const resultsDir = 'test-results/android-emulator';
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
  if (server.pid && process.platform !== 'win32') {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }
  } else {
    server.kill('SIGTERM');
  }
  await Promise.race([
    new Promise((resolve) => server?.once('exit', resolve)),
    delay(5_000).then(() => {
      if (!server || server.exitCode !== null) return;
      if (server.pid && process.platform !== 'win32') {
        try {
          process.kill(-server.pid, 'SIGKILL');
          return;
        } catch {
          // Fall back to killing the npm wrapper below.
        }
      }
      server?.kill('SIGKILL');
    }),
  ]);
}

async function run() {
  mkdirSync(resultsDir, { recursive: true });
  server = spawn('npm', ['run', 'demo', '--', '--host', '0.0.0.0', '--port', String(port), '--strictPort'], {
    detached: process.platform !== 'win32',
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
  await delay(15_000);

  const activity = `${tryAdb('shell', 'dumpsys', 'activity', 'top')}\n${tryAdb('shell', 'dumpsys', 'window')}`;
  if (!activity.includes('com.android.chrome')) {
    throw new Error(`Android Chrome did not stay in the foreground:\n${activity.slice(0, 2000)}`);
  }

  adb('shell', 'input', 'tap', '720', '1560');
  await delay(500);
  adb('shell', 'input', 'tap', '1320', '2920');
  await delay(500);
  adb('shell', 'input', 'swipe', '1050', '1500', '380', '1180', '500');
  await delay(500);
  adb('shell', 'input', 'tap', '940', '2920');
  await delay(500);

  const deviceScreenshot = '/sdcard/webgl-360-smoke.png';
  const localScreenshot = `${resultsDir}/success.png`;
  adb('shell', 'screencap', '-p', deviceScreenshot);
  adb('pull', deviceScreenshot, localScreenshot);
  if (statSync(localScreenshot).size < 1024) {
    throw new Error('Android emulator screenshot artifact is unexpectedly small.');
  }
}

try {
  await run();
  console.log('Android Chrome emulator checks passed.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await stopServer();
  process.exit(process.exitCode ?? 0);
}
