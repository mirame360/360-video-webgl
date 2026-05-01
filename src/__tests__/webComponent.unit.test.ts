import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineWebGL360PlayerElement } from '../web-component';
import { createWebGL360Player } from '../createPlayer';
import type { WebGL360Player } from '../types';

vi.mock('../createPlayer', () => ({
  createWebGL360Player: vi.fn(),
}));

describe('WebGL360PlayerElement', () => {
  const tagName = 'webgl-360-player-test';

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('creates and destroys a player from attributes', () => {
    const player = createMockPlayer();
    vi.mocked(createWebGL360Player).mockReturnValue(player);
    defineWebGL360PlayerElement(tagName);
    const element = document.createElement(tagName);
    element.setAttribute('src', '/video.mp4');
    element.setAttribute('quality', '4k');
    element.setAttribute('autoplay', '');
    element.setAttribute('projection-mode', '180');
    element.setAttribute('stereo-source-layout', 'left-right');

    document.body.appendChild(element);

    expect(createWebGL360Player).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({
        autoplay: true,
        projectionMode: '180',
        stereoSourceLayout: 'left-right',
        sources: [{ src: '/video.mp4', type: 'mp4', quality: '4k' }],
      }),
    );

    element.remove();

    expect(player.destroy).toHaveBeenCalledOnce();
  });

  it('accepts JSON sources and forwards public methods', async () => {
    const player = createMockPlayer();
    vi.mocked(createWebGL360Player).mockReturnValue(player);
    defineWebGL360PlayerElement(tagName);
    const element = document.createElement(tagName) as HTMLElement & {
      play: () => Promise<void>;
      setView: WebGL360Player['setView'];
      getView: WebGL360Player['getView'];
    };
    element.setAttribute('sources', JSON.stringify([
      { src: '/video.m3u8', type: 'hls', quality: 'hls' },
    ]));

    document.body.appendChild(element);

    await element.play();
    element.setView({ yaw: 20 });

    expect(player.play).toHaveBeenCalledOnce();
    expect(player.setView).toHaveBeenCalledWith({ yaw: 20 });
    expect(element.getView()).toEqual({ yaw: 0, pitch: 0, fov: 75 });
    expect(createWebGL360Player).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({
        sources: [{ src: '/video.m3u8', type: 'hls', quality: 'hls' }],
      }),
    );
  });

  it('recreates the player when observed attributes change', () => {
    const firstPlayer = createMockPlayer();
    const secondPlayer = createMockPlayer();
    vi.mocked(createWebGL360Player)
      .mockReturnValueOnce(firstPlayer)
      .mockReturnValueOnce(secondPlayer);
    defineWebGL360PlayerElement(tagName);
    const element = document.createElement(tagName);
    element.setAttribute('src', '/one.mp4');

    document.body.appendChild(element);
    element.setAttribute('src', '/two.mp4');

    expect(firstPlayer.destroy).toHaveBeenCalledOnce();
    expect(createWebGL360Player).toHaveBeenLastCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({
        sources: [{ src: '/two.mp4', type: 'mp4', quality: 'auto' }],
      }),
    );
  });
});

function createMockPlayer(): WebGL360Player {
  return {
    destroy: vi.fn(),
    on: vi.fn(() => () => undefined),
    off: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    stop: vi.fn(),
    togglePlay: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn(),
    setYaw: vi.fn(),
    setPitch: vi.fn(),
    setFov: vi.fn(),
    setView: vi.fn(),
    getView: vi.fn().mockReturnValue({ yaw: 0, pitch: 0, fov: 75 }),
    setMuted: vi.fn(),
    setDebug: vi.fn(),
    setMotionEnabled: vi.fn().mockResolvedValue(true),
    setQuality: vi.fn().mockResolvedValue({ ok: true, quality: '1080p' }),
    exportConfig: vi.fn().mockReturnValue({
      view: { yaw: 0, pitch: 0, fov: 75 },
      muted: true,
      debug: false,
      motionEnabled: false,
      stereoMode: { enabled: false, eyeYawOffset: 1.5 },
      colorFilters: {
        exposure: 0,
        brightness: 1,
        contrast: 1,
        saturation: 1,
        temperature: 0,
        tint: 0,
        vignette: 0,
      },
    }),
    importConfig: vi.fn().mockResolvedValue(undefined),
    requestFullscreen: vi.fn().mockResolvedValue(true),
    exitFullscreen: vi.fn().mockResolvedValue(true),
    captureFrame: vi.fn().mockResolvedValue(new Blob(['frame'])),
    getState: vi.fn().mockReturnValue({
      mode: 'ready',
      stage: 'main',
      yaw: 0,
      pitch: 0,
      fov: 75,
      currentTime: 0,
      duration: 0,
      fps: 0,
      bitrate: 0,
      isMotionEnabled: false,
      isMuted: true,
      isPaused: true,
      isLooping: false,
      isDebug: false,
      isStereoEnabled: false,
      availableQualities: [],
      sourceSupport: [],
      attemptedSources: [],
      diagnostics: {
        contextLostCount: 0,
        decodedFrames: 0,
        droppedFrames: 0,
        droppedFrameRatio: 0,
        events: [],
      },
    }),
  };
}
