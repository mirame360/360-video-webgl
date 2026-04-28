import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebGL360Player } from '../createPlayer';
import type { WebGL360Source } from '../types';

const rendererMocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  setPose: vi.fn(),
  start: vi.fn(),
}));

vi.mock('../renderer/SceneRenderer', () => ({
  SceneRenderer: vi.fn().mockImplementation(function SceneRenderer() {
    return rendererMocks;
  }),
}));

const hlsSource: WebGL360Source = {
  src: '/video-1080p.m3u8',
  type: 'hls',
  quality: '1080p',
  mimeType: 'application/vnd.apple.mpegurl',
};

const mp4Source: WebGL360Source = {
  src: '/video-1080p.mp4',
  type: 'mp4',
  quality: '1080p',
  mimeType: 'video/mp4',
};

const fourKSource: WebGL360Source = {
  src: '/video-4k.mp4',
  type: 'mp4',
  quality: '4k',
  mimeType: 'video/mp4',
};

const eightKSource: WebGL360Source = {
  src: '/video-8k.mp4',
  type: 'mp4',
  quality: '8k',
  mimeType: 'video/mp4',
};

describe('createWebGL360Player integration', () => {
  beforeEach(() => {
    rendererMocks.destroy.mockClear();
    rendererMocks.setPose.mockClear();
    rendererMocks.start.mockClear();
    stubMediaElement({
      canPlayType: (type) => {
        if (type === 'application/vnd.apple.mpegurl' || type === 'application/x-mpegURL') {
          return 'maybe';
        }

        if (type === 'video/mp4') {
          return 'probably';
        }

        return '';
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId: string) => {
      if (contextId === 'webgl' || contextId === 'experimental-webgl') {
        return {
          MAX_TEXTURE_SIZE: 0x0d33,
          getParameter: vi.fn(() => 4096),
        } as unknown as RenderingContext;
      }
      return null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('creates a player, selects MP4 first when configured, and exposes state controls', async () => {
    const container = createContainer();
    const onReady = vi.fn();
    const analytics = { track: vi.fn() };
    const player = createWebGL360Player(container, {
      sources: [hlsSource, mp4Source],
      sourcePreference: ['mp4', 'hls'],
      analytics,
      onReady,
    });

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());

    expect(player.getState().mode).toBe('ready');
    expect(player.getState().selectedSource?.type).toBe('mp4');
    expect(container.dataset.webgl360Mode).toBe('webgl');
    expect(container.dataset.webgl360SourceType).toBe('mp4');
    expect(rendererMocks.start).toHaveBeenCalledOnce();

    player.setYaw(45);
    player.setPitch(12);
    player.setFov(80);

    expect(player.getState()).toMatchObject({
      yaw: 45,
      pitch: 12,
      fov: 80,
    });
    expect(analytics.track).toHaveBeenCalledWith('webgl_360_player_ready', expect.objectContaining({
      selectedSourceType: 'mp4',
      selectedQuality: '1080p',
    }));

    player.destroy();

    expect(player.getState().mode).toBe('destroyed');
    expect(rendererMocks.destroy).toHaveBeenCalled();
  });

  it('calls the caller-provided fallback when no configured source is playable', async () => {
    stubMediaElement({ canPlayType: () => '' });

    const container = createContainer();
    const fallback = vi.fn();
    const onFallback = vi.fn();
    const player = createWebGL360Player(container, {
      sources: [hlsSource],
      fallback,
      onFallback,
    });

    await vi.waitFor(() => expect(fallback).toHaveBeenCalledOnce());

    expect(onFallback).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'init_failed',
      container,
    }));
    expect(container.dataset.webgl360Mode).toBe('fallback');
    expect(player.getState().mode).toBe('fallback');
  });

  it('uses a caller-provided source loader for HLS on browsers without native HLS', async () => {
    stubMediaElement({
      canPlayType: (type) => (type === 'video/mp4' ? 'probably' : ''),
    });

    const container = createContainer();
    const cleanup = vi.fn();
    const sourceLoader = vi.fn(async ({ video, source, waitForReady }) => {
      video.src = source.src;
      await waitForReady();
      return cleanup;
    });
    const onReady = vi.fn();
    const player = createWebGL360Player(container, {
      sources: [hlsSource],
      sourceLoader,
      onReady,
    });

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());

    expect(sourceLoader).toHaveBeenCalledWith(expect.objectContaining({
      source: hlsSource,
    }));
    expect(player.getState().selectedSource?.type).toBe('hls');

    player.destroy();

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('shows a default error state when no fallback callback is provided', async () => {
    stubMediaElement({ canPlayType: () => '' });

    const container = createContainer();
    const player = createWebGL360Player(container, {
      sources: [hlsSource],
    });

    await vi.waitFor(() => expect(player.getState().mode).toBe('error'));

    expect(container.dataset.webgl360Mode).toBe('error');
    expect(container.querySelector('.webgl-360-player__error')?.textContent).toContain(
      'The 360 video player could not start',
    );
  });

  it('applies the iPhone quality ceiling when maxQuality is not configured', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });

    const container = createContainer();
    const onReady = vi.fn();
    const player = createWebGL360Player(container, {
      sources: [eightKSource, fourKSource],
      defaultQuality: '8k',
      onReady,
    });

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());

    expect(player.getState().selectedSource?.quality).toBe('4k');
  });

  it('keeps device capability checks even when 8k maxQuality is explicit on iPhone', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });

    const container = createContainer();
    const onReady = vi.fn();
    const player = createWebGL360Player(container, {
      sources: [eightKSource, fourKSource],
      defaultQuality: '8k',
      maxQuality: '8k',
      onReady,
    });

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());

    expect(player.getState().selectedSource?.quality).toBe('4k');
    expect(player.getState().availableQualities).toEqual(['4k']);
  });

  it('selects 8k when device capabilities allow it', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15',
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId: string) => {
      if (contextId === 'webgl' || contextId === 'experimental-webgl') {
        return {
          MAX_TEXTURE_SIZE: 0x0d33,
          getParameter: vi.fn(() => 8192),
        } as unknown as RenderingContext;
      }
      return null;
    });

    const container = createContainer();
    const onReady = vi.fn();
    const player = createWebGL360Player(container, {
      sources: [eightKSource, fourKSource],
      defaultQuality: '8k',
      maxQuality: '8k',
      onReady,
    });

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());

    expect(player.getState().selectedSource?.quality).toBe('8k');
    expect(player.getState().availableQualities).toContain('8k');
  });

  it('switches quality through the public API without recreating the player', async () => {
    const container = createContainer();
    const onReady = vi.fn();
    const onQualityChange = vi.fn();
    const player = createWebGL360Player(container, {
      sources: [fourKSource, mp4Source],
      defaultQuality: '1080p',
      sourcePreference: ['mp4', 'hls'],
      onReady,
      onQualityChange,
    });

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(player.getState().selectedSource?.quality).toBe('1080p');

    const result = await player.setQuality('4k');

    expect(result).toMatchObject({ ok: true, quality: '4k' });
    expect(player.getState().selectedSource?.quality).toBe('4k');
    expect(onQualityChange).toHaveBeenCalledWith(expect.objectContaining({ ok: true, quality: '4k' }), expect.any(Object));
  });
});

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  container.style.width = '640px';
  container.style.height = '360px';
  document.body.appendChild(container);
  return container;
}

function stubMediaElement(options: { canPlayType: (type: string) => CanPlayTypeResult }): void {
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(options.canPlayType);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockImplementation(function readyState() {
    return 1;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function load() {
    return undefined;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play() {
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function pause() {
    return undefined;
  });
}
