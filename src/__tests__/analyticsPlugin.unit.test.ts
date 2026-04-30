import { describe, expect, it, vi } from 'vitest';
import { analyticsPlugin, createAnalyticsPlugin } from '../plugins/analytics';
import type { WebGL360EventMap, WebGL360EventName, WebGL360PlayerState, WebGL360PluginContext } from '../types';

type HandlerMap = {
  [Name in WebGL360EventName]?: Array<(payload: WebGL360EventMap[Name]) => void>;
};

describe('createAnalyticsPlugin', () => {
  it('tracks playback, duration, seek, quality, motion, fallback, diagnostics, and heatmap samples', () => {
    let currentNow = 1000;
    const track = vi.fn();
    const handlers: HandlerMap = {};
    const state = createState();
    const context = {
      getState: () => state,
      on: <Name extends WebGL360EventName>(
        event: Name,
        handler: (payload: WebGL360EventMap[Name]) => void,
      ) => {
        const eventHandlers = getHandlers(handlers, event);
        eventHandlers.push(handler);
        setHandlers(handlers, event, eventHandlers);
        return () => {
          const nextHandlers = getHandlers(handlers, event).filter((candidate) => candidate !== handler);
          setHandlers(handlers, event, nextHandlers);
        };
      },
      registerCleanup: vi.fn(),
    } as unknown as WebGL360PluginContext;
    const plugin = createAnalyticsPlugin({
      track,
      now: () => currentNow,
      viewDurationIntervalMs: 0,
      heatmap: {
        sampleIntervalMs: 1000,
        bucketSizeDegrees: 10,
      },
    });

    const cleanup = plugin.install(context);

    emit(handlers, 'ready', state);
    emit(handlers, 'play', state);
    currentNow = 2500;
    emit(handlers, 'pause', state);
    emit(handlers, 'seek', {
      currentTime: 42,
      previousTime: 12,
      duration: 100,
      state,
    });
    emit(handlers, 'qualitychange', {
      result: {
        ok: false,
        quality: '8k',
        selectedSource: state.selectedSource,
        reason: 'quality is not supported on this device',
      },
      state,
    });
    emit(handlers, 'motionchange', { enabled: true, state });
    emit(handlers, 'fallback', {
      reason: 'context_lost',
      container: document.createElement('div'),
      attemptedSources: [state.selectedSource!],
      selectedSource: state.selectedSource,
    });
    emit(handlers, 'diagnostic', {
      event: {
        type: 'source_error',
        message: 'Source failed',
        at: currentNow,
        source: state.selectedSource,
        error: 'decode failed',
      },
      state,
    });

    currentNow = 3500;
    emit(handlers, 'viewchange', {
      yaw: 44,
      pitch: -13,
      fov: 75,
      state,
    });

    expect(track).toHaveBeenCalledWith('webgl_360_ready', expect.objectContaining({
      selectedQuality: '1080p',
      selectedSourceType: 'mp4',
      device: expect.objectContaining({
        isIPhone: false,
        isAndroid: false,
      }),
    }));
    expect(track).toHaveBeenCalledWith('webgl_360_play', expect.objectContaining({
      selectedQuality: '1080p',
    }));
    expect(track).toHaveBeenCalledWith('webgl_360_view_duration', expect.objectContaining({
      deltaMs: 1500,
      totalMs: 1500,
    }));
    expect(plugin.getTotalViewDurationMs()).toBe(1500);
    expect(track).toHaveBeenCalledWith('webgl_360_seek', expect.objectContaining({
      currentTime: 42,
      previousTime: 12,
      delta: 30,
    }));
    expect(track).toHaveBeenCalledWith('webgl_360_quality_change', expect.objectContaining({
      ok: false,
      requestedQuality: '8k',
      reason: 'quality is not supported on this device',
    }));
    expect(track).toHaveBeenCalledWith('webgl_360_quality_fallback', expect.objectContaining({
      requestedQuality: '8k',
      retainedQuality: '1080p',
    }));
    expect(track).toHaveBeenCalledWith('webgl_360_motion_change', expect.objectContaining({
      enabled: true,
    }));
    expect(track).toHaveBeenCalledWith('webgl_360_fallback', expect.objectContaining({
      reason: 'context_lost',
      attemptedSourceCount: 1,
    }));
    expect(track).toHaveBeenCalledWith('webgl_360_source_error', expect.objectContaining({
      message: 'Source failed',
      error: 'decode failed',
    }));
    expect(track).toHaveBeenCalledWith('webgl_360_heatmap_sample', expect.objectContaining({
      yaw: 44,
      pitch: -13,
      yawBucket: 40,
      pitchBucket: -10,
    }));

    if (typeof cleanup === 'function') {
      cleanup();
    }
  });

  it('isolates analytics transport errors and detaches listeners on cleanup', () => {
    const handlers: HandlerMap = {};
    const state = createState();
    const context = {
      getState: () => state,
      on: <Name extends WebGL360EventName>(
        event: Name,
        handler: (payload: WebGL360EventMap[Name]) => void,
      ) => {
        const eventHandlers = getHandlers(handlers, event);
        eventHandlers.push(handler);
        setHandlers(handlers, event, eventHandlers);
        return () => {
          const nextHandlers = getHandlers(handlers, event).filter((candidate) => candidate !== handler);
          setHandlers(handlers, event, nextHandlers);
        };
      },
      registerCleanup: vi.fn(),
    } as unknown as WebGL360PluginContext;
    const plugin = createAnalyticsPlugin({
      track: () => {
        throw new Error('transport failed');
      },
      viewDurationIntervalMs: 0,
    });

    const cleanup = plugin.install(context);

    expect(() => emit(handlers, 'play', state)).not.toThrow();
    expect(handlers.play).toHaveLength(1);

    if (typeof cleanup === 'function') {
      cleanup();
    }

    expect(handlers.play).toHaveLength(0);
  });

  it('supports a custom event prefix and disabled heatmap sampling', () => {
    const track = vi.fn();
    const handlers: HandlerMap = {};
    const state = createState();
    const context = {
      getState: () => state,
      on: <Name extends WebGL360EventName>(
        event: Name,
        handler: (payload: WebGL360EventMap[Name]) => void,
      ) => {
        const eventHandlers = getHandlers(handlers, event);
        eventHandlers.push(handler);
        setHandlers(handlers, event, eventHandlers);
        return () => {
          const nextHandlers = getHandlers(handlers, event).filter((candidate) => candidate !== handler);
          setHandlers(handlers, event, nextHandlers);
        };
      },
      registerCleanup: vi.fn(),
    } as unknown as WebGL360PluginContext;
    const plugin = analyticsPlugin({
      track,
      eventPrefix: 'custom_player',
      includeDeviceMetadata: false,
      heatmap: {
        enabled: false,
      },
      viewDurationIntervalMs: 0,
    });

    const cleanup = plugin.install(context);

    emit(handlers, 'ready', state);
    emit(handlers, 'viewchange', {
      yaw: 20,
      pitch: 10,
      fov: 75,
      state,
    });

    expect(track).toHaveBeenCalledWith('custom_player_ready', expect.not.objectContaining({
      device: expect.anything(),
    }));
    expect(track).not.toHaveBeenCalledWith('custom_player_heatmap_sample', expect.anything());

    if (typeof cleanup === 'function') {
      cleanup();
    }
  });
});

function emit<Name extends WebGL360EventName>(
  handlers: HandlerMap,
  event: Name,
  payload: WebGL360EventMap[Name],
): void {
  for (const handler of getHandlers(handlers, event)) {
    handler(payload);
  }
}

function getHandlers<Name extends WebGL360EventName>(
  handlers: HandlerMap,
  event: Name,
): Array<(payload: WebGL360EventMap[Name]) => void> {
  return (handlers[event] ?? []) as Array<(payload: WebGL360EventMap[Name]) => void>;
}

function setHandlers<Name extends WebGL360EventName>(
  handlers: HandlerMap,
  event: Name,
  eventHandlers: Array<(payload: WebGL360EventMap[Name]) => void>,
): void {
  handlers[event] = eventHandlers as HandlerMap[Name];
}

function createState(): WebGL360PlayerState {
  return {
    mode: 'ready',
    stage: 'main',
    yaw: 0,
    pitch: 0,
    fov: 75,
    currentTime: 0,
    duration: 100,
    fps: 60,
    bitrate: 5000000,
    isMotionEnabled: false,
    isMuted: false,
    isPaused: false,
    isLooping: false,
    isDebug: false,
    isStereoEnabled: false,
    availableQualities: ['1080p'],
    selectedSource: {
      src: '/video.mp4',
      type: 'mp4',
      quality: '1080p',
      width: 1920,
      height: 960,
      bitrate: 5000000,
    },
    sourceSupport: [],
    attemptedSources: [],
    diagnostics: {
      contextLostCount: 0,
      decodedFrames: 100,
      droppedFrames: 1,
      droppedFrameRatio: 0.01,
      events: [],
    },
    deviceCapabilities: {
      supportedTypes: ['mp4'],
      maxTextureSize: 4096,
      maxVideoPixels: 2073600,
      maxVideoWidth: 1920,
      maxVideoHeight: 1080,
      hevcSupported: false,
      h264Supported: true,
      isIPhone: false,
      isAndroid: false,
      userAgent: 'vitest',
    },
  };
}
