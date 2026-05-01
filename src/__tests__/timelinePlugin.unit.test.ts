import { describe, expect, it, vi } from 'vitest';
import { createTimelinePlugin, timelinePlugin } from '../plugins/timeline';
import type { WebGL360EventMap, WebGL360EventName, WebGL360PluginContext, WebGL360PlayerState } from '../types';

type HandlerMap = {
  [Name in WebGL360EventName]?: Array<(payload: WebGL360EventMap[Name]) => void>;
};

describe('createTimelinePlugin', () => {
  it('normalizes hashmap chapters and tracks the active chapter', () => {
    const handlers: HandlerMap = {};
    const state = createState({ currentTime: 0, duration: 120 });
    const onChapterChange = vi.fn();
    const context = createContext({ handlers, state });
    const plugin = createTimelinePlugin({
      chapters: {
        middle: { time: 30, label: 'Middle' },
        intro: 0,
        invalid: Number.NaN,
      },
      onChapterChange,
    });

    const cleanup = plugin.install(context);

    expect(plugin.id).toBe('timeline');
    expect(plugin.getChapters()).toEqual([
      { id: 'intro', label: 'intro', time: 0 },
      { id: 'middle', label: 'Middle', time: 30 },
    ]);
    expect(plugin.getActiveChapter()).toEqual({ id: 'intro', label: 'intro', time: 0 });
    expect(onChapterChange).toHaveBeenCalledWith(
      { id: 'intro', label: 'intro', time: 0 },
      undefined,
    );

    state.currentTime = 45;
    emit(handlers, 'timeupdate', {
      currentTime: 45,
      duration: 120,
      state,
    });

    expect(plugin.getActiveChapter()).toEqual({ id: 'middle', label: 'Middle', time: 30 });
    expect(onChapterChange).toHaveBeenLastCalledWith(
      { id: 'middle', label: 'Middle', time: 30 },
      { id: 'intro', label: 'intro', time: 0 },
    );

    if (typeof cleanup === 'function') {
      cleanup();
    }

    expect(getHandlers(handlers, 'timeupdate')).toHaveLength(0);
    expect(plugin.getActiveChapter()).toBeUndefined();
  });

  it('updates chapters and can seek by chapter id', () => {
    const handlers: HandlerMap = {};
    const state = createState({ currentTime: 10, duration: 90 });
    const seek = vi.fn((time: number) => {
      state.currentTime = time;
    });
    const plugin = timelinePlugin({
      chapters: {
        intro: 0,
      },
    });

    plugin.install(createContext({ handlers, state, seek }));
    plugin.setChapters({
      intro: 0,
      gallery: { time: 25, label: 'Gallery' },
      rooftop: 55,
    });

    expect(plugin.seekToChapter('gallery')).toBe(true);
    expect(seek).toHaveBeenCalledWith(25);
    expect(plugin.getActiveChapter()).toEqual({ id: 'gallery', label: 'Gallery', time: 25 });
    expect(plugin.seekToChapter('missing')).toBe(false);
  });

  it('seeks to next and previous chapters', () => {
    const handlers: HandlerMap = {};
    const state = createState({ currentTime: 12, duration: 90 });
    const seek = vi.fn((time: number) => {
      state.currentTime = time;
    });
    const plugin = createTimelinePlugin({
      chapters: {
        intro: 0,
        scene: 15,
        close: 60,
      },
    });

    plugin.install(createContext({ handlers, state, seek }));

    expect(plugin.nextChapter()).toBe(true);
    expect(seek).toHaveBeenLastCalledWith(15);
    expect(plugin.previousChapter()).toBe(true);
    expect(seek).toHaveBeenLastCalledWith(0);

    state.currentTime = 60;
    expect(plugin.nextChapter()).toBe(false);
  });
});

function createContext({
  handlers,
  state,
  seek = vi.fn(),
}: {
  handlers: HandlerMap;
  state: WebGL360PlayerState;
  seek?: (time: number) => void;
}): WebGL360PluginContext {
  return {
    player: { seek },
    getState: () => state,
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
