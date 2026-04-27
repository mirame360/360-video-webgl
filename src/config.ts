import type {
  NormalizedWebGL360PlayerOptions,
  WebGL360PlayerOptions,
  WebGL360SourceType,
} from './types';

const DEFAULT_SOURCE_PREFERENCE: WebGL360SourceType[] = ['hls', 'mp4'];

export function normalizePlayerOptions(options: WebGL360PlayerOptions): NormalizedWebGL360PlayerOptions {
  if (!options || !Array.isArray(options.sources) || options.sources.length === 0) {
    throw new Error('webgl-360-player requires at least one source.');
  }

  return {
    sources: options.sources,
    preSources: options.preSources,
    postSources: options.postSources,
    poster: options.poster,
    defaultQuality: options.defaultQuality,
    maxQuality: options.maxQuality,
    sourcePreference: normalizeSourcePreference(options.sourcePreference),
    initialYaw: options.initialYaw ?? 0,
    initialPitch: options.initialPitch ?? 0,
    initialFov: clamp(options.initialFov ?? 75, options.minFov ?? 35, options.maxFov ?? 100),
    minFov: options.minFov ?? 35,
    maxFov: options.maxFov ?? 100,
    controls: options.controls ?? true,
    motionControls: options.motionControls ?? true,
    fullscreen: options.fullscreen ?? true,
    autoplay: options.autoplay ?? false,
    muted: options.muted ?? true,
    loop: options.loop ?? false,
    playsInline: options.playsInline ?? true,
    crossOrigin: options.crossOrigin ?? 'anonymous',
    debug: options.debug ?? false,
    keyboardShortcuts: options.keyboardShortcuts ?? true,
    analytics: options.analytics,
    fallback: options.fallback,
    sourceLoader: options.sourceLoader,
    onReady: options.onReady,
    onError: options.onError,
    onFallback: options.onFallback,
    onClick: options.onClick,
    onPlay: options.onPlay,
    onPause: options.onPause,
    onTimeUpdate: options.onTimeUpdate,
    onEnded: options.onEnded,
  };
}

export function normalizeSourcePreference(preference?: WebGL360SourceType[]): WebGL360SourceType[] {
  const values = preference?.length ? preference : DEFAULT_SOURCE_PREFERENCE;
  const normalized = values.filter((value, index) => values.indexOf(value) === index);
  const allowed = normalized.filter((value) => value === 'hls' || value === 'mp4');

  for (const fallback of DEFAULT_SOURCE_PREFERENCE) {
    if (!allowed.includes(fallback)) {
      allowed.push(fallback);
    }
  }

  return allowed;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
