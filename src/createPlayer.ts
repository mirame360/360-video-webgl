import { track } from './analytics';
import { DEFAULT_COLOR_FILTERS, normalizeColorFilters } from './colorFilters';
import {
  detectDeviceCapabilities,
  getIPhoneQualityCeiling,
  getSourceSupportList,
  getSupportedSources,
  getSupportedSourceTypes,
} from './capabilities';
import { clamp, normalizePlayerOptions } from './config';
import { SceneRenderer } from './renderer/SceneRenderer';
import { createPointerControls, type ControlsHandle } from './renderer/controls';
import { disposeElement } from './renderer/dispose';
import { createErrorState, type ErrorStateHandle } from './ui/errorState';
import { createLoader, type LoaderHandle } from './ui/loader';
import { selectInitialSource } from './sourceSelection';
import type {
  NormalizedWebGL360PlayerOptions,
  WebGL360DiagnosticEvent,
  WebGL360ColorFilters,
  WebGL360CaptureFrameOptions,
  WebGL360EventMap,
  WebGL360ExportedConfig,
  WebGL360FallbackContext,
  WebGL360Player,
  WebGL360PlayerOptions,
  WebGL360PlayerState,
  WebGL360Plugin,
  WebGL360PluginCleanup,
  WebGL360Quality,
  WebGL360QualitySwitchResult,
  WebGL360ScreenPoint,
  WebGL360SequenceStage,
  WebGL360Source,
  WebGL360SourceLoader,
  WebGL360SourceLoaderCleanup,
  WebGL360SourceLoaderResult,
  WebGL360SourceType,
  WebGL360StereoMode,
  WebGL360View,
} from './types';

interface PermissionedDeviceOrientationEventConstructor {
  requestPermission?: () => Promise<PermissionState>;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

type EventListenerMap = {
  [Name in keyof WebGL360EventMap]?: Set<(payload: unknown) => void>;
};

export function createWebGL360Player(container: HTMLElement, options: WebGL360PlayerOptions): WebGL360Player {
  if (!container) {
    throw new Error('webgl-360-player requires a container element.');
  }

  const config = normalizePlayerOptions(options);
  
  // Enforce hardware-safe ceiling on iPhone if not explicitly stricter
  const ceiling = getIPhoneQualityCeiling();
  if (ceiling && !config.maxQuality) {
    config.maxQuality = ceiling;
  }

  const controller = new WebGL360PlayerController(container, config);
  controller.start();
  return controller.getPublicApi();
}

class WebGL360PlayerController {
  private readonly state: WebGL360PlayerState;
  private readonly loader: LoaderHandle;
  private errorState?: ErrorStateHandle;
  private debugOverlay?: DebugOverlayHandle;
  private video?: HTMLVideoElement;
  private renderer?: SceneRenderer;
  private controls?: ControlsHandle;
  private sourceLoaderCleanup?: WebGL360SourceLoaderCleanup;
  private readonly sourceLoaders = new Map<WebGL360SourceType, WebGL360SourceLoader>();
  private readonly videoElements = new Set<HTMLVideoElement>();
  private readonly listeners: EventListenerMap = {};
  private readonly renderFrameListeners = new Set<(delta: number) => void>();
  private readonly pluginCleanups: WebGL360PluginCleanup[] = [];
  private readonly installedPluginIds = new Set<string>();
  private readonly publicApi: WebGL360Player;
  private colorFilters = { ...DEFAULT_COLOR_FILTERS };
  private stereoMode: Required<WebGL360StereoMode> = {
    enabled: false,
    eyeYawOffset: 1.5,
  };
  private pluginControlsRoot?: HTMLDivElement;
  private overlayRoot?: HTMLDivElement;
  private destroyed = false;
  private lastFrameTime = 0;
  private frameCount = 0;
  private debugInterval?: number;

  constructor(
    private readonly container: HTMLElement,
    private readonly config: NormalizedWebGL360PlayerOptions,
  ) {
    this.state = {
      mode: 'idle',
      stage: 'main',
      yaw: config.initialYaw,
      pitch: config.initialPitch,
      fov: config.initialFov,
      currentTime: 0,
      duration: 0,
      fps: 0,
      bitrate: 0,
      isMotionEnabled: false,
      isMuted: config.muted,
      isPaused: true,
      isLooping: config.loop,
      isDebug: config.debug,
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
    };
    this.publicApi = this.createPublicApi();
    this.loader = createLoader(container);
    this.container.dataset.webgl360Mode = 'initializing';

    if (config.debug) {
      this.enableDebugInternal();
    }

    if (config.keyboardShortcuts) {
      this.setupKeyboardShortcuts();
    }
  }

  getPublicApi(): WebGL360Player {
    return this.publicApi;
  }

  private createPublicApi(): WebGL360Player {
    return {
      destroy: () => this.destroy(),
      on: (event, handler) => this.on(event, handler),
      off: (event, handler) => this.off(event, handler),
      play: () => this.play(),
      pause: () => this.pause(),
      stop: () => this.stop(),
      togglePlay: () => this.togglePlay(),
      seek: (time) => this.seek(time),
      setYaw: (yaw) => this.setYaw(yaw),
      setPitch: (pitch) => this.setPitch(pitch),
      setFov: (fov) => this.setFov(fov),
      setView: (view) => this.setView(view),
      getView: () => this.getView(),
      setMuted: (muted) => this.setMuted(muted),
      setDebug: (enabled) => this.setDebug(enabled),
      setMotionEnabled: (enabled) => this.setMotionEnabled(enabled),
      setQuality: (quality) => this.setQuality(quality),
      exportConfig: () => this.exportConfig(),
      importConfig: (config) => this.importConfig(config),
      requestFullscreen: () => this.requestFullscreen(),
      exitFullscreen: () => this.exitFullscreen(),
      captureFrame: (options) => this.captureFrame(options),
      getState: () => this.getState(),
    };
  }

  start(): void {
    void this.initialize();
  }

  private on<Name extends keyof WebGL360EventMap>(
    event: Name,
    handler: (payload: WebGL360EventMap[Name]) => void,
  ): () => void {
    const listeners = (this.listeners[event] ??= new Set());
    listeners.add(handler as (payload: unknown) => void);
    return () => this.off(event, handler);
  }

  private off<Name extends keyof WebGL360EventMap>(
    event: Name,
    handler: (payload: WebGL360EventMap[Name]) => void,
  ): void {
    this.listeners[event]?.delete(handler as (payload: unknown) => void);
  }

  private emit<Name extends keyof WebGL360EventMap>(event: Name, payload: WebGL360EventMap[Name]): void {
    const listeners = this.listeners[event];
    if (!listeners) {
      return;
    }

    for (const listener of Array.from(listeners)) {
      try {
        listener(payload);
      } catch (error) {
        if (event !== 'diagnostic') {
          this.recordDiagnostic({
            type: 'plugin_error',
            message: `Event listener for "${event}" failed`,
            error: getErrorMessage(error),
          });
        } else if (this.config.debug) {
          console.warn('WebGL360Player: diagnostic listener failed:', error);
        }
      }
    }
  }

  private async installPlugins(): Promise<void> {
    for (const plugin of this.config.plugins) {
      await this.installPlugin(plugin);
    }

    const missingRequired = this.config.requiredPlugins.filter((pluginId) => !this.installedPluginIds.has(pluginId));
    if (missingRequired.length > 0) {
      throw new Error(`Required plugin(s) were not installed: ${missingRequired.join(', ')}`);
    }
  }

  private async installPlugin(plugin: WebGL360Plugin): Promise<void> {
    const pluginId = getPluginId(plugin);
    const install = typeof plugin === 'function' ? plugin : plugin.install;
    const required = pluginId ? this.config.requiredPlugins.includes(pluginId) : false;

    try {
      const cleanup = await install({
        player: this.publicApi,
        container: this.container,
        getVideo: () => this.video,
        getState: () => this.getState(),
        on: this.publicApi.on,
        off: this.publicApi.off,
        emitDiagnostic: (event) => this.recordDiagnostic(event),
        registerCleanup: (cleanupFn) => this.registerPluginCleanup(cleanupFn),
        mountControl: (element) => this.mountPluginControl(element),
        registerSourceLoader: (type, loader) => this.registerSourceLoader(type, loader),
        setColorFilters: (filters) => this.setColorFilters(filters),
        getColorFilters: () => this.getColorFilters(),
        setStereoMode: (mode) => this.setStereoMode(mode),
        getStereoMode: () => this.getStereoMode(),
        projectYawPitchToScreen: (yaw, pitch) => this.projectYawPitchToScreen(yaw, pitch),
        onRenderFrame: (callback) => this.onRenderFrame(callback),
        getOverlayRoot: () => this.getOverlayRoot(),
        getRenderer: () => this.renderer?.threeRenderer,
        renderer: this.renderer?.threeRenderer,
      });

      if (cleanup) {
        this.registerPluginCleanup(cleanup);
      }
      if (pluginId) {
        this.installedPluginIds.add(pluginId);
      }
    } catch (error) {
      this.recordDiagnostic({
        type: 'plugin_error',
        message: pluginId ? `Plugin "${pluginId}" failed to install` : 'Plugin failed to install',
        reason: required ? 'required_plugin_failed' : 'optional_plugin_failed',
        error: getErrorMessage(error),
      });

      if (required) {
        throw error;
      }
    }
  }

  private registerPluginCleanup(cleanup: WebGL360PluginCleanup): void {
    this.pluginCleanups.push(cleanup);
  }

  private registerSourceLoader(type: WebGL360SourceType, loader: WebGL360SourceLoader): WebGL360PluginCleanup {
    this.sourceLoaders.set(type, loader);
    return () => {
      if (this.sourceLoaders.get(type) === loader) {
        this.sourceLoaders.delete(type);
      }
    };
  }

  private setColorFilters(filters: WebGL360ColorFilters): void {
    this.colorFilters = normalizeColorFilters(filters);
    this.renderer?.setColorFilters(this.colorFilters);
  }

  private getColorFilters(): Required<WebGL360ColorFilters> {
    return { ...this.colorFilters };
  }

  private setStereoMode(mode: WebGL360StereoMode): void {
    this.stereoMode = {
      enabled: mode.enabled,
      eyeYawOffset: clamp(mode.eyeYawOffset ?? this.stereoMode.eyeYawOffset, 0, 10),
    };
    this.state.isStereoEnabled = this.stereoMode.enabled;
    this.container.dataset.webgl360Stereo = this.stereoMode.enabled ? 'true' : 'false';
    this.renderer?.setStereoMode(this.stereoMode);
  }

  private getStereoMode(): Required<WebGL360StereoMode> {
    return { ...this.stereoMode };
  }

  private projectYawPitchToScreen(yaw: number, pitch: number): WebGL360ScreenPoint | null {
    return this.renderer?.projectYawPitchToScreen(yaw, pitch) ?? null;
  }

  private onRenderFrame(callback: (delta: number) => void): WebGL360PluginCleanup {
    this.renderFrameListeners.add(callback);
    return () => {
      this.renderFrameListeners.delete(callback);
    };
  }

  private emitRenderFrame(delta: number): void {
    for (const listener of Array.from(this.renderFrameListeners)) {
      try {
        listener(delta);
      } catch (error) {
        this.recordDiagnostic({
          type: 'plugin_error',
          message: 'Render frame listener failed',
          error: getErrorMessage(error),
        });
      }
    }
  }

  private getOverlayRoot(): HTMLElement {
    if (this.overlayRoot) {
      return this.overlayRoot;
    }

    const root = document.createElement('div');
    root.className = 'webgl-360-overlay-root';
    root.style.position = 'absolute';
    root.style.inset = '0';
    root.style.zIndex = '90';
    root.style.pointerEvents = 'none';
    root.style.overflow = 'hidden';

    this.container.appendChild(root);
    this.overlayRoot = root;
    return root;
  }

  private mountPluginControl(element: HTMLElement): WebGL360PluginCleanup {
    const root = this.getPluginControlsRoot();
    root.appendChild(element);

    return () => {
      element.remove();
      if (this.pluginControlsRoot && this.pluginControlsRoot.childElementCount === 0) {
        this.pluginControlsRoot.remove();
        this.pluginControlsRoot = undefined;
      }
    };
  }

  private getPluginControlsRoot(): HTMLDivElement {
    if (this.pluginControlsRoot) {
      return this.pluginControlsRoot;
    }

    const root = document.createElement('div');
    root.className = 'webgl-360-plugin-controls';
    root.style.position = 'absolute';
    root.style.top = '16px';
    root.style.left = '50%';
    root.style.transform = 'translateX(-50%)';
    root.style.zIndex = '140';
    root.style.display = 'flex';
    root.style.alignItems = 'center';
    root.style.justifyContent = 'center';
    root.style.gap = '8px';
    root.style.pointerEvents = 'auto';
    root.style.maxWidth = 'calc(100% - 32px)';

    this.container.appendChild(root);
    this.pluginControlsRoot = root;
    return root;
  }

  private async cleanupPlugins(): Promise<void> {
    const cleanups = this.pluginCleanups.splice(0).reverse();
    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (error) {
        this.recordDiagnostic({
          type: 'plugin_error',
          message: 'Plugin cleanup failed',
          error: getErrorMessage(error),
        });
      }
    }
    this.installedPluginIds.clear();
  }

  async play(): Promise<void> {
    if (!this.video) {
      return;
    }

    try {
      await this.video.play();
      this.state.isPaused = false;
    } catch (error) {
      this.state.isPaused = this.video.paused;
      if (this.config.debug) console.warn('WebGL360Player: play() was prevented or failed:', error);
      throw error;
    }
  }

  pause(): void {
    if (this.video) {
      this.video.pause();
      this.state.isPaused = true;
    }
  }

  async togglePlay(): Promise<void> {
    if (!this.video) return;
    if (this.video.paused) {
      return this.play();
    } else {
      this.pause();
    }
  }

  stop(): void {
    if (this.video) {
      this.video.pause();
      this.video.currentTime = 0;
      this.state.isPaused = true;
    }
  }

  seek(time: number): void {
    if (this.video) {
      const previousTime = this.video.currentTime;
      this.video.currentTime = time;
      // Force a state sync
      this.state.currentTime = time;
      this.emit('seek', {
        currentTime: time,
        previousTime,
        duration: this.video.duration,
        state: this.getState(),
      });
    }
  }

  setMuted(muted: boolean): void {
    this.state.isMuted = muted;
    if (this.video) {
      this.video.muted = muted;
    }
  }

  setDebug(enabled: boolean): void {
    if (this.state.isDebug === enabled) return;
    this.state.isDebug = enabled;
    if (enabled) {
      this.enableDebugInternal();
    } else {
      this.disableDebugInternal();
    }
  }

  private enableDebugInternal(): void {
    if (!this.debugOverlay) {
      this.debugOverlay = createDebugOverlay(this.container);
    }
    if (!this.debugInterval) {
      this.debugInterval = globalThis.setInterval(() => this.updateDebug(), 500) as unknown as number;
    }
  }

  private disableDebugInternal(): void {
    if (this.debugOverlay) {
      this.debugOverlay.destroy();
      this.debugOverlay = undefined;
    }
    if (this.debugInterval) {
      globalThis.clearInterval(this.debugInterval);
      this.debugInterval = undefined;
    }
  }

  async setMotionEnabled(enabled: boolean): Promise<boolean> {
    if (!this.config.motionControls) {
      return false;
    }

    if (enabled) {
      // iOS 13+ permission request
      const DeviceOrientationEventAny = globalThis.DeviceOrientationEvent as
        PermissionedDeviceOrientationEventConstructor | undefined;
      if (DeviceOrientationEventAny && typeof DeviceOrientationEventAny.requestPermission === 'function') {
        try {
          const permission = await DeviceOrientationEventAny.requestPermission();
          if (permission !== 'granted') {
            console.warn('WebGL360Player: Motion permission denied:', permission);
            this.state.isMotionEnabled = false;
            return false;
          }
        } catch (e) {
          console.error('WebGL360Player: Motion permission request failed:', e);
          this.state.isMotionEnabled = false;
          return false;
        }
      }
    }

    this.state.isMotionEnabled = enabled;
    this.renderer?.setMotionEnabled(enabled);
    this.emit('motionchange', { enabled, state: this.getState() });
    return enabled;
  }

  setYaw(yaw: number): void {
    this.state.yaw = yaw;
    this.renderer?.setPose({ yaw: this.state.yaw, pitch: this.state.pitch, fov: this.state.fov });
    this.emitViewChange();
  }

  setPitch(pitch: number): void {
    this.state.pitch = clamp(pitch, -89, 89);
    this.renderer?.setPose({ yaw: this.state.yaw, pitch: this.state.pitch, fov: this.state.fov });
    this.emitViewChange();
  }

  setFov(fov: number): void {
    this.state.fov = clamp(fov, this.config.minFov, this.config.maxFov);
    this.renderer?.setPose({ yaw: this.state.yaw, pitch: this.state.pitch, fov: this.state.fov });
    this.emitViewChange();
  }

  setView(view: Partial<WebGL360View>): void {
    this.state.yaw = view.yaw ?? this.state.yaw;
    this.state.pitch = view.pitch === undefined ? this.state.pitch : clamp(view.pitch, -89, 89);
    this.state.fov = view.fov === undefined ? this.state.fov : clamp(view.fov, this.config.minFov, this.config.maxFov);
    this.renderer?.setPose({ yaw: this.state.yaw, pitch: this.state.pitch, fov: this.state.fov });
    this.emitViewChange();
  }

  getView(): WebGL360View {
    return {
      yaw: this.state.yaw,
      pitch: this.state.pitch,
      fov: this.state.fov,
    };
  }

  exportConfig(): WebGL360ExportedConfig {
    return {
      view: this.getView(),
      muted: this.state.isMuted,
      debug: this.state.isDebug,
      motionEnabled: this.state.isMotionEnabled,
      stereoMode: this.getStereoMode(),
      colorFilters: this.getColorFilters(),
      quality: this.state.selectedSource?.quality,
    };
  }

  async importConfig(config: Partial<WebGL360ExportedConfig>): Promise<void> {
    if (config.view) {
      this.setView(config.view);
    }
    if (config.muted !== undefined) {
      this.setMuted(config.muted);
    }
    if (config.debug !== undefined) {
      this.setDebug(config.debug);
    }
    if (config.colorFilters) {
      this.setColorFilters(config.colorFilters);
    }
    if (config.stereoMode) {
      this.setStereoMode(config.stereoMode);
    }
    if (config.motionEnabled !== undefined) {
      await this.setMotionEnabled(config.motionEnabled);
    }
    if (config.quality && config.quality !== this.state.selectedSource?.quality) {
      await this.setQuality(config.quality);
    }
  }

  async requestFullscreen(): Promise<boolean> {
    const fullscreenElement = this.container as FullscreenElement;
    const request = fullscreenElement.requestFullscreen ?? fullscreenElement.webkitRequestFullscreen;
    if (request) {
      try {
        await request.call(fullscreenElement);
        return true;
      } catch {
        this.container.classList.add('is-pseudo-fullscreen');
        return false;
      }
    }

    this.container.classList.add('is-pseudo-fullscreen');
    return false;
  }

  async exitFullscreen(): Promise<boolean> {
    const fullscreenDocument = document as FullscreenDocument;
    const fullscreenElement = fullscreenDocument.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement;
    const exit = fullscreenDocument.exitFullscreen ?? fullscreenDocument.webkitExitFullscreen;
    const wasNativeFullscreen = fullscreenElement === this.container;
    if (exit && fullscreenElement) {
      await exit.call(fullscreenDocument);
    }

    this.container.classList.remove('is-pseudo-fullscreen');
    return wasNativeFullscreen;
  }

  async captureFrame(options: WebGL360CaptureFrameOptions = {}): Promise<Blob> {
    if (!this.renderer || this.destroyed) {
      throw new Error('Cannot capture frame before the renderer is ready.');
    }

    return this.renderer.captureFrame(options);
  }

  async setQuality(quality: WebGL360Quality): Promise<WebGL360QualitySwitchResult> {
    if (!this.video || this.destroyed) {
      return this.finishQualityChange({ ok: false, quality, reason: 'player is not ready' });
    }

    if (this.state.stage !== 'main') {
      return this.finishQualityChange({ ok: false, quality, reason: 'quality can only be changed during the main stage' });
    }

    const candidates = selectInitialSource(this.config.sources.filter((source) => source.quality === quality), {
      defaultQuality: quality,
      maxQuality: quality,
      sourcePreference: this.config.sourcePreference,
      supportedTypes: this.getSupportedTypes(),
      capabilities: this.state.deviceCapabilities,
    }).candidates;

    if (candidates.length === 0) {
      return this.finishQualityChange({ ok: false, quality, reason: 'quality is not supported on this device' });
    }

    const previousSource = this.state.selectedSource;
    const previousTime = this.video.currentTime || this.state.currentTime;
    const wasPaused = this.video.paused;
    const restartRenderer = this.stereoMode.enabled;

    this.setMode('loading');
    this.loader.setState(`switching to ${quality}`);

    try {
      if (restartRenderer) {
        this.disposeRenderer();
      }

      await this.trySources(candidates, { notifyReady: false, restartRenderer });
      this.seek(previousTime);

      if (!wasPaused) {
        await this.play();
      }

      return this.finishQualityChange({
        ok: true,
        quality,
        selectedSource: this.state.selectedSource,
      });
    } catch (error) {
      if (previousSource) {
        try {
          await this.loadSource(previousSource);
          await this.startRenderer();
          this.seek(previousTime);
          if (!wasPaused) {
            await this.play();
          }
          this.setMode('ready');
        } catch {
          await this.failToFallback('quality_switch_restore_failed', error);
        }
      }

      return this.finishQualityChange({
        ok: false,
        quality,
        selectedSource: this.state.selectedSource,
        reason: getErrorMessage(error),
        error,
      });
    }
  }

  getState(): WebGL360PlayerState {
    if (this.video) {
      this.state.isPaused = this.video.paused;
      this.syncFrameDiagnostics();
    }
    return {
      ...this.state,
      attemptedSources: [...this.state.attemptedSources],
      sourceSupport: [...this.state.sourceSupport],
      availableQualities: [...this.state.availableQualities],
      diagnostics: {
        ...this.state.diagnostics,
        events: [...this.state.diagnostics.events],
      },
    };
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.state.mode = 'destroyed';
    this.container.dataset.webgl360Mode = 'destroyed';
    this.emit('destroy', this.getState());
    void this.cleanupPlugins();
    this.controls?.destroy();
    this.renderer?.destroy();
    this.stopAndDisposeVideoElements();
    void this.cleanupSourceLoader();
    this.loader.destroy();
    this.errorState?.destroy();
    this.debugOverlay?.destroy();
    this.pluginControlsRoot?.remove();
    this.overlayRoot?.remove();
    this.renderFrameListeners.clear();
    if (this.debugInterval) globalThis.clearInterval(this.debugInterval);
    window.removeEventListener('keydown', this.handleKeydown);

    this.video = undefined;
  }

  private setupKeyboardShortcuts(): void {
    window.addEventListener('keydown', this.handleKeydown);
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    // Only trigger if focus is on the container or body (avoid input fields)
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.code) {
      case 'Space':
      case 'KeyK':
        event.preventDefault();
        if (this.video?.paused) {
          void this.play();
        } else {
          this.pause();
        }
        break;
      case 'KeyM':
        this.setMuted(!this.state.isMuted);
        break;
      case 'ArrowLeft':
      case 'KeyJ':
        this.seek(this.state.currentTime - 5);
        break;
      case 'ArrowRight':
      case 'KeyL':
        this.seek(this.state.currentTime + 5);
        break;
      case 'Digit0':
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
      case 'Digit6':
      case 'Digit7':
      case 'Digit8':
      case 'Digit9':
      {
        const percent = parseInt(event.code.replace('Digit', ''), 10) * 10;
        if (this.video && this.video.duration) {
          this.seek((this.video.duration * percent) / 100);
        }
        break;
      }
    }
  };

  private async initialize(): Promise<void> {
    try {
      this.setMode('loading');
      this.loader.setState('preparing player');
      await this.installPlugins();
      track(this.config.analytics, 'webgl_360_player_attempted', {
        defaultQuality: this.config.defaultQuality,
        maxQuality: this.config.maxQuality,
        sourcePreference: this.config.sourcePreference,
      });

      const video = this.createVideoElement();
      this.video = video;
      this.container.appendChild(video);
      this.syncDeviceCapabilities();

      // Determine initial stage
      if (this.config.preSources && this.config.preSources.length > 0) {
        this.state.stage = 'pre';
        await this.runSequenceStage('pre', this.config.preSources);
      }
      
      this.state.stage = 'main';
      await this.runSequenceStage('main', this.config.sources);
    } catch (error) {
      await this.failToFallback('init_failed', error);
    }
  }

  private async runSequenceStage(stage: WebGL360SequenceStage, sources: WebGL360Source[]): Promise<void> {
    const supportedTypes = this.getSupportedTypes();
    const selection = selectInitialSource(sources, {
      defaultQuality: this.config.defaultQuality,
      maxQuality: this.config.maxQuality,
      sourcePreference: this.config.sourcePreference,
      supportedTypes,
      capabilities: this.state.deviceCapabilities,
    });

    if (!selection.selectedSource) {
      throw new Error(`No playable source matched for stage ${stage}.`);
    }

    await this.trySources(selection.candidates);
  }

  private async trySources(
    candidates: WebGL360Source[],
    options: { notifyReady?: boolean; restartRenderer?: boolean } = {},
  ): Promise<void> {
    const notifyReady = options.notifyReady ?? true;
    const restartRenderer = options.restartRenderer ?? false;
    let lastError: unknown;

    for (const source of candidates) {
      if (this.destroyed) {
        return;
      }

      const previousSource = this.state.selectedSource;
      this.state.selectedSource = source;
      this.state.diagnostics.selectedSource = source;
      this.state.attemptedSources.push(source);
      this.emit('sourcechange', { source, previousSource, state: this.getState() });
      this.loader.setState(`loading ${source.quality} ${source.type.toUpperCase()}`);

      try {
        await this.loadSource(source);
        if (restartRenderer || !this.renderer) {
          await this.startRenderer();
        }
        this.setMode('ready');
        this.loader.destroy();
        this.container.dataset.webgl360Mode = 'webgl';
        this.container.dataset.webgl360SourceType = source.type;
        this.container.dataset.webgl360Quality = source.quality;
        track(this.config.analytics, 'webgl_360_player_ready', {
          selectedSourceType: source.type,
          selectedQuality: source.quality,
          attemptedSourceCount: this.state.attemptedSources.length,
          stage: this.state.stage,
        });
        if (notifyReady && this.state.stage === 'main') {
          this.notifyReady();
        }
        return;
      } catch (error) {
        this.state.selectedSource = previousSource;
        this.state.diagnostics.selectedSource = previousSource;
        lastError = error;
        this.recordDiagnostic({
          type: 'source_error',
          message: `Source ${source.quality} ${source.type.toUpperCase()} failed`,
          source,
          error: getErrorMessage(error),
        });
        track(this.config.analytics, 'webgl_360_player_source_error', {
          selectedSourceType: source.type,
          selectedQuality: source.quality,
          error: getErrorMessage(error),
          stage: this.state.stage,
        });
      }
    }

    throw lastError ?? new Error('All sources failed.');
  }

  private createVideoElement(): HTMLVideoElement {
    const video = document.createElement('video');
    video.className = 'webgl-360-player__video';
    this.videoElements.add(video);
    
    video.addEventListener('play', () => {
      this.state.isPaused = false;
      if (this.config.debug) console.info('Video: play');
      this.emit('play', this.getState());
      this.config.onPlay?.();
    });
    
    video.addEventListener('pause', () => {
      this.state.isPaused = true;
      if (this.config.debug) console.info('Video: pause');
      this.emit('pause', this.getState());
      this.config.onPause?.();
    });

    video.addEventListener('playing', () => {
      this.state.isPaused = false;
      if (this.config.debug) console.info('Video: playing');
    });

    video.addEventListener('error', () => {
      const error = video.error;
      this.recordDiagnostic({
        type: 'decode_error',
        message: error?.message || 'Video decode or network error',
        source: this.state.selectedSource,
        error: error ? `code ${error.code}: ${error.message}` : undefined,
      });
    });

    video.addEventListener('ended', () => {
      if (this.config.debug) console.info('Video: ended', { stage: this.state.stage });
      this.emit('ended', this.getState());
      void this.handleEnded();
    });

    if (this.config.debug) {
      video.addEventListener('error', () => console.error('Video: error', this.state.diagnostics.lastDecodeError));
      video.addEventListener('stalled', () => console.warn('Video: stalled'));
      video.addEventListener('waiting', () => console.warn('Video: waiting'));
    }

    video.preload = 'auto';
    video.muted = this.config.muted;
    video.loop = false; // We handle looping manually to support sequences
    video.playsInline = this.config.playsInline;
    video.controls = false;
    video.style.position = 'absolute';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    video.crossOrigin = this.config.crossOrigin;

    if (this.config.poster) {
      video.poster = this.config.poster;
    }

    if (this.config.autoplay) {
      video.autoplay = true;
    }

    return video;
  }

  private async handleEnded(): Promise<void> {
    if (this.state.stage === 'pre') {
      this.state.stage = 'main';
      await this.runSequenceStage('main', this.config.sources);
    } else if (this.state.stage === 'main') {
      if (this.config.postSources && this.config.postSources.length > 0) {
        this.state.stage = 'post';
        await this.runSequenceStage('post', this.config.postSources);
      } else if (this.config.loop) {
        await this.restartSequence();
      } else {
        this.config.onEnded?.();
      }
    } else if (this.state.stage === 'post') {
      if (this.config.loop) {
        await this.restartSequence();
      } else {
        this.config.onEnded?.();
      }
    }
  }

  private async restartSequence(): Promise<void> {
    if (this.config.preSources && this.config.preSources.length > 0) {
      this.state.stage = 'pre';
      await this.runSequenceStage('pre', this.config.preSources);
    } else {
      this.state.stage = 'main';
      await this.runSequenceStage('main', this.config.sources);
    }
  }

  private async loadSource(source: WebGL360Source): Promise<void> {
    if (!this.video) {
      throw new Error('Video element is not available.');
    }

    const video = this.video;
    this.stopAndDisposeVideoElements(video);
    this.detachCurrentVideoSource(video);
    await this.cleanupSourceLoader();
    video.muted = this.state.isMuted;

    video.ontimeupdate = () => {
      this.state.currentTime = video.currentTime;
      this.emit('timeupdate', {
        currentTime: video.currentTime,
        duration: video.duration,
        state: this.getState(),
      });
      this.config.onTimeUpdate?.(video.currentTime, video.duration);
    };

    video.ondurationchange = () => {
      this.state.duration = video.duration;
    };

    const defaultLoad = async (): Promise<void> => {
      video.src = source.src;

      if (source.mimeType) {
        video.setAttribute('type', source.mimeType);
      } else {
        video.removeAttribute('type');
      }

      video.load();
      await waitForVideoReady(video);
    };

    const sourceLoader = this.sourceLoaders.get(source.type) ?? this.config.sourceLoader;
    const result = sourceLoader
      ? await sourceLoader({
        video,
        source,
        defaultLoad,
        waitForReady: () => waitForVideoReady(video),
      })
      : await defaultLoad();

    this.sourceLoaderCleanup = getSourceLoaderCleanup(result);

    if (this.config.autoplay) {
      try {
        await video.play();
      } catch (error) {
        if (this.config.debug) console.warn('WebGL360Player: Autoplay blocked or failed:', error);
        // Do not throw here, just let the player be ready in a paused state
      }
    }
  }

  private detachCurrentVideoSource(video: HTMLVideoElement): void {
    this.stopVideoElement(video);
  }

  private stopVideoElement(video: HTMLVideoElement): void {
    try {
      video.pause();
    } catch {
      // ignore media teardown failures
    }
    video.muted = true;
    video.removeAttribute('src');
    video.removeAttribute('type');
    try {
      video.load();
    } catch {
      // ignore media teardown failures
    }
  }

  private stopAndDisposeVideoElements(except?: HTMLVideoElement): void {
    for (const video of Array.from(this.videoElements)) {
      if (video === except) {
        continue;
      }
      this.stopVideoElement(video);
      disposeElement(video);
      this.videoElements.delete(video);
    }
  }

  private async startRenderer(): Promise<void> {
    if (!this.video) {
      throw new Error('Video element is not available.');
    }

    this.loader.setState('warming first frame');
    this.disposeRenderer();

    this.renderer = new SceneRenderer(this.container, this.video, {
      fov: this.state.fov,
      yaw: this.state.yaw,
      pitch: this.state.pitch,
      minFov: this.config.minFov,
      maxFov: this.config.maxFov,
      projectionMode: this.config.projectionMode,
      stereoSourceLayout: this.config.stereoSourceLayout,
      debug: this.config.debug,
      onContextLost: () => {
        this.state.diagnostics.contextLostCount++;
        this.emit('contextlost', { source: this.state.selectedSource, state: this.getState() });
        this.recordDiagnostic({
          type: 'context_lost',
          message: 'WebGL context lost',
          source: this.state.selectedSource,
        });
        void this.failToFallback('context_lost', new Error('WebGL context lost.'));
      },
      onFrame: (delta) => {
        this.frameCount++;
        this.emitRenderFrame(delta);
      }
    });
    this.renderer.setColorFilters(this.colorFilters);
    this.renderer.setStereoMode(this.stereoMode);
    this.renderer.start();

    if (this.config.controls) {
      this.controls = createPointerControls(this.container, {
        getState: () => this.getState(),
        setYaw: (yaw) => this.setYaw(yaw),
        setPitch: (pitch) => this.setPitch(pitch),
        setFov: (fov) => this.setFov(fov),
        onClick: (e) => this.config.onClick?.(e),
        debug: this.config.debug,
      });
    }
  }

  private disposeRenderer(): void {
    this.controls?.destroy();
    this.controls = undefined;
    this.renderer?.destroy();
    this.renderer = undefined;
  }

  private updateDebug(): void {
    const now = performance.now();
    const duration = now - this.lastFrameTime;
    if (duration >= 1000) {
      this.state.fps = Math.round((this.frameCount * 1000) / duration);
      this.frameCount = 0;
      this.lastFrameTime = now;
    }

    if (this.state.selectedSource) {
      this.state.bitrate = this.state.selectedSource.bitrate || 0;
    }

    if (this.debugOverlay) {
      this.debugOverlay.update(this.getState());
    }
  }

  private getSupportedTypes(): ('hls' | 'mp4')[] {
    return this.config.sourceLoader ? ['hls', 'mp4'] : getSupportedSourceTypes(this.video!);
  }

  private syncDeviceCapabilities(): void {
    if (!this.video) {
      return;
    }

    const capabilities = detectDeviceCapabilities(this.video);
    capabilities.supportedTypes = this.getSupportedTypes();
    this.state.deviceCapabilities = capabilities;
    this.state.sourceSupport = getSourceSupportList(this.config.sources, capabilities);
    this.state.availableQualities = Array.from(new Set(
      getSupportedSources(this.config.sources, capabilities).map((source) => source.quality),
    ));
  }

  private syncFrameDiagnostics(): void {
    const quality = this.video && 'getVideoPlaybackQuality' in this.video
      ? this.video.getVideoPlaybackQuality()
      : undefined;

    if (!quality) {
      return;
    }

    this.state.diagnostics.decodedFrames = quality.totalVideoFrames;
    this.state.diagnostics.droppedFrames = quality.droppedVideoFrames;
    this.state.diagnostics.droppedFrameRatio = quality.totalVideoFrames > 0
      ? quality.droppedVideoFrames / quality.totalVideoFrames
      : 0;
  }

  private emitViewChange(): void {
    this.emit('viewchange', {
      yaw: this.state.yaw,
      pitch: this.state.pitch,
      fov: this.state.fov,
      state: this.getState(),
    });
  }

  private notifyReady(): void {
    const state = this.getState();
    this.emit('ready', state);
    this.config.onReady?.(state);
  }

  private recordDiagnostic(input: Omit<WebGL360DiagnosticEvent, 'at'>): void {
    const event: WebGL360DiagnosticEvent = {
      ...input,
      at: Date.now(),
    };

    if (event.type === 'source_error') {
      this.state.diagnostics.lastSourceError = event;
    } else if (event.type === 'decode_error') {
      this.state.diagnostics.lastDecodeError = event;
    }

    this.state.diagnostics.selectedSource = this.state.selectedSource;
    this.state.diagnostics.events = [
      ...this.state.diagnostics.events.slice(-19),
      event,
    ];
    const state = this.getState();
    this.emit('diagnostic', { event, state });
    this.config.onDiagnostic?.(event, state);
  }

  private finishQualityChange(result: WebGL360QualitySwitchResult): WebGL360QualitySwitchResult {
    this.recordDiagnostic({
      type: 'quality_change',
      message: result.ok ? `Quality changed to ${result.quality}` : `Quality change to ${result.quality} failed`,
      source: result.selectedSource,
      reason: result.reason,
      error: result.error ? getErrorMessage(result.error) : undefined,
    });
    const state = this.getState();
    this.emit('qualitychange', { result, state });
    this.config.onQualityChange?.(result, state);
    track(this.config.analytics, 'webgl_360_player_quality_change', {
      ok: result.ok,
      quality: result.quality,
      selectedQuality: result.selectedSource?.quality,
      reason: result.reason,
    });
    return result;
  }

  private async failToFallback(reason: string, error: unknown): Promise<void> {
    if (this.destroyed || this.state.mode === 'fallback') {
      return;
    }

    this.state.error = error;
    this.state.diagnostics.lastFallbackReason = reason;
    this.recordDiagnostic({
      type: 'fallback',
      message: `Fallback triggered: ${reason}`,
      source: this.state.selectedSource,
      reason,
      error: getErrorMessage(error),
    });
    this.setMode('fallback');
    this.loader.setState('fallback in progress');
    const errorState = this.getState();
    this.emit('error', { error, state: errorState });
    this.config.onError?.(error, errorState);
    track(this.config.analytics, 'webgl_360_player_fallback', {
      reason,
      error: getErrorMessage(error),
      selectedSourceType: this.state.selectedSource?.type,
      selectedQuality: this.state.selectedSource?.quality,
      attemptedSourceCount: this.state.attemptedSources.length,
    });

    const context: WebGL360FallbackContext = {
      reason,
      error,
      container: this.container,
      attemptedSources: [...this.state.attemptedSources],
      selectedSource: this.state.selectedSource,
    };

    this.config.onFallback?.(context);
    this.emit('fallback', context);
    await this.disposeExperimentalRuntime();

    try {
      if (this.config.fallback) {
        await this.config.fallback(context);
        this.container.dataset.webgl360Mode = 'fallback';
      } else {
        this.setMode('error');
        this.container.dataset.webgl360Mode = 'error';
        this.errorState = createErrorState(
          this.container,
          `The 360 video player could not start: ${getErrorMessage(error)}`,
        );
      }

      this.loader.destroy();
    } catch (fallbackError) {
      this.setMode('error');
      this.container.dataset.webgl360Mode = 'error';
      this.loader.destroy();
      this.errorState = createErrorState(this.container, getErrorMessage(fallbackError));
    }
  }

  private setMode(mode: WebGL360PlayerState['mode']): void {
    this.state.mode = mode;
    this.container.dataset.webgl360Mode = mode;
  }

  private async disposeExperimentalRuntime(): Promise<void> {
    await this.cleanupPlugins();
    this.controls?.destroy();
    this.controls = undefined;
    this.renderer?.destroy();
    this.renderer = undefined;

    this.stopAndDisposeVideoElements();
    await this.cleanupSourceLoader();

    this.video = undefined;
  }

  private async cleanupSourceLoader(): Promise<void> {
    if (!this.sourceLoaderCleanup) {
      return;
    }

    const cleanup = this.sourceLoaderCleanup;
    this.sourceLoaderCleanup = undefined;
    await cleanup();
  }
}

interface DebugOverlayHandle {
  update: (state: WebGL360PlayerState) => void;
  destroy: () => void;
}

function createDebugOverlay(container: HTMLElement): DebugOverlayHandle {
  const root = document.createElement('div');
  root.className = 'webgl-360-debug-overlay';
  container.appendChild(root);

  return {
    update(state) {
      const source = state.selectedSource;
      const res = source ? `${source.width || '?'}x${source.height || '?'}` : 'N/A';
      const bitrate = state.bitrate ? `${(state.bitrate / 1000000).toFixed(2)} Mbps` : 'N/A';
      const dropped = `${state.diagnostics.droppedFrames}/${state.diagnostics.decodedFrames} (${(state.diagnostics.droppedFrameRatio * 100).toFixed(1)}%)`;
      const caps = state.deviceCapabilities;
      
      root.textContent = [
        `Mode: ${state.mode}`,
        `Source: ${source?.type.toUpperCase() || 'N/A'} (${source?.quality || 'N/A'})`,
        `Res: ${res}`,
        `FPS: ${state.fps}`,
        `Dropped: ${dropped}`,
        `Bitrate: ${bitrate}`,
        `Texture cap: ${caps?.maxTextureSize || 'N/A'}`,
        `HEVC: ${caps?.hevcSupported ? 'YES' : 'NO'}`,
        `Last error: ${state.diagnostics.lastSourceError?.message || state.diagnostics.lastDecodeError?.message || 'N/A'}`,
        `Yaw/Pitch: ${state.yaw.toFixed(1)}° / ${state.pitch.toFixed(1)}°`,
        `FOV: ${state.fov.toFixed(1)}°`,
        `Muted: ${state.isMuted ? 'YES' : 'NO'}`,
        `Motion: ${state.isMotionEnabled ? 'ON' : 'OFF'}`,
      ].join('\n');
    },
    destroy() {
      root.remove();
    }
  };
}

function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };
    const handleLoadedMetadata = (): void => {
      cleanup();
      resolve();
    };
    const handleError = (): void => {
      cleanup();
      reject(video.error ?? new Error('Video source failed to load.'));
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getPluginId(plugin: WebGL360Plugin): string | undefined {
  return typeof plugin === 'function' ? undefined : plugin.id;
}

function getSourceLoaderCleanup(result: WebGL360SourceLoaderResult): WebGL360SourceLoaderCleanup | undefined {
  if (typeof result === 'function') {
    return result;
  }

  return result?.cleanup;
}
