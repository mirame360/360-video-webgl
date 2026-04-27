import { track } from './analytics';
import { getSupportedSourceTypes, getIPhoneQualityCeiling } from './capabilities';
import { clamp, normalizePlayerOptions } from './config';
import { SceneRenderer } from './renderer/SceneRenderer';
import { createPointerControls, type ControlsHandle } from './renderer/controls';
import { disposeElement } from './renderer/dispose';
import { createErrorState, type ErrorStateHandle } from './ui/errorState';
import { createLoader, type LoaderHandle } from './ui/loader';
import { selectInitialSource } from './sourceSelection';
import type {
  NormalizedWebGL360PlayerOptions,
  WebGL360FallbackContext,
  WebGL360Player,
  WebGL360PlayerOptions,
  WebGL360PlayerState,
  WebGL360SequenceStage,
  WebGL360Source,
  WebGL360SourceLoaderCleanup,
  WebGL360SourceLoaderResult,
} from './types';

export function createWebGL360Player(container: HTMLElement, options: WebGL360PlayerOptions): WebGL360Player {
  if (!container) {
    throw new Error('webgl-360-player requires a container element.');
  }

  const config = normalizePlayerOptions(options);
  
  // Enforce hardware-safe ceiling on iPhone if not explicitly stricter
  const ceiling = getIPhoneQualityCeiling();
  if (ceiling && (!config.maxQuality || config.maxQuality === '8k')) {
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
      attemptedSources: [],
    };
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
    return {
      destroy: () => this.destroy(),
      play: () => this.play(),
      pause: () => this.pause(),
      stop: () => this.stop(),
      togglePlay: () => this.togglePlay(),
      seek: (time) => this.seek(time),
      setYaw: (yaw) => this.setYaw(yaw),
      setPitch: (pitch) => this.setPitch(pitch),
      setFov: (fov) => this.setFov(fov),
      setMuted: (muted) => this.setMuted(muted),
      setDebug: (enabled) => this.setDebug(enabled),
      setMotionEnabled: (enabled) => this.setMotionEnabled(enabled),
      getState: () => this.getState(),
    };
  }

  start(): void {
    void this.initialize();
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
      this.video.currentTime = time;
      // Force a state sync
      this.state.currentTime = time;
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
      const DeviceOrientationEventAny = (globalThis as any).DeviceOrientationEvent;
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
    return enabled;
  }

  setYaw(yaw: number): void {
    this.state.yaw = yaw;
    this.renderer?.setPose({ yaw: this.state.yaw, pitch: this.state.pitch, fov: this.state.fov });
  }

  setPitch(pitch: number): void {
    this.state.pitch = clamp(pitch, -89, 89);
    this.renderer?.setPose({ yaw: this.state.yaw, pitch: this.state.pitch, fov: this.state.fov });
  }

  setFov(fov: number): void {
    this.state.fov = clamp(fov, this.config.minFov, this.config.maxFov);
    this.renderer?.setPose({ yaw: this.state.yaw, pitch: this.state.pitch, fov: this.state.fov });
  }

  getState(): WebGL360PlayerState {
    if (this.video) {
      this.state.isPaused = this.video.paused;
    }
    return {
      ...this.state,
      attemptedSources: [...this.state.attemptedSources],
    };
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.state.mode = 'destroyed';
    this.container.dataset.webgl360Mode = 'destroyed';
    this.controls?.destroy();
    this.renderer?.destroy();
    void this.cleanupSourceLoader();
    this.loader.destroy();
    this.errorState?.destroy();
    this.debugOverlay?.destroy();
    if (this.debugInterval) globalThis.clearInterval(this.debugInterval);
    window.removeEventListener('keydown', this.handleKeydown);

    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      disposeElement(this.video);
      this.video = undefined;
    }
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
        const percent = parseInt(event.code.replace('Digit', ''), 10) * 10;
        if (this.video && this.video.duration) {
          this.seek((this.video.duration * percent) / 100);
        }
        break;
    }
  };

  private async initialize(): Promise<void> {
    try {
      this.setMode('loading');
      this.loader.setState('preparing player');
      track(this.config.analytics, 'webgl_360_player_attempted', {
        defaultQuality: this.config.defaultQuality,
        maxQuality: this.config.maxQuality,
        sourcePreference: this.config.sourcePreference,
      });

      const video = this.createVideoElement();
      this.video = video;
      this.container.appendChild(video);

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
    const supportedTypes = this.config.sourceLoader ? ['hls' as const, 'mp4' as const] : getSupportedSourceTypes(this.video!);
    const selection = selectInitialSource(sources, {
      defaultQuality: this.config.defaultQuality,
      maxQuality: this.config.maxQuality,
      sourcePreference: this.config.sourcePreference,
      supportedTypes,
    });

    if (!selection.selectedSource) {
      throw new Error(`No playable source matched for stage ${stage}.`);
    }

    await this.trySources(selection.candidates);
  }

  private async trySources(candidates: WebGL360Source[]): Promise<void> {
    let lastError: unknown;

    for (const source of candidates) {
      if (this.destroyed) {
        return;
      }

      this.state.selectedSource = source;
      this.state.attemptedSources.push(source);
      this.loader.setState(`loading ${source.quality} ${source.type.toUpperCase()}`);

      try {
        await this.loadSource(source);
        if (!this.renderer) {
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
        if (this.state.stage === 'main') {
          this.config.onReady?.(this.getState());
        }
        return;
      } catch (error) {
        lastError = error;
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
    
    video.addEventListener('play', () => {
      this.state.isPaused = false;
      if (this.config.debug) console.info('Video: play');
      this.config.onPlay?.();
    });
    
    video.addEventListener('pause', () => {
      this.state.isPaused = true;
      if (this.config.debug) console.info('Video: pause');
      this.config.onPause?.();
    });

    video.addEventListener('playing', () => {
      this.state.isPaused = false;
      if (this.config.debug) console.info('Video: playing');
    });

    video.addEventListener('ended', () => {
      if (this.config.debug) console.info('Video: ended', { stage: this.state.stage });
      void this.handleEnded();
    });

    if (this.config.debug) {
      video.addEventListener('error', () => {
        const error = video.error;
        console.error('Video: error', {
          code: error?.code,
          message: error?.message,
          rawError: error,
          src: video.src,
          readyState: video.readyState,
          networkState: video.networkState,
        });
      });
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
    await this.cleanupSourceLoader();

    video.ontimeupdate = () => {
      this.state.currentTime = video.currentTime;
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

    const result = this.config.sourceLoader
      ? await this.config.sourceLoader({
        video,
        source,
        defaultLoad,
        waitForReady: () => waitForVideoReady(video),
      })
      : await defaultLoad();

    this.sourceLoaderCleanup = getSourceLoaderCleanup(result);

    if (this.config.autoplay || this.state.stage !== 'main') {
      await video.play();
    }
  }

  private async startRenderer(): Promise<void> {
    if (!this.video) {
      throw new Error('Video element is not available.');
    }

    this.loader.setState('warming first frame');
    this.renderer?.destroy();
    this.controls?.destroy();

    this.renderer = new SceneRenderer(this.container, this.video, {
      fov: this.state.fov,
      yaw: this.state.yaw,
      pitch: this.state.pitch,
      minFov: this.config.minFov,
      maxFov: this.config.maxFov,
      debug: this.config.debug,
      onContextLost: () => {
        void this.failToFallback('context_lost', new Error('WebGL context lost.'));
      },
      onFrame: () => {
        this.frameCount++;
      }
    });
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

  private async failToFallback(reason: string, error: unknown): Promise<void> {
    if (this.destroyed || this.state.mode === 'fallback') {
      return;
    }

    this.state.error = error;
    this.setMode('fallback');
    this.loader.setState('fallback in progress');
    this.config.onError?.(error, this.getState());
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
    this.controls?.destroy();
    this.controls = undefined;
    this.renderer?.destroy();
    this.renderer = undefined;
    await this.cleanupSourceLoader();

    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      disposeElement(this.video);
      this.video = undefined;
    }
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
      
      root.textContent = [
        `Mode: ${state.mode}`,
        `Source: ${source?.type.toUpperCase() || 'N/A'} (${source?.quality || 'N/A'})`,
        `Res: ${res}`,
        `FPS: ${state.fps}`,
        `Bitrate: ${bitrate}`,
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

function getSourceLoaderCleanup(result: WebGL360SourceLoaderResult): WebGL360SourceLoaderCleanup | undefined {
  if (typeof result === 'function') {
    return result;
  }

  return result?.cleanup;
}
