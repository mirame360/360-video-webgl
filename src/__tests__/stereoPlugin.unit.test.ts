import { describe, expect, it, vi } from 'vitest';
import { createStereoPlugin, stereoPlugin } from '../plugins/stereo';
import type { WebGL360PluginContext, WebGL360StereoMode } from '../types';

describe('createStereoPlugin', () => {
  it('toggles stereo mode through plugin API and control button', () => {
    let stereoMode: Required<WebGL360StereoMode> = {
      enabled: false,
      eyeYawOffset: 1.5,
    };
    const container = document.createElement('div');
    const setStereoMode = vi.fn((mode: WebGL360StereoMode) => {
      stereoMode = {
        enabled: mode.enabled,
        eyeYawOffset: mode.eyeYawOffset ?? stereoMode.eyeYawOffset,
      };
    });
    const context = createContext(container, setStereoMode, () => stereoMode);
    const plugin = createStereoPlugin({
      eyeYawOffset: 2,
    });

    const cleanup = plugin.install(context);
    const button = container.querySelector<HTMLButtonElement>('.webgl-360-stereo-control');

    expect(plugin.id).toBe('stereo');
    expect(setStereoMode).toHaveBeenLastCalledWith({ enabled: false, eyeYawOffset: 2 });
    expect(button?.textContent).toBe('VR');

    button?.click();

    expect(plugin.isEnabled()).toBe(true);
    expect(setStereoMode).toHaveBeenLastCalledWith({ enabled: true, eyeYawOffset: 2 });
    expect(button?.getAttribute('aria-pressed')).toBe('true');

    plugin.setEnabled(false);

    expect(stereoMode.enabled).toBe(false);

    if (typeof cleanup === 'function') {
      cleanup();
    }

    expect(container.querySelector('.webgl-360-stereo-control')).toBeNull();
    expect(setStereoMode).toHaveBeenLastCalledWith({ enabled: false });
  });

  it('supports the factory alias and disabled controls', () => {
    const container = document.createElement('div');
    const setStereoMode = vi.fn();
    const context = createContext(container, setStereoMode);
    const plugin = stereoPlugin({
      enabled: true,
      controls: false,
    });

    const cleanup = plugin.install(context);

    expect(container.querySelector('.webgl-360-stereo-control')).toBeNull();
    expect(setStereoMode).toHaveBeenCalledWith({ enabled: true, eyeYawOffset: undefined });

    plugin.toggle();

    expect(plugin.isEnabled()).toBe(false);

    if (typeof cleanup === 'function') {
      cleanup();
    }
  });
});

function createContext(
  container: HTMLElement,
  setStereoMode: (mode: WebGL360StereoMode) => void,
  getStereoMode = () => ({ enabled: false, eyeYawOffset: 1.5 }),
): WebGL360PluginContext {
  return {
    container,
    setStereoMode,
    getStereoMode,
    mountControl: (element: HTMLElement) => {
      container.appendChild(element);
      return () => element.remove();
    },
  } as unknown as WebGL360PluginContext;
}
