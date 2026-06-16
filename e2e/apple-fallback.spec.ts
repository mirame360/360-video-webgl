import { expect, test } from '@playwright/test';

type PlayerApi = {
  getState: () => {
    isMuted: boolean;
    isPaused: boolean;
    mode: string;
  };
};

test.describe('macOS WebKit coverage', () => {
  test('keeps the demo usable with WebGL or the native fallback', async ({ page }) => {
    await page.goto('/?e2e=1');

    await expect(page.locator('#viewer')).toHaveAttribute('data-webgl360-mode', /^(fallback|webgl)$/);
    await expect(page.locator('#player-ui')).toBeVisible();

    const mode = await page.locator('#viewer').getAttribute('data-webgl360-mode');
    if (mode === 'webgl') {
      await expect(page.locator('#viewer video')).toHaveCount(1);
      await expect(page.locator('#viewer canvas')).toBeVisible();
      await expect(page.locator('.webgl-360-watermark')).toHaveText('Powered by MIRAME360.COM');

      await page.locator('#ui-big-play').click();
      await expect.poll(async () => page.evaluate(() => {
        const player = (window as typeof window & { __webgl360Player?: PlayerApi }).__webgl360Player;
        return player?.getState().isPaused;
      })).toBe(false);

      await page.locator('#ui-mute').click();
      await expect.poll(async () => page.evaluate(() => {
        const player = (window as typeof window & { __webgl360Player?: PlayerApi }).__webgl360Player;
        return player?.getState().isMuted;
      })).toBe(true);

      await page.locator('#ui-quality').selectOption('720p');
      await expect(page.locator('#viewer')).toHaveAttribute('data-webgl360-quality', '720p');
      return;
    }

    await expect(page.locator('#viewer .empty-state')).toContainText('The WebGL player could not start');
    await expect(page.locator('#event-log')).toContainText('"event": "fallback"');
    await expect.poll(async () => page.evaluate(() => {
      const player = (window as typeof window & { __webgl360Player?: PlayerApi }).__webgl360Player;
      return player?.getState().mode;
    })).toBe('fallback');
  });
});
