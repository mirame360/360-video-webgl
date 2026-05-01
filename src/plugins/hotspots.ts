import type {
  WebGL360PluginCleanup,
  WebGL360PluginContext,
  WebGL360PluginObject,
  WebGL360ScreenPoint,
} from '../types';

export interface HotspotDefinition {
  id: string;
  yaw: number;
  pitch: number;
  startTime?: number;
  endTime?: number;
  label?: string;
  ariaLabel?: string;
  className?: string;
  element?: HTMLElement;
  render?: (hotspot: HotspotDefinition) => HTMLElement;
  onClick?: (hotspot: HotspotDefinition, event: MouseEvent) => void;
}

export interface HotspotsPluginOptions {
  hotspots: HotspotDefinition[];
  className?: string;
}

export interface HotspotsPlugin extends WebGL360PluginObject {
  setHotspots: (hotspots: HotspotDefinition[]) => void;
  getHotspots: () => HotspotDefinition[];
  refresh: () => void;
}

interface MountedHotspot {
  hotspot: HotspotDefinition;
  element: HTMLElement;
  handleClick?: (event: MouseEvent) => void;
}

const ROOT_CLASS = 'webgl-360-hotspots';
const HOTSPOT_CLASS = 'webgl-360-hotspot';

export function createHotspotsPlugin(options: HotspotsPluginOptions): HotspotsPlugin {
  let hotspots = [...options.hotspots];
  let context: WebGL360PluginContext | undefined;
  let root: HTMLDivElement | undefined;
  const mounted = new Map<string, MountedHotspot>();
  const cleanups: WebGL360PluginCleanup[] = [];

  const update = (): void => {
    if (!context || !root) {
      return;
    }

    const state = context.getState();
    for (const hotspot of hotspots) {
      const mountedHotspot = ensureMounted(hotspot);
      const point = isWithinTimeRange(hotspot, state.currentTime)
        ? context.projectYawPitchToScreen(hotspot.yaw, hotspot.pitch)
        : null;
      positionHotspot(mountedHotspot.element, point);
    }
  };

  const syncMountedHotspots = (): void => {
    const nextIds = new Set(hotspots.map((hotspot) => hotspot.id));
    for (const [id, mountedHotspot] of mounted) {
      if (!nextIds.has(id)) {
        unmountHotspot(id, mountedHotspot);
      }
    }

    for (const hotspot of hotspots) {
      ensureMounted(hotspot);
    }
    update();
  };

  return {
    id: 'hotspots',
    install(pluginContext) {
      context = pluginContext;
      root = document.createElement('div');
      root.className = options.className ? `${ROOT_CLASS} ${options.className}` : ROOT_CLASS;
      applyRootStyles(root);
      pluginContext.getOverlayRoot().appendChild(root);

      cleanups.push(pluginContext.onRenderFrame(update));
      cleanups.push(pluginContext.on('timeupdate', update));
      cleanups.push(pluginContext.on('viewchange', update));
      cleanups.push(pluginContext.on('ready', update));

      syncMountedHotspots();

      return () => {
        for (const cleanup of cleanups.splice(0).reverse()) {
          cleanup();
        }
        for (const [id, mountedHotspot] of mounted) {
          unmountHotspot(id, mountedHotspot);
        }
        root?.remove();
        root = undefined;
        context = undefined;
      };
    },
    setHotspots(nextHotspots) {
      hotspots = [...nextHotspots];
      syncMountedHotspots();
    },
    getHotspots() {
      return [...hotspots];
    },
    refresh: update,
  };

  function ensureMounted(hotspot: HotspotDefinition): MountedHotspot {
    const existing = mounted.get(hotspot.id);
    if (existing) {
      existing.hotspot = hotspot;
      if (root && !existing.element.parentElement) {
        root.appendChild(existing.element);
      }
      existing.element.className = hotspot.className ? `${HOTSPOT_CLASS} ${hotspot.className}` : HOTSPOT_CLASS;
      existing.element.setAttribute('aria-label', hotspot.ariaLabel ?? hotspot.label ?? hotspot.id);
      if (!hotspot.element && !hotspot.render && hotspot.label !== undefined) {
        existing.element.textContent = hotspot.label;
      }
      return existing;
    }

    const element = createHotspotElement(hotspot);
    let handleClick: ((event: MouseEvent) => void) | undefined;
    if (hotspot.onClick) {
      handleClick = (event) => hotspot.onClick?.(hotspot, event);
      element.addEventListener('click', handleClick);
    }
    root?.appendChild(element);

    const mountedHotspot = { hotspot, element, handleClick };
    mounted.set(hotspot.id, mountedHotspot);
    return mountedHotspot;
  }

  function unmountHotspot(id: string, mountedHotspot: MountedHotspot): void {
    if (mountedHotspot.handleClick) {
      mountedHotspot.element.removeEventListener('click', mountedHotspot.handleClick);
    }
    mountedHotspot.element.remove();
    mounted.delete(id);
  }
}

function createHotspotElement(hotspot: HotspotDefinition): HTMLElement {
  const element = hotspot.element ?? hotspot.render?.(hotspot) ?? document.createElement('button');
  element.className = hotspot.className ? `${HOTSPOT_CLASS} ${hotspot.className}` : HOTSPOT_CLASS;
  element.dataset.hotspotId = hotspot.id;
  element.setAttribute('aria-label', hotspot.ariaLabel ?? hotspot.label ?? hotspot.id);

  if (element instanceof HTMLButtonElement) {
    element.type = 'button';
  }
  if (!hotspot.element && !hotspot.render) {
    element.textContent = hotspot.label ?? '';
  }

  applyHotspotStyles(element);
  return element;
}

function isWithinTimeRange(hotspot: HotspotDefinition, currentTime: number): boolean {
  return (hotspot.startTime === undefined || currentTime >= hotspot.startTime)
    && (hotspot.endTime === undefined || currentTime <= hotspot.endTime);
}

function positionHotspot(element: HTMLElement, point: WebGL360ScreenPoint | null): void {
  element.hidden = point === null;
  if (!point) {
    return;
  }

  element.style.left = `${point.x}px`;
  element.style.top = `${point.y}px`;
}

function applyRootStyles(root: HTMLElement): void {
  root.style.position = 'absolute';
  root.style.inset = '0';
  root.style.pointerEvents = 'none';
}

function applyHotspotStyles(element: HTMLElement): void {
  element.style.position = 'absolute';
  element.style.transform = 'translate(-50%, -50%)';
  element.style.pointerEvents = 'auto';
  element.style.border = '1px solid var(--webgl-360-hotspot-border, rgba(255, 255, 255, 0.7))';
  element.style.borderRadius = '999px';
  element.style.background = 'var(--webgl-360-hotspot-bg, var(--webgl-360-control-bg, rgba(0, 0, 0, 0.62)))';
  element.style.color = 'var(--webgl-360-hotspot-color, var(--webgl-360-control-color, #fff))';
  element.style.padding = '6px 10px';
  element.style.font = '600 12px/1 var(--webgl-360-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)';
  element.style.cursor = 'pointer';
}

export const hotspotsPlugin = createHotspotsPlugin;
