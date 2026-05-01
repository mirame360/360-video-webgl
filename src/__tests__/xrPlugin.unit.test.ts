import { afterEach, describe, expect, it, vi } from 'vitest';
import { createXRPlugin, xrPlugin } from '../plugins/xr';
import type { WebGL360PluginContext } from '../types';

describe('createXRPlugin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    setNavigatorXR(undefined);
  });

  it('mounts a control and cleans it up', async () => {
    setNavigatorXR(createNavigatorXR());
    const container = document.createElement('div');
    const plugin = xrPlugin();
    const cleanup = plugin.install(createContext(container));

    await vi.waitFor(() => expect(plugin.isSupported()).toBe(true));

    expect(plugin.id).toBe('xr');
    expect(container.querySelector('.webgl-360-xr-control')?.textContent).toBe('Enter VR');

    if (typeof cleanup === 'function') {
      cleanup();
    }

    expect(container.querySelector('.webgl-360-xr-control')).toBeNull();
  });

  it('disables the control when WebXR is unavailable', () => {
    setNavigatorXR(undefined);
    const container = document.createElement('div');
    const plugin = createXRPlugin();

    plugin.install(createContext(container));

    const button = container.querySelector<HTMLButtonElement>('.webgl-360-xr-control');
    expect(plugin.isSupported()).toBe(false);
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toBe('VR unavailable');
  });

  it('starts and exits an immersive VR session', async () => {
    const session = new FakeXRSession();
    const xr = createNavigatorXR({ requestSession: vi.fn().mockResolvedValue(session) });
    setNavigatorXR(xr);
    const renderer = createRenderer();
    const container = document.createElement('div');
    const plugin = createXRPlugin();
    plugin.install(createContext(container, renderer));

    await vi.waitFor(() => expect(plugin.isSupported()).toBe(true));

    const button = container.querySelector<HTMLButtonElement>('.webgl-360-xr-control');
    button?.click();

    await vi.waitFor(() => expect(plugin.isActive()).toBe(true));

    expect(xr.requestSession).toHaveBeenCalledWith('immersive-vr', expect.objectContaining({
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
    }));
    expect(renderer.xr.setReferenceSpaceType).toHaveBeenCalledWith('local-floor');
    expect(renderer.xr.setSession).toHaveBeenCalledWith(session);
    expect(button?.textContent).toBe('Exit VR');

    button?.click();

    await vi.waitFor(() => expect(plugin.isActive()).toBe(false));
    expect(session.end).toHaveBeenCalledOnce();
    expect(button?.textContent).toBe('Enter VR');
  });

  it('reports a diagnostic when the renderer is not ready', async () => {
    setNavigatorXR(createNavigatorXR());
    const container = document.createElement('div');
    const emitDiagnostic = vi.fn();
    const plugin = createXRPlugin();
    plugin.install(createContext(container, undefined, emitDiagnostic));

    await vi.waitFor(() => expect(plugin.isSupported()).toBe(true));

    await expect(plugin.enter()).resolves.toBe(false);

    expect(plugin.isActive()).toBe(false);
    expect(emitDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      type: 'plugin_error',
      reason: 'xr_renderer_unavailable',
    }));
  });
});

class FakeXRSession extends EventTarget {
  end = vi.fn(async () => {
    this.dispatchEvent(new Event('end'));
  });
}

function createNavigatorXR(overrides: Partial<XRSystem> = {}): XRSystem {
  return {
    isSessionSupported: vi.fn().mockResolvedValue(true),
    requestSession: vi.fn().mockResolvedValue(new FakeXRSession()),
    ...overrides,
  } as unknown as XRSystem;
}

function createRenderer(): { xr: { setReferenceSpaceType: ReturnType<typeof vi.fn>; setSession: ReturnType<typeof vi.fn> } } {
  return {
    xr: {
      setReferenceSpaceType: vi.fn(),
      setSession: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function createContext(
  container: HTMLElement,
  renderer?: unknown,
  emitDiagnostic = vi.fn(),
): WebGL360PluginContext {
  return {
    container,
    emitDiagnostic,
    getRenderer: () => renderer,
    mountControl: (element: HTMLElement) => {
      container.appendChild(element);
      return () => element.remove();
    },
  } as unknown as WebGL360PluginContext;
}

function setNavigatorXR(xr: XRSystem | undefined): void {
  Object.defineProperty(navigator, 'xr', {
    configurable: true,
    value: xr,
  });
}
