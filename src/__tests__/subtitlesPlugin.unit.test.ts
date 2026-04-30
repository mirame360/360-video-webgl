import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSubtitlesPlugin, subtitlesPlugin } from '../plugins/subtitles';
import type { WebGL360EventMap, WebGL360EventName, WebGL360PluginContext } from '../types';

type HandlerMap = {
  [Name in WebGL360EventName]?: Array<(payload: WebGL360EventMap[Name]) => void>;
};

const originalCreateElement = document.createElement.bind(document);

describe('createSubtitlesPlugin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('attaches WebVTT tracks, renders active cues, switches tracks, and cleans up', () => {
    const tracks = mockTrackElements();

    const container = document.createElement('div');
    const video = document.createElement('video');
    const handlers: HandlerMap = {};
    const emitDiagnostic = vi.fn();
    const context = createContext(container, video, handlers, emitDiagnostic);
    const plugin = createSubtitlesPlugin({
      tracks: [
        { id: 'en', src: '/subtitles-en.vtt', label: 'English', srclang: 'en', default: true },
        { id: 'es', src: '/subtitles-es.vtt', label: 'Spanish', srclang: 'es' },
      ],
    });

    const cleanup = plugin.install(context);

    expect(video.querySelectorAll('track')).toHaveLength(2);
    expect(plugin.getActiveTrack()?.id).toBe('en');
    expect(plugin.isEnabled()).toBe(true);
    expect(container.querySelector('.webgl-360-subtitle-control__button')?.textContent).toBe('CC');

    const englishTrack = Array.from(tracks.values())[0];
    englishTrack.activeCues = createCueList([{ text: 'Hello from WebGL subtitles' } as VTTCue]);
    englishTrack.dispatchEvent(new Event('cuechange'));

    expect(container.querySelector('.webgl-360-subtitles')?.textContent).toBe('Hello from WebGL subtitles');

    plugin.setTrack('es');

    expect(Array.from(tracks.values())[0].mode).toBe('disabled');
    expect(Array.from(tracks.values())[1].mode).toBe('hidden');

    plugin.setEnabled(false);

    expect(container.querySelector<HTMLElement>('.webgl-360-subtitles')?.hidden).toBe(true);

    plugin.setTrack('missing');

    expect(emitDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      type: 'plugin_error',
      reason: 'subtitle_track_missing',
    }));

    if (typeof cleanup === 'function') {
      cleanup();
    }

    expect(video.querySelectorAll('track')).toHaveLength(0);
    expect(container.querySelector('.webgl-360-subtitles')).toBeNull();
    expect(container.querySelector('.webgl-360-subtitle-control')).toBeNull();
  });

  it('attaches when the player video becomes available later', () => {
    mockTrackElements();
    const videoRef: { current?: HTMLVideoElement } = {};
    const container = document.createElement('div');
    const handlers: HandlerMap = {};
    const context = createContext(container, undefined, handlers);
    context.getVideo = () => videoRef.current;
    const plugin = createSubtitlesPlugin({
      tracks: [{ id: 'en', src: '/subtitles-en.vtt', label: 'English', srclang: 'en' }],
    });

    const cleanup = plugin.install(context);

    expect(container.querySelector('.webgl-360-subtitles')).not.toBeNull();

    videoRef.current = document.createElement('video');
    emit(handlers, 'sourcechange', {
      source: { src: '/video.mp4', type: 'mp4', quality: '1080p' },
      state: {} as WebGL360EventMap['sourcechange']['state'],
    });

    expect(videoRef.current.querySelectorAll('track')).toHaveLength(1);

    if (typeof cleanup === 'function') {
      cleanup();
    }
  });

  it('supports the factory alias and turning all tracks off', () => {
    const tracks = mockTrackElements();
    const container = document.createElement('div');
    const video = document.createElement('video');
    const handlers: HandlerMap = {};
    const context = createContext(container, video, handlers);
    const plugin = subtitlesPlugin({
      tracks: [
        { id: 'en', src: '/subtitles-en.vtt', label: 'English', srclang: 'en' },
      ],
      enabled: false,
    });

    const cleanup = plugin.install(context);

    expect(plugin.id).toBe('subtitles');
    expect(plugin.isEnabled()).toBe(false);
    expect(container.querySelector<HTMLElement>('.webgl-360-subtitles')?.hidden).toBe(true);
    expect(tracks[0].mode).toBe('disabled');

    plugin.setEnabled(true);
    plugin.setTrack(undefined);

    expect(plugin.getActiveTrack()).toBeUndefined();
    expect(tracks[0].mode).toBe('disabled');

    if (typeof cleanup === 'function') {
      cleanup();
    }
  });

  it('can disable plugin-provided controls', () => {
    mockTrackElements();
    const container = document.createElement('div');
    const video = document.createElement('video');
    const handlers: HandlerMap = {};
    const context = createContext(container, video, handlers);
    const plugin = createSubtitlesPlugin({
      tracks: [{ id: 'en', src: '/subtitles-en.vtt', label: 'English', srclang: 'en' }],
      controls: false,
    });

    const cleanup = plugin.install(context);

    expect(container.querySelector('.webgl-360-subtitle-control')).toBeNull();

    if (typeof cleanup === 'function') {
      cleanup();
    }
  });

  it('switches tracks from the plugin-provided control menu', () => {
    const tracks = mockTrackElements();
    const container = document.createElement('div');
    const video = document.createElement('video');
    const handlers: HandlerMap = {};
    const context = createContext(container, video, handlers);
    const plugin = createSubtitlesPlugin({
      tracks: [
        { id: 'en', src: '/subtitles-en.vtt', label: 'English', srclang: 'en' },
        { id: 'es', src: '/subtitles-es.vtt', label: 'Spanish', srclang: 'es' },
      ],
    });

    const cleanup = plugin.install(context);
    const button = container.querySelector<HTMLButtonElement>('.webgl-360-subtitle-control__button');

    button?.click();

    expect(button?.getAttribute('aria-expanded')).toBe('true');

    const items = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    items.find((item) => item.textContent === 'Spanish')?.click();

    expect(plugin.getActiveTrack()?.id).toBe('es');
    expect(tracks[0].mode).toBe('disabled');
    expect(tracks[1].mode).toBe('hidden');
    expect(button?.getAttribute('aria-expanded')).toBe('false');

    if (typeof cleanup === 'function') {
      cleanup();
    }
  });
});

class FakeTextTrack extends EventTarget {
  mode: TextTrackMode = 'disabled';
  activeCues: TextTrackCueList | null = null;
}

function mockTrackElements(): FakeTextTrack[] {
  const tracks: FakeTextTrack[] = [];
  vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
    const element = originalCreateElement(tagName, options);
    if (tagName.toLowerCase() === 'track') {
      const fakeTrack = new FakeTextTrack();
      Object.defineProperty(element, 'track', {
        configurable: true,
        value: fakeTrack,
      });
      tracks.push(fakeTrack);
    }
    return element;
  });
  return tracks;
}

function createCueList(cues: TextTrackCue[]): TextTrackCueList {
  return {
    length: cues.length,
    getCueById: (id: string) => cues.find((cue) => cue.id === id) ?? null,
    item: (index: number) => cues[index] ?? null,
    [Symbol.iterator]: function* iterator() {
      yield* cues;
    },
  } as unknown as TextTrackCueList;
}

function createContext(
  container: HTMLElement,
  video: HTMLVideoElement | undefined,
  handlers: HandlerMap,
  emitDiagnostic = vi.fn(),
): WebGL360PluginContext {
  return {
    container,
    getVideo: () => video,
    emitDiagnostic,
    mountControl: (element: HTMLElement) => {
      container.appendChild(element);
      return () => element.remove();
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
