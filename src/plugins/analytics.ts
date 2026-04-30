import type {
  WebGL360Analytics,
  WebGL360PlayerState,
  WebGL360PluginCleanup,
  WebGL360PluginContext,
  WebGL360PluginObject,
} from '../types';

export interface AnalyticsPluginOptions {
  track: WebGL360Analytics['track'];
  eventPrefix?: string;
  includeDeviceMetadata?: boolean;
  viewDurationIntervalMs?: number;
  heatmap?: {
    enabled?: boolean;
    bucketSizeDegrees?: number;
    sampleIntervalMs?: number;
  };
  now?: () => number;
}

export interface AnalyticsPlugin extends WebGL360PluginObject {
  flush: () => void;
  getTotalViewDurationMs: () => number;
}

type AnalyticsStatePayload = Record<string, unknown> & {
  mode: WebGL360PlayerState['mode'];
  stage: WebGL360PlayerState['stage'];
  currentTime: number;
  duration: number;
  yaw: number;
  pitch: number;
  fov: number;
  isMuted: boolean;
  isMotionEnabled: boolean;
  selectedQuality?: string;
  selectedSourceType?: string;
};

export function createAnalyticsPlugin(options: AnalyticsPluginOptions): AnalyticsPlugin {
  const prefix = options.eventPrefix ?? 'webgl_360';
  const now = options.now ?? (() => Date.now());
  const includeDeviceMetadata = options.includeDeviceMetadata ?? true;
  const viewDurationIntervalMs = options.viewDurationIntervalMs ?? 10000;
  const heatmapEnabled = options.heatmap?.enabled ?? true;
  const heatmapBucketSize = options.heatmap?.bucketSizeDegrees ?? 15;
  const heatmapSampleIntervalMs = options.heatmap?.sampleIntervalMs ?? 1000;

  let context: WebGL360PluginContext | undefined;
  const cleanups: WebGL360PluginCleanup[] = [];
  let playStartedAt: number | undefined;
  let totalViewDurationMs = 0;
  let durationTimer: number | undefined;
  let lastHeatmapSampleAt = 0;

  const track = (event: string, payload?: Record<string, unknown>): void => {
    try {
      options.track(`${prefix}_${event}`, payload);
    } catch {
      // Analytics must never affect playback.
    }
  };

  const getStatePayload = (state: WebGL360PlayerState): AnalyticsStatePayload => ({
    mode: state.mode,
    stage: state.stage,
    currentTime: state.currentTime,
    duration: state.duration,
    yaw: state.yaw,
    pitch: state.pitch,
    fov: state.fov,
    isMuted: state.isMuted,
    isMotionEnabled: state.isMotionEnabled,
    selectedQuality: state.selectedSource?.quality,
    selectedSourceType: state.selectedSource?.type,
  });

  const getDevicePayload = (state: WebGL360PlayerState): Record<string, unknown> => {
    if (!includeDeviceMetadata || !state.deviceCapabilities) {
      return {};
    }

    const capabilities = state.deviceCapabilities;
    return {
      device: {
        supportedTypes: capabilities.supportedTypes,
        maxTextureSize: capabilities.maxTextureSize,
        maxVideoPixels: capabilities.maxVideoPixels,
        maxVideoWidth: capabilities.maxVideoWidth,
        maxVideoHeight: capabilities.maxVideoHeight,
        hevcSupported: capabilities.hevcSupported,
        h264Supported: capabilities.h264Supported,
        isIPhone: capabilities.isIPhone,
        isAndroid: capabilities.isAndroid,
        userAgent: capabilities.userAgent,
      },
    };
  };

  const flushDuration = (state = context?.getState()): void => {
    if (!state || playStartedAt === undefined) {
      return;
    }

    const endedAt = now();
    const deltaMs = Math.max(0, endedAt - playStartedAt);
    playStartedAt = endedAt;
    totalViewDurationMs += deltaMs;

    if (deltaMs > 0) {
      track('view_duration', {
        deltaMs,
        totalMs: totalViewDurationMs,
        ...getStatePayload(state),
      });
    }
  };

  const startDurationTimer = (): void => {
    if (viewDurationIntervalMs <= 0 || durationTimer !== undefined) {
      return;
    }

    durationTimer = globalThis.setInterval(() => {
      flushDuration();
    }, viewDurationIntervalMs) as unknown as number;
  };

  const stopDurationTimer = (): void => {
    if (durationTimer === undefined) {
      return;
    }
    globalThis.clearInterval(durationTimer);
    durationTimer = undefined;
  };

  return {
    id: 'analytics',
    install(pluginContext) {
      context = pluginContext;

      const addCleanup = (cleanup: WebGL360PluginCleanup): void => {
        cleanups.push(cleanup);
      };

      addCleanup(pluginContext.on('ready', (state) => {
        track('ready', {
          ...getStatePayload(state),
          availableQualities: state.availableQualities,
          attemptedSourceCount: state.attemptedSources.length,
          ...getDevicePayload(state),
        });
      }));

      addCleanup(pluginContext.on('play', (state) => {
        if (playStartedAt === undefined) {
          playStartedAt = now();
        }
        startDurationTimer();
        track('play', getStatePayload(state));
      }));

      addCleanup(pluginContext.on('pause', (state) => {
        flushDuration(state);
        playStartedAt = undefined;
        stopDurationTimer();
        track('pause', getStatePayload(state));
      }));

      addCleanup(pluginContext.on('ended', (state) => {
        flushDuration(state);
        playStartedAt = undefined;
        stopDurationTimer();
        track('ended', getStatePayload(state));
      }));

      addCleanup(pluginContext.on('seek', ({ currentTime, previousTime, duration, state }) => {
        track('seek', {
          ...getStatePayload(state),
          currentTime,
          previousTime,
          duration,
          delta: currentTime - previousTime,
        });
      }));

      addCleanup(pluginContext.on('qualitychange', ({ result, state }) => {
        track('quality_change', {
          ok: result.ok,
          requestedQuality: result.quality,
          selectedQuality: result.selectedSource?.quality,
          selectedSourceType: result.selectedSource?.type,
          reason: result.reason,
          ...getStatePayload(state),
        });

        if (!result.ok) {
          track('quality_fallback', {
            requestedQuality: result.quality,
            retainedQuality: state.selectedSource?.quality,
            reason: result.reason,
            ...getStatePayload(state),
          });
        }
      }));

      addCleanup(pluginContext.on('motionchange', ({ enabled, state }) => {
        track('motion_change', {
          enabled,
          ...getStatePayload(state),
        });
      }));

      addCleanup(pluginContext.on('fallback', (fallback) => {
        track('fallback', {
          reason: fallback.reason,
          selectedQuality: fallback.selectedSource?.quality,
          selectedSourceType: fallback.selectedSource?.type,
          attemptedSourceCount: fallback.attemptedSources.length,
        });
      }));

      addCleanup(pluginContext.on('diagnostic', ({ event, state }) => {
        if (event.type === 'source_error') {
          track('source_error', {
            message: event.message,
            reason: event.reason,
            error: event.error,
            selectedQuality: event.source?.quality,
            selectedSourceType: event.source?.type,
            ...getStatePayload(state),
          });
        }
      }));

      if (heatmapEnabled) {
        addCleanup(pluginContext.on('viewchange', ({ yaw, pitch, fov, state }) => {
          const sampleAt = now();
          if (sampleAt - lastHeatmapSampleAt < heatmapSampleIntervalMs) {
            return;
          }

          lastHeatmapSampleAt = sampleAt;
          track('heatmap_sample', {
            ...getStatePayload(state),
            yaw,
            pitch,
            fov,
            yawBucket: bucketAngle(yaw, heatmapBucketSize),
            pitchBucket: bucketAngle(pitch, heatmapBucketSize),
          });
        }));
      }

      return () => {
        flushDuration();
        stopDurationTimer();
        for (const cleanup of cleanups.splice(0).reverse()) {
          cleanup();
        }
        context = undefined;
        playStartedAt = undefined;
      };
    },
    flush() {
      flushDuration();
    },
    getTotalViewDurationMs() {
      return totalViewDurationMs;
    },
  };
}

function bucketAngle(value: number, bucketSize: number): number {
  const safeBucketSize = Number.isFinite(bucketSize) && bucketSize > 0 ? bucketSize : 15;
  return Math.round(value / safeBucketSize) * safeBucketSize;
}

export const analyticsPlugin = createAnalyticsPlugin;
