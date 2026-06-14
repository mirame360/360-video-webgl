import { expect, test, type Page } from '@playwright/test';

type PlayerState = {
  currentTime: number;
  diagnostics: { events: unknown[] };
  duration: number;
  fov: number;
  isDebug: boolean;
  isMotionEnabled: boolean;
  isMuted: boolean;
  isPaused: boolean;
  isStereoEnabled: boolean;
  pitch: number;
  selectedSource?: { quality: string };
  yaw: number;
};

type PlayerApi = {
  captureFrame: (options?: { type?: string; quality?: number }) => Promise<Blob>;
  exportConfig: () => Record<string, unknown>;
  getState: () => PlayerState;
  importConfig: (config: Record<string, unknown>) => Promise<void>;
  requestFullscreen: () => Promise<boolean>;
  exitFullscreen: () => Promise<boolean>;
  seek: (time: number) => void;
  setDebug: (enabled: boolean) => void;
  setMotionEnabled: (enabled: boolean) => Promise<boolean>;
  setView: (view: { yaw?: number; pitch?: number; fov?: number }) => void;
};

type DemoApi = {
  getHotspotClickCount: () => number;
  hotspots: {
    getHotspots: () => Array<{ id: string }>;
    setHotspots: (hotspots: Array<{ id: string; yaw: number; pitch: number; label: string }>) => void;
  };
  subtitles: {
    getActiveTrack: () => { id: string } | undefined;
    isEnabled: () => boolean;
  };
  timeline: {
    getActiveChapter: () => { id: string } | undefined;
    nextChapter: () => boolean;
    previousChapter: () => boolean;
    seekToChapter: (id: string) => boolean;
  };
};

function isTouchProject(projectName: string): boolean {
  return projectName.startsWith('android-') || projectName.startsWith('ios-');
}

async function playerState(page: Page): Promise<PlayerState> {
  return page.evaluate(() => {
    const player = (window as typeof window & {
      __webgl360Player?: PlayerApi;
    }).__webgl360Player;
    if (!player) throw new Error('Demo player is not available');
    return player.getState();
  });
}

async function openDemo(page: Page): Promise<void> {
  await page.goto('/?e2e=1');
  await expect(page.locator('#viewer')).toHaveAttribute('data-webgl360-mode', 'webgl');
  await expect(page.locator('#viewer canvas')).toBeVisible();
}

test.describe('WebGL 360 video demo', () => {
  test.beforeEach(async ({ page }) => {
    await openDemo(page);
  });

  test('starts the video renderer and mounts the core UI plugins', async ({ page }) => {
    await expect(page.locator('#viewer video')).toHaveCount(1);
    await expect(page.locator('#player-ui')).toBeVisible();
    await expect(page.locator('.webgl-360-watermark')).toHaveText('Powered by MIRAME360.COM');
    await expect(page.locator('.webgl-360-subtitle-control__button')).toHaveText('CC');
    await expect(page.locator('.webgl-360-stereo-control')).toHaveText('VR');

    const state = await playerState(page);
    expect(state.selectedSource?.quality).toBe('1080p');
    expect(state.isPaused).toBe(true);
  });

  test('plays, mutes, zooms and changes the 360 view', async ({ page }, testInfo) => {
    await page.locator('#ui-big-play').click();
    await expect.poll(async () => (await playerState(page)).isPaused).toBe(false);

    await page.locator('#ui-mute').click();
    await expect.poll(async () => (await playerState(page)).isMuted).toBe(true);

    const initial = await playerState(page);
    await page.locator('#ui-zoom-in').click();
    await expect.poll(async () => (await playerState(page)).fov).toBeLessThan(initial.fov);
    await expect(page.locator('#ui-zoom-level')).not.toHaveText('1.0x');

    if (isTouchProject(testInfo.project.name)) {
      await page.locator('#viewer').evaluate((element) => {
        element.setPointerCapture = () => {};
        const init = { bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true };
        element.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: 300, clientY: 220 }));
        element.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: 120, clientY: 140 }));
        element.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: 120, clientY: 140 }));
      });
    } else {
      const canvas = page.locator('#viewer canvas');
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.55);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.35, { steps: 8 });
        await page.mouse.up();
      }
    }
    await expect.poll(async () => (await playerState(page)).yaw).not.toBe(initial.yaw);
  });

  test('switches video quality while preserving a ready renderer', async ({ page }) => {
    await page.locator('#ui-quality').selectOption('720p');

    await expect(page.locator('#viewer')).toHaveAttribute('data-webgl360-quality', '720p');
    await expect(page.locator('#viewer')).toHaveAttribute('data-webgl360-mode', 'webgl');
    await expect.poll(async () => (await playerState(page)).selectedSource?.quality).toBe('720p');
    await expect(page.locator('#event-log')).toContainText('"event": "quality_change"');
  });

  test('updates color grading and watermark presentation', async ({ page }) => {
    const exposure = page.locator('[data-color-filter="exposure"]');
    await exposure.evaluate((input: HTMLInputElement) => {
      input.value = '0.75';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('[data-color-value="exposure"]')).toHaveText('0.75');

    await page.locator('#wm-text').fill('E2E BRAND');
    await expect(page.locator('.webgl-360-watermark')).toHaveText('E2E BRAND');
    await page.locator('#wm-position').selectOption('bottom-right');
    await expect(page.locator('.webgl-360-watermark')).toHaveAttribute('data-position', 'bottom-right');

    await page.locator('#color-reset').click();
    await expect(page.locator('[data-color-value="exposure"]')).toHaveText('0.00');
    await expect(page.locator('#event-log')).toContainText('"event": "color_grading_reset"');
  });

  test('controls stereo, subtitles and analytics through plugin APIs', async ({ page }) => {
    await page.locator('#api-stereo-on').click();
    await expect(page.locator('#viewer')).toHaveAttribute('data-webgl360-stereo', 'true');
    await expect.poll(async () => (await playerState(page)).isStereoEnabled).toBe(true);

    await page.locator('#api-stereo-off').click();
    await expect(page.locator('#viewer')).toHaveAttribute('data-webgl360-stereo', 'false');

    await page.locator('#api-sub-track').selectOption('es');
    await expect(page.locator('#api-sub-track')).toHaveValue('es');
    await expect(page.locator('.webgl-360-subtitle-control__button')).toHaveAttribute('data-active', 'true');
    expect(await page.evaluate(() => {
      const demo = (window as typeof window & { __webgl360Demo?: DemoApi }).__webgl360Demo;
      return demo?.subtitles.getActiveTrack()?.id;
    })).toBe('es');

    await page.locator('#analytics-flush').click();
    await expect(page.locator('#event-log')).toContainText('"event": "analytics_flushed"');
  });

  test('seeks with the progress bar and keyboard shortcuts', async ({ page }) => {
    await page.evaluate(() => {
      (window as typeof window & { __webgl360Player?: PlayerApi }).__webgl360Player?.seek(1);
    });
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await playerState(page)).currentTime).toBeGreaterThanOrEqual(5);

    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await playerState(page)).currentTime).toBeLessThan(5);

    await page.keyboard.press('KeyM');
    await expect.poll(async () => (await playerState(page)).isMuted).toBe(true);

    await page.keyboard.press('Space');
    await expect.poll(async () => (await playerState(page)).isPaused).toBe(false);
    await page.keyboard.press('KeyK');
    await expect.poll(async () => (await playerState(page)).isPaused).toBe(true);

    const progress = page.locator('#ui-progress');
    await progress.evaluate((input: HTMLInputElement) => {
      input.value = '2';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect.poll(async () => (await playerState(page)).currentTime).toBeCloseTo(2, 0);
  });

  test('zooms with wheel and touch pinch input', async ({ page }, testInfo) => {
    const initialFov = (await playerState(page)).fov;
    const viewer = page.locator('#viewer');

    if (isTouchProject(testInfo.project.name)) {
      await viewer.evaluate((element) => {
        element.setPointerCapture = () => {};
        const pointer = (type: string, pointerId: number, x: number, y: number) => {
          element.dispatchEvent(new PointerEvent(type, {
            bubbles: true,
            clientX: x,
            clientY: y,
            isPrimary: pointerId === 1,
            pointerId,
            pointerType: 'touch',
          }));
        };
        pointer('pointerdown', 1, 120, 160);
        pointer('pointerdown', 2, 180, 160);
        pointer('pointermove', 2, 260, 160);
        pointer('pointerup', 2, 260, 160);
        pointer('pointerup', 1, 120, 160);
      });
    } else {
      await viewer.dispatchEvent('wheel', { deltaY: -300 });
    }

    await expect.poll(async () => (await playerState(page)).fov).toBeLessThan(initialFov);
  });

  test('round-trips exported configuration and captures a rendered frame', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const player = (window as typeof window & { __webgl360Player?: PlayerApi }).__webgl360Player;
      if (!player) throw new Error('Demo player is not available');
      player.setView({ yaw: 42, pitch: 12, fov: 58 });
      player.setDebug(true);
      const config = player.exportConfig();
      player.setView({ yaw: -20, pitch: -10, fov: 90 });
      player.setDebug(false);
      await player.importConfig(config);
      const frame = await player.captureFrame({ type: 'image/png' });
      return {
        config,
        frameSize: frame.size,
        frameType: frame.type,
        state: player.getState(),
      };
    });

    expect(result.config.view).toEqual({ yaw: 42, pitch: 12, fov: 58 });
    expect(result.state).toMatchObject({ yaw: 42, pitch: 12, fov: 58, isDebug: true });
    expect(result.frameSize).toBeGreaterThan(0);
    expect(result.frameType).toBe('image/png');
    await expect(page.locator('.webgl-360-debug-overlay')).toBeVisible();
  });

  test('uses the pseudo-fullscreen fallback and exits cleanly', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const player = (window as typeof window & { __webgl360Player?: PlayerApi }).__webgl360Player;
      if (!player) throw new Error('Demo player is not available');
      const viewer = document.querySelector<HTMLElement>('#viewer');
      if (!viewer) throw new Error('Viewer is not available');
      Object.defineProperty(viewer, 'requestFullscreen', {
        configurable: true,
        value: () => Promise.reject(new Error('forced E2E fallback')),
      });
      const enteredNatively = await player.requestFullscreen();
      const enteredPseudo = viewer.classList.contains('is-pseudo-fullscreen');
      const exitedNatively = await player.exitFullscreen();
      return {
        enteredNatively,
        enteredPseudo,
        exitedNatively,
        remainsPseudo: viewer.classList.contains('is-pseudo-fullscreen'),
      };
    });

    expect(result).toEqual({
      enteredNatively: false,
      enteredPseudo: true,
      exitedNatively: false,
      remainsPseudo: false,
    });
  });

  test('handles motion permission and orientation state', async ({ page }) => {
    const enabled = await page.evaluate(async () => {
      const player = (window as typeof window & { __webgl360Player?: PlayerApi }).__webgl360Player;
      if (!player) throw new Error('Demo player is not available');
      return player.setMotionEnabled(true);
    });
    expect(enabled).toBe(true);
    await expect.poll(async () => (await playerState(page)).isMotionEnabled).toBe(true);

    await page.evaluate(() => {
      const event = new Event('deviceorientation');
      Object.defineProperties(event, {
        alpha: { value: 30 },
        beta: { value: 10 },
        gamma: { value: 5 },
      });
      window.dispatchEvent(event);
    });

    const disabled = await page.evaluate(async () => {
      const player = (window as typeof window & { __webgl360Player?: PlayerApi }).__webgl360Player;
      if (!player) throw new Error('Demo player is not available');
      return player.setMotionEnabled(false);
    });
    expect(disabled).toBe(false);
    await expect.poll(async () => (await playerState(page)).isMotionEnabled).toBe(false);
  });

  test('renders clickable hotspots and navigates timeline chapters', async ({ page }) => {
    await page.locator('#ui-big-play').click();
    const hotspot = page.locator('[data-hotspot-id="center"]');
    const initialClickCount = await page.evaluate(() => {
      const demo = (window as typeof window & { __webgl360Demo?: DemoApi }).__webgl360Demo;
      return demo?.getHotspotClickCount() ?? 0;
    });
    await expect(hotspot).toBeVisible();
    await hotspot.click({ trial: true });
    await hotspot.dispatchEvent('click');
    await expect.poll(async () => page.evaluate(() => {
      const demo = (window as typeof window & { __webgl360Demo?: DemoApi }).__webgl360Demo;
      return demo?.getHotspotClickCount() ?? 0;
    })).toBe(initialClickCount + 1);

    expect(await page.evaluate(() => {
      const demo = (window as typeof window & { __webgl360Demo?: DemoApi }).__webgl360Demo;
      return demo?.hotspots.getHotspots().map(({ id }) => id);
    })).toEqual(['center']);
    expect(await page.evaluate(() => {
      const demo = (window as typeof window & { __webgl360Demo?: DemoApi }).__webgl360Demo;
      return demo?.timeline.seekToChapter('middle');
    })).toBe(true);
    await expect.poll(async () => page.evaluate(() => {
      const demo = (window as typeof window & { __webgl360Demo?: DemoApi }).__webgl360Demo;
      return demo?.timeline.getActiveChapter()?.id;
    })).toBe('middle');
    expect(await page.evaluate(() => {
      const demo = (window as typeof window & { __webgl360Demo?: DemoApi }).__webgl360Demo;
      return demo?.timeline.nextChapter();
    })).toBe(true);
    await expect.poll(async () => page.evaluate(() => {
      const demo = (window as typeof window & { __webgl360Demo?: DemoApi }).__webgl360Demo;
      return demo?.timeline.getActiveChapter()?.id;
    })).toBe('end');
    expect(await page.evaluate(() => {
      const demo = (window as typeof window & { __webgl360Demo?: DemoApi }).__webgl360Demo;
      return demo?.timeline.previousChapter();
    })).toBe(true);
    await expect.poll(async () => page.evaluate(() => {
      const demo = (window as typeof window & { __webgl360Demo?: DemoApi }).__webgl360Demo;
      return demo?.timeline.getActiveChapter()?.id;
    })).toBe('middle');
  });

  test('exercises every button exposed by the demo UI', async ({ page }) => {
    const staticButtonIds = await page.locator('button[id]').evaluateAll((buttons) => (
      buttons.map((button) => button.id).sort()
    ));
    expect(staticButtonIds).toEqual([
      'analytics-flush',
      'api-stereo-off',
      'api-stereo-on',
      'api-stereo-toggle',
      'api-sub-toggle',
      'color-reset',
      'ui-big-play',
      'ui-fullscreen',
      'ui-motion',
      'ui-mute',
      'ui-play-pause',
      'ui-zoom-in',
      'ui-zoom-out',
    ]);

    await page.locator('#ui-big-play').click();
    await expect.poll(async () => (await playerState(page)).isPaused).toBe(false);
    await page.locator('#ui-play-pause').click();
    await expect.poll(async () => (await playerState(page)).isPaused).toBe(true);
    await page.locator('#ui-play-pause').click();
    await expect.poll(async () => (await playerState(page)).isPaused).toBe(false);

    await page.locator('#ui-mute').click();
    await expect.poll(async () => (await playerState(page)).isMuted).toBe(true);

    const initialFov = (await playerState(page)).fov;
    await page.locator('#ui-zoom-in').click();
    await expect.poll(async () => (await playerState(page)).fov).toBeLessThan(initialFov);
    await page.locator('#ui-zoom-out').click();
    await expect.poll(async () => (await playerState(page)).fov).toBe(initialFov);

    await page.locator('#ui-motion').click();
    await expect.poll(async () => (await playerState(page)).isMotionEnabled).toBe(true);
    await page.locator('#ui-motion').click();
    await expect.poll(async () => (await playerState(page)).isMotionEnabled).toBe(false);

    await page.evaluate(() => {
      const container = document.querySelector<HTMLElement>('#viewer-container');
      if (!container) throw new Error('Viewer container is not available');
      Object.defineProperty(container, 'requestFullscreen', {
        configurable: true,
        value: () => Promise.reject(new Error('forced E2E fallback')),
      });
    });
    await page.locator('#ui-fullscreen').click();
    await expect(page.locator('#viewer-container')).toHaveClass(/is-pseudo-fullscreen/);
    await page.locator('#ui-fullscreen').click();
    await expect(page.locator('#viewer-container')).not.toHaveClass(/is-pseudo-fullscreen/);

    await page.locator('[data-color-filter="exposure"]').evaluate((input: HTMLInputElement) => {
      input.value = '1';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#color-reset').click();
    await expect(page.locator('[data-color-value="exposure"]')).toHaveText('0.00');
    await page.locator('#analytics-flush').click();
    await expect(page.locator('#event-log')).toContainText('"event": "analytics_flushed"');

    await page.locator('#api-stereo-on').click();
    await expect.poll(async () => (await playerState(page)).isStereoEnabled).toBe(true);
    await page.locator('#api-stereo-off').click();
    await expect.poll(async () => (await playerState(page)).isStereoEnabled).toBe(false);
    await page.locator('#api-stereo-toggle').click();
    await expect.poll(async () => (await playerState(page)).isStereoEnabled).toBe(true);

    const stereoControl = page.locator('.webgl-360-stereo-control');
    await stereoControl.click();
    await expect.poll(async () => (await playerState(page)).isStereoEnabled).toBe(false);

    await page.locator('#api-sub-toggle').click();
    expect(await page.evaluate(() => {
      const demo = (window as typeof window & { __webgl360Demo?: DemoApi }).__webgl360Demo;
      return demo?.subtitles.isEnabled();
    })).toBe(false);

    const subtitleControl = page.locator('.webgl-360-subtitle-control__button');
    const subtitleMenu = page.locator('.webgl-360-subtitle-control__menu');
    await subtitleControl.click();
    await expect(subtitleMenu).toBeVisible();
    await subtitleMenu.getByRole('menuitemradio', { name: 'English' }).click();
    await subtitleControl.click();
    await subtitleMenu.getByRole('menuitemradio', { name: 'Spanish' }).click();
    await subtitleControl.click();
    await subtitleMenu.getByRole('menuitemradio', { name: 'Off' }).click();

    const xrControl = page.locator('.webgl-360-xr-control');
    await expect(xrControl).toBeVisible();
    await expect(xrControl).toBeDisabled();
    await expect(xrControl).toHaveText('VR unavailable');

  });
});
