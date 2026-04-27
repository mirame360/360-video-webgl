export type WebGL360SourceType = 'hls' | 'mp4';

export type WebGL360Quality = string;

export interface WebGL360Source {
  src: string;
  type: WebGL360SourceType;
  quality: WebGL360Quality;
  width?: number;
  height?: number;
  bitrate?: number;
  mimeType?: string;
  label?: string;
}

export interface WebGL360Analytics {
  track: (event: string, payload?: Record<string, unknown>) => void;
}

export interface WebGL360FallbackContext {
  reason: string;
  error?: unknown;
  container: HTMLElement;
  attemptedSources: WebGL360Source[];
  selectedSource?: WebGL360Source;
}

export type WebGL360Fallback = (context: WebGL360FallbackContext) => void | Promise<void>;

export type WebGL360SourceLoaderCleanup = () => void | Promise<void>;

export type WebGL360SourceLoaderResult =
  | void
  | WebGL360SourceLoaderCleanup
  | {
      cleanup?: WebGL360SourceLoaderCleanup;
    };

export interface WebGL360SourceLoaderContext {
  video: HTMLVideoElement;
  source: WebGL360Source;
  defaultLoad: () => Promise<void>;
  waitForReady: () => Promise<void>;
}

export type WebGL360SourceLoader = (
  context: WebGL360SourceLoaderContext,
) => WebGL360SourceLoaderResult | Promise<WebGL360SourceLoaderResult>;

export interface WebGL360PlayerOptions {
  sources: WebGL360Source[];
  /** Sources to play before the main video (e.g., intro) */
  preSources?: WebGL360Source[];
  /** Sources to play after the main video (e.g., outro) */
  postSources?: WebGL360Source[];
  poster?: string;
  defaultQuality?: WebGL360Quality;
  maxQuality?: WebGL360Quality;
  sourcePreference?: WebGL360SourceType[];
  initialYaw?: number;
  initialPitch?: number;
  initialFov?: number;
  minFov?: number;
  maxFov?: number;
  controls?: boolean;
  motionControls?: boolean;
  fullscreen?: boolean;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  playsInline?: boolean;
  crossOrigin?: '' | 'anonymous' | 'use-credentials';
  debug?: boolean;
  /** Enable default keyboard shortcuts (Space: play/pause, m: mute, etc.) */
  keyboardShortcuts?: boolean;
  analytics?: WebGL360Analytics;
  fallback?: WebGL360Fallback;
  sourceLoader?: WebGL360SourceLoader;
  onReady?: (state: WebGL360PlayerState) => void;
  onError?: (error: unknown, state: WebGL360PlayerState) => void;
  onFallback?: (context: WebGL360FallbackContext) => void;
  /** Triggered when the user clicks/taps the video area */
  onClick?: (event: PointerEvent) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
}

export interface NormalizedWebGL360PlayerOptions extends Required<
  Pick<
    WebGL360PlayerOptions,
    | 'sources'
    | 'sourcePreference'
    | 'initialYaw'
    | 'initialPitch'
    | 'initialFov'
    | 'minFov'
    | 'maxFov'
    | 'controls'
    | 'motionControls'
    | 'fullscreen'
    | 'autoplay'
    | 'muted'
    | 'loop'
    | 'playsInline'
    | 'crossOrigin'
    | 'debug'
    | 'keyboardShortcuts'
  >
> {
  preSources?: WebGL360Source[];
  postSources?: WebGL360Source[];
  poster?: string;
  defaultQuality?: WebGL360Quality;
  maxQuality?: WebGL360Quality;
  analytics?: WebGL360Analytics;
  fallback?: WebGL360Fallback;
  sourceLoader?: WebGL360SourceLoader;
  onReady?: (state: WebGL360PlayerState) => void;
  onError?: (error: unknown, state: WebGL360PlayerState) => void;
  onFallback?: (context: WebGL360FallbackContext) => void;
  onClick?: (event: PointerEvent) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
}

export type WebGL360PlayerMode = 'idle' | 'loading' | 'ready' | 'fallback' | 'error' | 'destroyed';
export type WebGL360SequenceStage = 'pre' | 'main' | 'post';

export interface WebGL360PlayerState {
  mode: WebGL360PlayerMode;
  stage: WebGL360SequenceStage;
  yaw: number;
  pitch: number;
  fov: number;
  currentTime: number;
  duration: number;
  fps: number;
  bitrate: number;
  isMotionEnabled: boolean;
  isMuted: boolean;
  isPaused: boolean;
  isLooping: boolean;
  isDebug: boolean;
  selectedSource?: WebGL360Source;
  attemptedSources: WebGL360Source[];
  error?: unknown;
}

export interface WebGL360Player {
  destroy: () => void;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setYaw: (yaw: number) => void;
  setPitch: (pitch: number) => void;
  setFov: (fov: number) => void;
  setMuted: (muted: boolean) => void;
  setDebug: (enabled: boolean) => void;
  setMotionEnabled: (enabled: boolean) => Promise<boolean>;
  getState: () => WebGL360PlayerState;
}

export interface SourceSelectionOptions {
  defaultQuality?: WebGL360Quality;
  maxQuality?: WebGL360Quality;
  sourcePreference: WebGL360SourceType[];
  supportedTypes?: WebGL360SourceType[];
}

export interface SourceSelectionResult {
  selectedSource?: WebGL360Source;
  candidates: WebGL360Source[];
}
