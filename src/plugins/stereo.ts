import type { WebGL360PluginCleanup, WebGL360PluginContext, WebGL360PluginObject } from '../types';

export interface StereoPluginOptions {
  enabled?: boolean;
  controls?: boolean;
  eyeYawOffset?: number;
  buttonLabel?: string;
  className?: string;
  requestFullscreen?: boolean;
}

export interface StereoPlugin extends WebGL360PluginObject {
  setEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
  toggle: () => void;
}

const ROOT_CLASS = 'webgl-360-stereo-control';

export function createStereoPlugin(options: StereoPluginOptions = {}): StereoPlugin {
  let context: WebGL360PluginContext | undefined;
  let enabled = options.enabled ?? false;
  let button: HTMLButtonElement | undefined;

  const sync = (): void => {
    context?.setStereoMode({
      enabled,
      eyeYawOffset: options.eyeYawOffset,
    });

    if (button) {
      button.dataset.active = enabled ? 'true' : 'false';
      button.style.color = enabled ? '#4ade80' : '#fff';
      button.setAttribute('aria-pressed', String(enabled));
    }
  };

  return {
    id: 'stereo',
    install(pluginContext) {
      context = pluginContext;
      const cleanups: WebGL360PluginCleanup[] = [];

      if (options.controls ?? true) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = options.className ? `${ROOT_CLASS} ${options.className}` : ROOT_CLASS;
        button.textContent = options.buttonLabel ?? 'VR';
        button.title = 'Toggle stereo view';
        button.setAttribute('aria-pressed', String(enabled));
        applyStereoButtonStyles(button);
        button.addEventListener('click', handleButtonClick);
        cleanups.push(() => button?.removeEventListener('click', handleButtonClick));
        cleanups.push(pluginContext.mountControl(button));
      }

      sync();

      return () => {
        for (const cleanup of cleanups.reverse()) {
          cleanup();
        }
        button = undefined;
        pluginContext.setStereoMode({ enabled: false });
        context = undefined;
      };
    },
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      sync();
    },
    isEnabled() {
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      sync();
    },
  };

  function handleButtonClick(): void {
    enabled = !enabled;
    sync();

    if (enabled && options.requestFullscreen) {
      void context?.container.requestFullscreen?.();
    }
  }
}

function applyStereoButtonStyles(button: HTMLButtonElement): void {
  button.style.width = '38px';
  button.style.height = '34px';
  button.style.border = '1px solid rgba(255, 255, 255, 0.16)';
  button.style.borderRadius = '8px';
  button.style.background = 'rgba(0, 0, 0, 0.62)';
  button.style.backdropFilter = 'blur(8px)';
  button.style.font = '700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  button.style.letterSpacing = '0';
  button.style.cursor = 'pointer';
}

export const stereoPlugin = createStereoPlugin;
