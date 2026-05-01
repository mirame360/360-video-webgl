import { createWebGL360Player } from './createPlayer';
import type {
  WebGL360CaptureFrameOptions,
  WebGL360ExportedConfig,
  WebGL360Player,
  WebGL360PlayerOptions,
  WebGL360Quality,
  WebGL360QualitySwitchResult,
  WebGL360Source,
  WebGL360View,
} from './types';

const HTMLElementBase: typeof HTMLElement = globalThis.HTMLElement ?? class {} as typeof HTMLElement;

export class WebGL360PlayerElement extends HTMLElementBase {
  static get observedAttributes(): string[] {
    return [
      'src',
      'type',
      'quality',
      'sources',
      'poster',
      'autoplay',
      'muted',
      'loop',
      'controls',
      'projection-mode',
      'stereo-source-layout',
    ];
  }

  private container?: HTMLDivElement;
  private player?: WebGL360Player;
  private pendingOptions?: Partial<WebGL360PlayerOptions>;
  private initialized = false;

  connectedCallback(): void {
    this.ensureContainer();
    this.recreatePlayer();
  }

  disconnectedCallback(): void {
    this.destroyPlayer();
  }

  attributeChangedCallback(): void {
    if (this.initialized) {
      this.recreatePlayer();
    }
  }

  set options(options: Partial<WebGL360PlayerOptions>) {
    this.pendingOptions = options;
    if (this.initialized) {
      this.recreatePlayer();
    }
  }

  get instance(): WebGL360Player | undefined {
    return this.player;
  }

  play(): Promise<void> {
    return this.requirePlayer().play();
  }

  pause(): void {
    this.requirePlayer().pause();
  }

  stop(): void {
    this.requirePlayer().stop();
  }

  togglePlay(): Promise<void> {
    return this.requirePlayer().togglePlay();
  }

  seek(time: number): void {
    this.requirePlayer().seek(time);
  }

  setView(view: Partial<WebGL360View>): void {
    this.requirePlayer().setView(view);
  }

  getView(): WebGL360View {
    return this.requirePlayer().getView();
  }

  setQuality(quality: WebGL360Quality): Promise<WebGL360QualitySwitchResult> {
    return this.requirePlayer().setQuality(quality);
  }

  exportConfig(): WebGL360ExportedConfig {
    return this.requirePlayer().exportConfig();
  }

  importConfig(config: Partial<WebGL360ExportedConfig>): Promise<void> {
    return this.requirePlayer().importConfig(config);
  }

  requestPlayerFullscreen(): Promise<boolean> {
    return this.requirePlayer().requestFullscreen();
  }

  exitPlayerFullscreen(): Promise<boolean> {
    return this.requirePlayer().exitFullscreen();
  }

  captureFrame(options?: WebGL360CaptureFrameOptions): Promise<Blob> {
    return this.requirePlayer().captureFrame(options);
  }

  destroy(): void {
    this.destroyPlayer();
    this.initialized = false;
  }

  private recreatePlayer(): void {
    const container = this.ensureContainer();
    const options = this.getPlayerOptions();
    if (options.sources.length === 0) {
      this.destroyPlayer();
      return;
    }

    this.destroyPlayer();
    this.player = createWebGL360Player(container, options);
    this.initialized = true;
  }

  private destroyPlayer(): void {
    this.player?.destroy();
    this.player = undefined;
    if (this.container) {
      this.container.replaceChildren();
    }
  }

  private ensureContainer(): HTMLDivElement {
    if (this.container) {
      return this.container;
    }

    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{display:block;position:relative;overflow:hidden}.webgl-360-player-element__viewport{position:absolute;inset:0}';
    const container = document.createElement('div');
    container.className = 'webgl-360-player-element__viewport';
    root.replaceChildren(style, container);
    this.container = container;
    return container;
  }

  private getPlayerOptions(): WebGL360PlayerOptions {
    return {
      sources: this.getSources(),
      poster: this.getAttribute('poster') ?? undefined,
      autoplay: getBooleanAttribute(this, 'autoplay'),
      muted: getBooleanAttribute(this, 'muted', true),
      loop: getBooleanAttribute(this, 'loop'),
      controls: getBooleanAttribute(this, 'controls', true),
      projectionMode: this.getProjectionMode(),
      stereoSourceLayout: this.getStereoSourceLayout(),
      ...this.pendingOptions,
    };
  }

  private getSources(): WebGL360Source[] {
    const sourcesAttribute = this.getAttribute('sources');
    if (sourcesAttribute) {
      try {
        const parsed = JSON.parse(sourcesAttribute);
        return Array.isArray(parsed) ? parsed as WebGL360Source[] : [];
      } catch {
        return [];
      }
    }

    const src = this.getAttribute('src');
    if (!src) {
      return [];
    }

    return [{
      src,
      type: this.getAttribute('type') === 'hls' ? 'hls' : 'mp4',
      quality: this.getAttribute('quality') ?? 'auto',
    }];
  }

  private getProjectionMode(): WebGL360PlayerOptions['projectionMode'] {
    return this.getAttribute('projection-mode') === '180' ? '180' : '360';
  }

  private getStereoSourceLayout(): WebGL360PlayerOptions['stereoSourceLayout'] {
    const value = this.getAttribute('stereo-source-layout');
    return value === 'left-right' || value === 'top-bottom' ? value : 'mono';
  }

  private requirePlayer(): WebGL360Player {
    if (!this.player) {
      throw new Error('webgl-360-player element is not initialized.');
    }

    return this.player;
  }
}

export function defineWebGL360PlayerElement(tagName = 'webgl-360-player'): typeof WebGL360PlayerElement {
  if (!globalThis.customElements) {
    return WebGL360PlayerElement;
  }

  if (!globalThis.customElements.get(tagName)) {
    globalThis.customElements.define(tagName, WebGL360PlayerElement);
  }

  return WebGL360PlayerElement;
}

function getBooleanAttribute(element: HTMLElement, name: string, defaultValue = false): boolean {
  if (!element.hasAttribute(name)) {
    return defaultValue;
  }

  const value = element.getAttribute(name);
  return value === '' || value === 'true' || value === name;
}
