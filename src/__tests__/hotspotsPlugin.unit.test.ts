import { describe, expect, it, vi } from 'vitest';
import { createHotspotsPlugin, hotspotsPlugin } from '../plugins/hotspots';
import type { WebGL360EventMap, WebGL360EventName, WebGL360PluginContext, WebGL360PlayerState } from '../types';

type HandlerMap = {
  [Name in WebGL360EventName]?: Array<(payload: WebGL360EventMap[Name]) => void>;
};

describe('createHotspotsPlugin', () => {
  it('projects visible hotspots into the overlay and cleans up', () => {
    const container = document.createElement('div');
    const overlayRoot = document.createElement('div');
    const handlers: HandlerMap = {};
    const renderFrameCallbacks: Array<(delta: number) => void> = [];
    const state = createState({ currentTime: 4 });
    const handleClick = vi.fn();
    const context = createContext({
      container,
      overlayRoot,
      handlers,
      renderFrameCallbacks,
      state,
      projectYawPitchToScreen: vi.fn((yaw: number) => (
        yaw === 10 ? { x: 120, y: 80 } : null
      )),
    });
    const plugin = createHotspotsPlugin({
      hotspots: [
        { id: 'intro', yaw: 10, pitch: 5, label: 'Intro', startTime: 0, endTime: 10, onClick: handleClick },
        { id: 'later', yaw: 30, pitch: 0, label: 'Later', startTime: 20 },
      ],
    });

    const cleanup = plugin.install(context);
    renderFrameCallbacks[0]?.(0.016);

    const intro = overlayRoot.querySelector<HTMLElement>('[data-hotspot-id="intro"]');
    const later = overlayRoot.querySelector<HTMLElement>('[data-hotspot-id="later"]');

    expect(plugin.id).toBe('hotspots');
    expect(intro?.hidden).toBe(false);
    expect(intro?.style.left).toBe('120px');
    expect(intro?.style.top).toBe('80px');
    expect(later?.hidden).toBe(true);

    intro?.click();
    expect(handleClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'intro' }), expect.any(MouseEvent));

    if (typeof cleanup === 'function') {
      cleanup();
    }

    expect(overlayRoot.querySelector('.webgl-360-hotspots')).toBeNull();
    expect(renderFrameCallbacks).toHaveLength(0);
  });

  it('updates hotspot definitions and visibility on player events', () => {
    const container = document.createElement('div');
    const overlayRoot = document.createElement('div');
    const handlers: HandlerMap = {};
    const state = createState({ currentTime: 0 });
    const context = createContext({
      container,
      overlayRoot,
      handlers,
      state,
      projectYawPitchToScreen: vi.fn(() => ({ x: 12, y: 24 })),
    });
    const plugin = hotspotsPlugin({
      hotspots: [{ id: 'one', yaw: 0, pitch: 0, label: 'One', endTime: 5 }],
    });

    plugin.install(context);

    expect(overlayRoot.querySelector('[data-hotspot-id="one"]')).not.toBeNull();

    plugin.setHotspots([{ id: 'two', yaw: 4, pitch: 2, label: 'Two', startTime: 10 }]);

    expect(overlayRoot.querySelector('[data-hotspot-id="one"]')).toBeNull();
    expect(overlayRoot.querySelector<HTMLElement>('[data-hotspot-id="two"]')?.hidden).toBe(true);

    state.currentTime = 12;
    emit(handlers, 'timeupdate', {
      currentTime: 12,
      duration: 20,
      state,
    });

    const two = overlayRoot.querySelector<HTMLElement>('[data-hotspot-id="two"]');
    expect(two?.hidden).toBe(false);
    expect(two?.style.left).toBe('12px');
    expect(two?.style.top).toBe('24px');
  });
});

function createContext({
  container,
  overlayRoot,
  handlers,
  renderFrameCallbacks = [],
  state,
  projectYawPitchToScreen,
}: {
  container: HTMLElement;
  overlayRoot: HTMLElement;
  handlers: HandlerMap;
  renderFrameCallbacks?: Array<(delta: number) => void>;
  state: WebGL360PlayerState;
  projectYawPitchToScreen: (yaw: number, pitch: number) => { x: number; y: number } | null;
}): WebGL360PluginContext {
  return {
    container,
    getState: () => state,
    projectYawPitchToScreen,
    getOverlayRoot: () => overlayRoot,
    onRenderFrame: (callback: (delta: number) => void) => {
      renderFrameCallbacks.push(callback);
      return () => {
        const index = renderFrameCallbacks.indexOf(callback);
        if (index !== -1) {
          renderFrameCallbacks.splice(index, 1);
        }
      };
    },
    on: <Name extends WebGL360EventName>(
      event: Name,
      handler: (payload: WebGL360EventMap[Name]) => void,
    ) => {
      const eventHandlers = getHandlers(handlers, event);
      eventHandlers.push(handler);
      setHandlers(handlers, event, eventHandlers);
      return () => {
        const nextHandlers = getHandlers(handlers, event).filter((candidate) => candidate !== handler);
        setHandlers(handlers, event, nextHandlers);
      };
    },
  } as unknown as WebGL360PluginContext;
}

function createState(overrides: Partial<WebGL360PlayerState>): WebGL360PlayerState {
  return {
    mode: 'ready',
    stage: 'main',
    yaw: 0,
    pitch: 0,
    fov: 75,
    currentTime: 0,
    duration: 0,
    fps: 0,
    bitrate: 0,
    isMotionEnabled: false,
    isMuted: true,
    isPaused: true,
    isLooping: false,
    isDebug: false,
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
    ...overrides,
  };
}

function emit<Name extends WebGL360EventName>(
  handlers: HandlerMap,
  event: Name,
  payload: WebGL360EventMap[Name],
): void {
  for (const handler of getHandlers(handlers, event)) {
    handler(payload);
  }
}

function getHandlers<Name extends WebGL360EventName>(
  handlers: HandlerMap,
  event: Name,
): Array<(payload: WebGL360EventMap[Name]) => void> {
  return (handlers[event] ?? []) as Array<(payload: WebGL360EventMap[Name]) => void>;
}

function setHandlers<Name extends WebGL360EventName>(
  handlers: HandlerMap,
  event: Name,
  eventHandlers: Array<(payload: WebGL360EventMap[Name]) => void>,
): void {
  handlers[event] = eventHandlers as HandlerMap[Name];
}
