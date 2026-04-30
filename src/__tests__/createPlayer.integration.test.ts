import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebGL360Player } from '../createPlayer';
import { createColorGradingPlugin } from '../plugins/colorGrading';
import type { WebGL360PluginContext, WebGL360Source } from '../types';

const rendererMocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  setColorFilters: vi.fn(),
  setStereoMode: vi.fn(),
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
    rendererMocks.setColorFilters.mockClear();
    rendererMocks.setStereoMode.mockClear();
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

    const seekHandler = vi.fn();
    player.on('seek', seekHandler);
    player.seek(12);

    expect(seekHandler).toHaveBeenCalledWith(expect.objectContaining({
      currentTime: 12,
      previousTime: expect.any(Number),
      state: expect.objectContaining({ currentTime: 12 }),
    }));
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

  it('installs plugins, emits events, and runs plugin cleanup on destroy', async () => {
    const container = createContainer();
    const cleanup = vi.fn();
    const readyHandler = vi.fn();
    const qualityHandler = vi.fn();
    const install = vi.fn((context: WebGL360PluginContext) => {
      context.on('ready', readyHandler);
      context.on('qualitychange', qualityHandler);
      context.registerCleanup(cleanup);
      const button = document.createElement('button');
      button.textContent = 'Plugin';
      context.registerCleanup(context.mountControl(button));
      context.setStereoMode({ enabled: true, eyeYawOffset: 2 });
    });
    const onReady = vi.fn();
    const player = createWebGL360Player(container, {
      sources: [fourKSource, mp4Source],
      defaultQuality: '1080p',
      sourcePreference: ['mp4', 'hls'],
      plugins: [{ id: 'test-plugin', install }],
      requiredPlugins: ['test-plugin'],
      onReady,
    });

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());

    expect(install).toHaveBeenCalledWith(expect.objectContaining({
      player,
      container,
      getVideo: expect.any(Function),
      getState: expect.any(Function),
      mountControl: expect.any(Function),
      registerCleanup: expect.any(Function),
    }));
    expect(container.querySelector('.webgl-360-plugin-controls')?.textContent).toBe('Plugin');
    expect(rendererMocks.setStereoMode).toHaveBeenCalledWith({
      enabled: true,
      eyeYawOffset: 2,
    });
    expect(player.getState().isStereoEnabled).toBe(true);
    expect(readyHandler).toHaveBeenCalledWith(expect.objectContaining({ mode: 'ready' }));

    const result = await player.setQuality('4k');

    expect(result.ok).toBe(true);
    expect(qualityHandler).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({ ok: true, quality: '4k' }),
      state: expect.objectContaining({ mode: 'ready' }),
    }));

    player.destroy();

    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
    expect(container.querySelector('.webgl-360-plugin-controls')).toBeNull();
  });

  it('supports event unsubscribe and isolates listener failures', async () => {
    const container = createContainer();
    const onReady = vi.fn();
    const persistentReadyHandler = vi.fn();
    const removedReadyHandler = vi.fn();
    const throwingReadyHandler = vi.fn(() => {
      throw new Error('listener failed');
    });
    const onDiagnostic = vi.fn();
    const install = vi.fn((context: WebGL360PluginContext) => {
      context.on('ready', persistentReadyHandler);
      const unsubscribe = context.on('ready', removedReadyHandler);
      unsubscribe();
      context.on('ready', throwingReadyHandler);
    });
    const player = createWebGL360Player(container, {
      sources: [mp4Source],
      plugins: [install],
      onReady,
      onDiagnostic,
    });

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());

    expect(player.getState().mode).toBe('ready');
    expect(persistentReadyHandler).toHaveBeenCalledOnce();
    expect(removedReadyHandler).not.toHaveBeenCalled();
    expect(throwingReadyHandler).toHaveBeenCalledOnce();
    expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      type: 'plugin_error',
      message: 'Event listener for "ready" failed',
      error: 'listener failed',
    }), expect.any(Object));
  });

  it('runs returned and registered plugin cleanups once in reverse order', async () => {
    const container = createContainer();
    const cleanupCalls: string[] = [];
    const cleanupA = vi.fn(() => {
      cleanupCalls.push('registered-a');
    });
    const cleanupB = vi.fn(() => {
      cleanupCalls.push('returned-b');
    });
    const onReady = vi.fn();
    const player = createWebGL360Player(container, {
      sources: [mp4Source],
      plugins: [
        (context) => {
          context.registerCleanup(cleanupA);
        },
        () => cleanupB,
      ],
      onReady,
    });

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());

    player.destroy();
    player.destroy();

    await vi.waitFor(() => expect(cleanupA).toHaveBeenCalledOnce());
    expect(cleanupB).toHaveBeenCalledOnce();
    expect(cleanupCalls).toEqual(['returned-b', 'registered-a']);
  });

  it('applies color grading plugin filters when the renderer starts and updates later', async () => {
    const container = createContainer();
    const onReady = vi.fn();
    const colorGrading = createColorGradingPlugin({
      filters: {
        exposure: 0.25,
        contrast: 1.2,
        saturation: 1.1,
      },
    });
    const player = createWebGL360Player(container, {
      sources: [mp4Source],
      plugins: [colorGrading],
      onReady,
    });

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());

    expect(rendererMocks.setColorFilters).toHaveBeenCalledWith(expect.objectContaining({
      exposure: 0.25,
      contrast: 1.2,
      saturation: 1.1,
    }));

    colorGrading.setFilters({ brightness: 0.1, vignette: 0.3 });

    expect(colorGrading.getFilters()).toMatchObject({
      exposure: 0.25,
      brightness: 0.1,
      contrast: 1.2,
      saturation: 1.1,
      vignette: 0.3,
    });
    expect(rendererMocks.setColorFilters).toHaveBeenLastCalledWith(expect.objectContaining({
      brightness: 0.1,
      vignette: 0.3,
    }));

    player.destroy();
  });

  it('continues playback when an optional plugin fails to install', async () => {
    const container = createContainer();
    const onReady = vi.fn();
    const onDiagnostic = vi.fn();
    const player = createWebGL360Player(container, {
      sources: [mp4Source],
      plugins: [() => {
        throw new Error('optional plugin failed');
      }],
      onReady,
      onDiagnostic,
    });

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());

    expect(player.getState().mode).toBe('ready');
    expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      type: 'plugin_error',
      reason: 'optional_plugin_failed',
      error: 'optional plugin failed',
    }), expect.any(Object));
  });

  it('falls back when a required plugin fails to install', async () => {
    const container = createContainer();
    const fallback = vi.fn();
    const player = createWebGL360Player(container, {
      sources: [mp4Source],
      plugins: [{
        id: 'required-plugin',
        install: () => {
          throw new Error('required plugin failed');
        },
      }],
      requiredPlugins: ['required-plugin'],
      fallback,
    });

    await vi.waitFor(() => expect(fallback).toHaveBeenCalledOnce());

    expect(player.getState().mode).toBe('fallback');
    expect(player.getState().diagnostics.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'plugin_error',
        reason: 'required_plugin_failed',
        error: 'required plugin failed',
      }),
    ]));
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
    const pauseSpy = vi.mocked(HTMLMediaElement.prototype.pause);
    const loadSpy = vi.mocked(HTMLMediaElement.prototype.load);
    const player = createWebGL360Player(container, {
      sources: [fourKSource, mp4Source],
      defaultQuality: '1080p',
      sourcePreference: ['mp4', 'hls'],
      onReady,
      onQualityChange,
    });

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(player.getState().selectedSource?.quality).toBe('1080p');
    player.setMuted(false);

    const result = await player.setQuality('4k');

    expect(result).toMatchObject({ ok: true, quality: '4k' });
    expect(player.getState().selectedSource?.quality).toBe('4k');
    expect(player.getState().isMuted).toBe(false);
    expect((container.querySelector('video.webgl-360-player__video') as HTMLVideoElement | null)?.muted).toBe(false);
    expect(pauseSpy).toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalledTimes(4);
    expect(container.querySelectorAll('video.webgl-360-player__video')).toHaveLength(1);
    expect(rendererMocks.destroy).not.toHaveBeenCalled();
    expect(rendererMocks.start).toHaveBeenCalledOnce();
    expect(onQualityChange).toHaveBeenCalledWith(expect.objectContaining({ ok: true, quality: '4k' }), expect.any(Object));
  });

  it('stops and removes all plugin video elements on destroy', async () => {
    const container = createContainer();
    const onReady = vi.fn();
    const pauseSpy = vi.mocked(HTMLMediaElement.prototype.pause);
    const player = createWebGL360Player(container, {
      sources: [mp4Source],
      onReady,
    });

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(container.querySelectorAll('video.webgl-360-player__video')).toHaveLength(1);

    player.destroy();

    expect(pauseSpy).toHaveBeenCalled();
    expect(container.querySelectorAll('video.webgl-360-player__video')).toHaveLength(0);
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
