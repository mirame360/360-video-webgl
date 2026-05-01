import type { WebGL360PluginCleanup, WebGL360PluginContext, WebGL360PluginObject } from '../types';

export type SubtitleTrackKind = 'subtitles' | 'captions' | 'descriptions' | 'chapters' | 'metadata';

export interface SubtitleTrack {
  id: string;
  src: string;
  label: string;
  srclang: string;
  kind?: SubtitleTrackKind;
  default?: boolean;
}

export interface SubtitlesPluginOptions {
  tracks: SubtitleTrack[];
  defaultTrackId?: string;
  enabled?: boolean;
  controls?: boolean;
  className?: string;
}

export interface SubtitlesPlugin extends WebGL360PluginObject {
  setTrack: (trackId: string | undefined) => void;
  getActiveTrack: () => SubtitleTrack | undefined;
  setEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
  getTracks: () => SubtitleTrack[];
}

interface AttachedTrack {
  element: HTMLTrackElement;
  textTrack: TextTrack;
  handleCueChange: () => void;
}

const SUBTITLE_ROOT_CLASS = 'webgl-360-subtitles';
const SUBTITLE_LINE_CLASS = 'webgl-360-subtitles__line';

export function createSubtitlesPlugin(options: SubtitlesPluginOptions): SubtitlesPlugin {
  const tracks = [...options.tracks];
  let enabled = options.enabled ?? true;
  let activeTrackId: string | undefined = options.defaultTrackId ?? tracks.find((track) => track.default)?.id ?? tracks[0]?.id;
  let context: WebGL360PluginContext | undefined;
  let overlay: HTMLDivElement | undefined;
  let controlRoot: HTMLDivElement | undefined;
  let controlButton: HTMLButtonElement | undefined;
  let controlMenu: HTMLDivElement | undefined;
  let currentVideo: HTMLVideoElement | undefined;
  const attachedTracks = new Map<string, AttachedTrack>();
  const cleanups: WebGL360PluginCleanup[] = [];

  const getActiveTrack = (): SubtitleTrack | undefined => tracks.find((track) => track.id === activeTrackId);

  const detachTracks = (): void => {
    for (const attached of attachedTracks.values()) {
      attached.textTrack.removeEventListener('cuechange', attached.handleCueChange);
      attached.textTrack.mode = 'disabled';
      attached.element.remove();
    }
    attachedTracks.clear();
    currentVideo = undefined;
  };

  const renderActiveCues = (): void => {
    if (!overlay) {
      return;
    }

    overlay.replaceChildren();
    overlay.hidden = !enabled;

    if (!enabled || !activeTrackId) {
      return;
    }

    const activeTrack = attachedTracks.get(activeTrackId)?.textTrack;
    if (!activeTrack?.activeCues?.length) {
      return;
    }

    for (const cue of Array.from(activeTrack.activeCues)) {
      const line = document.createElement('div');
      line.className = SUBTITLE_LINE_CLASS;
      line.textContent = getCueText(cue);
      applyLineStyles(line);
      overlay.appendChild(line);
    }
  };

  const updateTrackModes = (): void => {
    for (const [trackId, attached] of attachedTracks) {
      attached.textTrack.mode = enabled && trackId === activeTrackId ? 'hidden' : 'disabled';
    }
    renderActiveCues();
    updateControlState();
  };

  const attachTracks = (force = false): void => {
    const video = context?.getVideo();
    if (!video || (video === currentVideo && !force)) {
      updateTrackModes();
      return;
    }

    detachTracks();
    currentVideo = video;

    for (const track of tracks) {
      const element = document.createElement('track');
      element.kind = track.kind ?? 'subtitles';
      element.label = track.label;
      element.srclang = track.srclang;
      element.src = track.src;
      element.default = track.id === activeTrackId;
      element.dataset.webgl360SubtitleTrackId = track.id;

      const handleCueChange = (): void => renderActiveCues();
      video.appendChild(element);
      element.track.addEventListener('cuechange', handleCueChange);
      attachedTracks.set(track.id, {
        element,
        textTrack: element.track,
        handleCueChange,
      });
    }

    updateTrackModes();
  };

  return {
    id: 'subtitles',
    install(pluginContext) {
      context = pluginContext;
      overlay = document.createElement('div');
      overlay.className = options.className
        ? `${SUBTITLE_ROOT_CLASS} ${options.className}`
        : SUBTITLE_ROOT_CLASS;
      overlay.setAttribute('aria-live', 'polite');
      overlay.hidden = !enabled;
      applyOverlayStyles(overlay);
      pluginContext.container.appendChild(overlay);

      cleanups.push(pluginContext.on('sourcechange', () => attachTracks(true)));
      cleanups.push(pluginContext.on('ready', () => attachTracks(true)));
      cleanups.push(pluginContext.on('timeupdate', renderActiveCues));

      if (options.controls ?? true) {
        const control = createSubtitleControl();
        cleanups.push(pluginContext.mountControl(control));
      }

      attachTracks();

      return () => {
        for (const cleanup of cleanups.splice(0).reverse()) {
          cleanup();
        }
        detachTracks();
        controlRoot?.remove();
        controlRoot = undefined;
        controlButton = undefined;
        controlMenu = undefined;
        overlay?.remove();
        overlay = undefined;
        context = undefined;
      };
    },
    setTrack(trackId) {
      if (trackId !== undefined && !tracks.some((track) => track.id === trackId)) {
        context?.emitDiagnostic({
          type: 'plugin_error',
          message: `Subtitle track "${trackId}" does not exist`,
          reason: 'subtitle_track_missing',
        });
        return;
      }

      activeTrackId = trackId;
      updateTrackModes();
    },
    getActiveTrack,
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      updateTrackModes();
    },
    isEnabled() {
      return enabled;
    },
    getTracks() {
      return [...tracks];
    },
  };

  function createSubtitleControl(): HTMLDivElement {
    controlRoot = document.createElement('div');
    controlRoot.className = 'webgl-360-subtitle-control';
    applyControlRootStyles(controlRoot);

    controlButton = document.createElement('button');
    controlButton.type = 'button';
    controlButton.className = 'webgl-360-subtitle-control__button';
    controlButton.textContent = 'CC';
    controlButton.title = 'Subtitles';
    controlButton.setAttribute('aria-haspopup', 'menu');
    controlButton.setAttribute('aria-expanded', 'false');
    applyControlButtonStyles(controlButton);

    controlMenu = document.createElement('div');
    controlMenu.className = 'webgl-360-subtitle-control__menu';
    controlMenu.setAttribute('role', 'menu');
    controlMenu.hidden = true;
    applyControlMenuStyles(controlMenu);

    controlButton.addEventListener('click', () => {
      if (!controlMenu || !controlButton) {
        return;
      }
      const nextOpen = controlMenu.hidden;
      controlMenu.hidden = !nextOpen;
      controlButton.setAttribute('aria-expanded', String(nextOpen));
    });

    controlRoot.append(controlButton, controlMenu);
    updateControlState();
    return controlRoot;
  }

  function updateControlState(): void {
    if (!controlButton || !controlMenu) {
      return;
    }

    controlButton.dataset.active = enabled && Boolean(activeTrackId) ? 'true' : 'false';
    controlButton.style.color = enabled && activeTrackId
      ? 'var(--webgl-360-control-active-color, #4ade80)'
      : 'var(--webgl-360-control-color, #fff)';
    controlButton.disabled = tracks.length === 0;
    controlMenu.replaceChildren();

    const offItem = createMenuItem('Off', activeTrackId === undefined || !enabled, () => {
      enabled = false;
      activeTrackId = undefined;
      updateTrackModes();
      closeControlMenu();
    });
    controlMenu.appendChild(offItem);

    for (const track of tracks) {
      const item = createMenuItem(track.label, enabled && activeTrackId === track.id, () => {
        enabled = true;
        activeTrackId = track.id;
        updateTrackModes();
        closeControlMenu();
      });
      controlMenu.appendChild(item);
    }
  }

  function createMenuItem(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
    const item = document.createElement('button');
    item.type = 'button';
    item.role = 'menuitemradio';
    item.textContent = label;
    item.setAttribute('aria-checked', String(active));
    applyControlMenuItemStyles(item, active);
    item.addEventListener('click', onClick);
    return item;
  }

  function closeControlMenu(): void {
    if (!controlMenu || !controlButton) {
      return;
    }
    controlMenu.hidden = true;
    controlButton.setAttribute('aria-expanded', 'false');
  }
}

function getCueText(cue: TextTrackCue): string {
  return 'text' in cue && typeof cue.text === 'string' ? cue.text : '';
}

function applyOverlayStyles(overlay: HTMLDivElement): void {
  overlay.style.position = 'absolute';
  overlay.style.left = '50%';
  overlay.style.right = 'auto';
  overlay.style.bottom = 'calc(72px + env(safe-area-inset-bottom))';
  overlay.style.transform = 'translateX(-50%)';
  overlay.style.zIndex = '120';
  overlay.style.display = 'grid';
  overlay.style.justifyItems = 'center';
  overlay.style.gap = '4px';
  overlay.style.width = 'min(88%, 960px)';
  overlay.style.pointerEvents = 'none';
  overlay.style.textAlign = 'center';
  overlay.style.font = '600 clamp(14px, 2.2vw, 24px)/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  overlay.style.color = 'var(--webgl-360-subtitle-color, #fff)';
  overlay.style.textShadow = 'var(--webgl-360-subtitle-shadow, 0 2px 4px rgba(0, 0, 0, 0.8))';
}

function applyLineStyles(line: HTMLDivElement): void {
  line.style.display = 'inline-block';
  line.style.maxWidth = '100%';
  line.style.padding = '4px 8px';
  line.style.borderRadius = '4px';
  line.style.background = 'var(--webgl-360-subtitle-bg, rgba(0, 0, 0, 0.62))';
  line.style.boxDecorationBreak = 'clone';
  line.style.setProperty('-webkit-box-decoration-break', 'clone');
}

function applyControlRootStyles(root: HTMLDivElement): void {
  root.style.position = 'relative';
  root.style.display = 'inline-flex';
  root.style.pointerEvents = 'auto';
}

function applyControlButtonStyles(button: HTMLButtonElement): void {
  button.style.width = '38px';
  button.style.height = '34px';
  button.style.border = '1px solid var(--webgl-360-control-border, rgba(255, 255, 255, 0.16))';
  button.style.borderRadius = '8px';
  button.style.background = 'var(--webgl-360-control-bg, rgba(0, 0, 0, 0.62))';
  button.style.backdropFilter = 'blur(8px)';
  button.style.font = '700 12px/1 var(--webgl-360-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)';
  button.style.letterSpacing = '0';
  button.style.cursor = 'pointer';
}

function applyControlMenuStyles(menu: HTMLDivElement): void {
  menu.style.position = 'absolute';
  menu.style.top = 'calc(100% + 8px)';
  menu.style.left = '50%';
  menu.style.transform = 'translateX(-50%)';
  menu.style.minWidth = '132px';
  menu.style.padding = '6px';
  menu.style.border = '1px solid var(--webgl-360-control-border, rgba(255, 255, 255, 0.16))';
  menu.style.borderRadius = '8px';
  menu.style.background = 'var(--webgl-360-panel-bg, rgba(0, 0, 0, 0.78))';
  menu.style.backdropFilter = 'blur(10px)';
  menu.style.boxShadow = '0 12px 28px rgba(0, 0, 0, 0.34)';
}

function applyControlMenuItemStyles(item: HTMLButtonElement, active: boolean): void {
  item.style.display = 'block';
  item.style.width = '100%';
  item.style.border = 'none';
  item.style.borderRadius = '6px';
  item.style.background = active ? 'var(--webgl-360-control-active-bg, rgba(74, 222, 128, 0.18))' : 'transparent';
  item.style.color = active
    ? 'var(--webgl-360-control-active-fg, #bbf7d0)'
    : 'var(--webgl-360-control-color, #fff)';
  item.style.padding = '8px 10px';
  item.style.font = '600 12px/1.2 var(--webgl-360-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)';
  item.style.textAlign = 'left';
  item.style.cursor = 'pointer';
}

export const subtitlesPlugin = createSubtitlesPlugin;
