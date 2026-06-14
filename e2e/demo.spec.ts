import { expect, test, type Page } from '@playwright/test';

type PlayerState = {
  fov: number;
  isMuted: boolean;
  isPaused: boolean;
  isStereoEnabled: boolean;
  pitch: number;
  selectedSource?: { quality: string };
  yaw: number;
};

async function playerState(page: Page): Promise<PlayerState> {
  return page.evaluate(() => {
    const player = (window as typeof window & {
      __webgl360Player?: { getState: () => PlayerState };
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

    if (testInfo.project.name === 'mobile-safari') {
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

    await page.locator('#analytics-flush').click();
    await expect(page.locator('#event-log')).toContainText('"event": "analytics_flushed"');
  });
});
