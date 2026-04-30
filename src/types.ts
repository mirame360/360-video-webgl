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

export interface WebGL360DeviceCapabilities {
  supportedTypes: WebGL360SourceType[];
  maxTextureSize: number;
  maxVideoPixels: number;
  maxVideoWidth: number;
  maxVideoHeight: number;
  hevcSupported: boolean;
  h264Supported: boolean;
  isIPhone: boolean;
  isAndroid: boolean;
  userAgent: string;
}

export interface WebGL360ColorFilters {
  exposure?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  temperature?: number;
  tint?: number;
  vignette?: number;
}

export interface WebGL360StereoMode {
  enabled: boolean;
  eyeYawOffset?: number;
}

export interface WebGL360SourceSupport {
  source: WebGL360Source;
  supported: boolean;
  reason?: string;
}

export interface WebGL360QualitySwitchResult {
  ok: boolean;
  quality: WebGL360Quality;
  selectedSource?: WebGL360Source;
  reason?: string;
  error?: unknown;
}

export type WebGL360DiagnosticEventType =
  | 'source_error'
  | 'decode_error'
  | 'context_lost'
  | 'quality_change'
  | 'plugin_error'
  | 'fallback';

export interface WebGL360DiagnosticEvent {
  type: WebGL360DiagnosticEventType;
  message: string;
  at: number;
  source?: WebGL360Source;
  reason?: string;
  error?: string;
}

export interface WebGL360Diagnostics {
  selectedSource?: WebGL360Source;
  lastSourceError?: WebGL360DiagnosticEvent;
  lastDecodeError?: WebGL360DiagnosticEvent;
  lastFallbackReason?: string;
  contextLostCount: number;
  decodedFrames: number;
  droppedFrames: number;
  droppedFrameRatio: number;
  events: WebGL360DiagnosticEvent[];
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

export interface WebGL360EventMap {
  ready: WebGL360PlayerState;
  play: WebGL360PlayerState;
  pause: WebGL360PlayerState;
  ended: WebGL360PlayerState;
  timeupdate: { currentTime: number; duration: number; state: WebGL360PlayerState };
  seek: { currentTime: number; previousTime: number; duration: number; state: WebGL360PlayerState };
  sourcechange: { source: WebGL360Source; previousSource?: WebGL360Source; state: WebGL360PlayerState };
  qualitychange: { result: WebGL360QualitySwitchResult; state: WebGL360PlayerState };
  error: { error: unknown; state: WebGL360PlayerState };
  fallback: WebGL360FallbackContext;
  diagnostic: { event: WebGL360DiagnosticEvent; state: WebGL360PlayerState };
  contextlost: { source?: WebGL360Source; state: WebGL360PlayerState };
  motionchange: { enabled: boolean; state: WebGL360PlayerState };
  viewchange: { yaw: number; pitch: number; fov: number; state: WebGL360PlayerState };
  destroy: WebGL360PlayerState;
}

export type WebGL360EventName = keyof WebGL360EventMap;

export type WebGL360EventHandler<Name extends WebGL360EventName = WebGL360EventName> = (
  payload: WebGL360EventMap[Name],
) => void;

export interface WebGL360PluginContext {
  player: WebGL360Player;
  container: HTMLElement;
  getVideo: () => HTMLVideoElement | undefined;
  getState: () => WebGL360PlayerState;
  on: WebGL360Player['on'];
  off: WebGL360Player['off'];
  emitDiagnostic: (event: Omit<WebGL360DiagnosticEvent, 'at'>) => void;
  registerCleanup: (cleanup: WebGL360PluginCleanup) => void;
  mountControl: (element: HTMLElement) => WebGL360PluginCleanup;
  setColorFilters: (filters: WebGL360ColorFilters) => void;
  getColorFilters: () => Required<WebGL360ColorFilters>;
  setStereoMode: (mode: WebGL360StereoMode) => void;
  getStereoMode: () => Required<WebGL360StereoMode>;
}

export type WebGL360PluginCleanup = () => void | Promise<void>;

export type WebGL360PluginInstall = (
  context: WebGL360PluginContext,
) => void | WebGL360PluginCleanup | Promise<void | WebGL360PluginCleanup>;

export interface WebGL360PluginObject {
  id: string;
  install: WebGL360PluginInstall;
}

export type WebGL360Plugin = WebGL360PluginInstall | WebGL360PluginObject;

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
  /** Automatically hide UI controls after inactivity */
  uiAutoHide?: boolean;
  /** Enable default keyboard shortcuts (Space: play/pause, m: mute, etc.) */
  keyboardShortcuts?: boolean;
  analytics?: WebGL360Analytics;
  fallback?: WebGL360Fallback;
  sourceLoader?: WebGL360SourceLoader;
  plugins?: WebGL360Plugin[];
  requiredPlugins?: string[];
  onReady?: (state: WebGL360PlayerState) => void;
  onError?: (error: unknown, state: WebGL360PlayerState) => void;
  onFallback?: (context: WebGL360FallbackContext) => void;
  /** Triggered when the user clicks/taps the video area */
  onClick?: (event: PointerEvent) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onQualityChange?: (result: WebGL360QualitySwitchResult, state: WebGL360PlayerState) => void;
  onDiagnostic?: (event: WebGL360DiagnosticEvent, state: WebGL360PlayerState) => void;
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
    | 'uiAutoHide'
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
  plugins: WebGL360Plugin[];
  requiredPlugins: string[];
  onReady?: (state: WebGL360PlayerState) => void;
  onError?: (error: unknown, state: WebGL360PlayerState) => void;
  onFallback?: (context: WebGL360FallbackContext) => void;
  onClick?: (event: PointerEvent) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onQualityChange?: (result: WebGL360QualitySwitchResult, state: WebGL360PlayerState) => void;
  onDiagnostic?: (event: WebGL360DiagnosticEvent, state: WebGL360PlayerState) => void;
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
  isStereoEnabled: boolean;
  availableQualities: WebGL360Quality[];
  deviceCapabilities?: WebGL360DeviceCapabilities;
  selectedSource?: WebGL360Source;
  sourceSupport: WebGL360SourceSupport[];
  attemptedSources: WebGL360Source[];
  diagnostics: WebGL360Diagnostics;
  error?: unknown;
}

export interface WebGL360Player {
  destroy: () => void;
  on: <Name extends WebGL360EventName>(
    event: Name,
    handler: (payload: WebGL360EventMap[Name]) => void,
  ) => () => void;
  off: <Name extends WebGL360EventName>(
    event: Name,
    handler: (payload: WebGL360EventMap[Name]) => void,
  ) => void;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  togglePlay: () => Promise<void>;
  seek: (time: number) => void;
  setYaw: (yaw: number) => void;
  setPitch: (pitch: number) => void;
  setFov: (fov: number) => void;
  setMuted: (muted: boolean) => void;
  setDebug: (enabled: boolean) => void;
  setMotionEnabled: (enabled: boolean) => Promise<boolean>;
  setQuality: (quality: WebGL360Quality) => Promise<WebGL360QualitySwitchResult>;
  getState: () => WebGL360PlayerState;
}

export interface SourceSelectionOptions {
  defaultQuality?: WebGL360Quality;
  maxQuality?: WebGL360Quality;
  sourcePreference: WebGL360SourceType[];
  supportedTypes?: WebGL360SourceType[];
  capabilities?: WebGL360DeviceCapabilities;
}

export interface SourceSelectionResult {
  selectedSource?: WebGL360Source;
  candidates: WebGL360Source[];
}
