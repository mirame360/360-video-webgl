import type { WebGL360PluginCleanup, WebGL360PluginContext, WebGL360PluginObject } from '../types';

export interface ZoomPluginOptions {
  step?: number;
  className?: string;
}

export interface ZoomPlugin extends WebGL360PluginObject {}

const ROOT_CLASS = 'webgl-360-zoom-control';

export function createZoomPlugin(options: ZoomPluginOptions = {}): ZoomPlugin {
  let context: WebGL360PluginContext | undefined;
  let root: HTMLDivElement | undefined;
  let readout: HTMLSpanElement | undefined;
  const step = options.step ?? 5;

  const sync = (): void => {
    if (!context || !readout) {
      return;
    }
    const state = context.getState();
    const zoom = 75 / state.fov;
    readout.textContent = `${zoom.toFixed(1)}×`;
  };

  return {
    id: 'zoom',
    install(pluginContext) {
      context = pluginContext;
      const cleanups: WebGL360PluginCleanup[] = [];

      root = document.createElement('div');
      root.className = options.className ? `${ROOT_CLASS} ${options.className}` : ROOT_CLASS;
      applyRootStyles(root);

      const zoomInButton = createButton('+', 'Zoom in');
      const zoomOutButton = createButton('−', 'Zoom out');
      readout = document.createElement('span');
      readout.setAttribute('aria-live', 'polite');
      applyReadoutStyles(readout);

      const handleZoomIn = (): void => pluginContext.player.setFov(pluginContext.getState().fov - step);
      const handleZoomOut = (): void => pluginContext.player.setFov(pluginContext.getState().fov + step);
      const handleViewChange = (): void => sync();

      zoomInButton.addEventListener('click', handleZoomIn);
      zoomOutButton.addEventListener('click', handleZoomOut);
      pluginContext.on('viewchange', handleViewChange);

      root.append(zoomInButton, readout, zoomOutButton);
      cleanups.push(() => zoomInButton.removeEventListener('click', handleZoomIn));
      cleanups.push(() => zoomOutButton.removeEventListener('click', handleZoomOut));
      cleanups.push(() => pluginContext.off('viewchange', handleViewChange));
      cleanups.push(pluginContext.mountControl(root));

      sync();

      return () => {
        for (const cleanup of cleanups.reverse()) {
          cleanup();
        }
        root = undefined;
        readout = undefined;
        context = undefined;
      };
    },
  };
}

function createButton(text: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.setAttribute('aria-label', label);
  applyButtonStyles(button);
  return button;
}

function applyRootStyles(root: HTMLDivElement): void {
  root.style.display = 'inline-flex';
  root.style.alignItems = 'center';
  root.style.gap = '2px';
  root.style.padding = '3px';
  root.style.border = '1px solid rgba(255, 255, 255, 0.35)';
  root.style.borderRadius = '8px';
  root.style.background = 'rgba(0, 0, 0, 0.6)';
  root.style.color = '#fff';
}

function applyButtonStyles(button: HTMLButtonElement): void {
  button.style.appearance = 'none';
  button.style.border = 'none';
  button.style.borderRadius = '6px';
  button.style.background = 'transparent';
  button.style.color = 'inherit';
  button.style.width = '28px';
  button.style.height = '28px';
  button.style.font = '700 16px/1 var(--webgl-360-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)';
  button.style.cursor = 'pointer';
}

function applyReadoutStyles(readout: HTMLSpanElement): void {
  readout.style.minWidth = '36px';
  readout.style.textAlign = 'center';
  readout.style.font = '600 12px/1 var(--webgl-360-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)';
}

export const zoomPlugin = createZoomPlugin;
