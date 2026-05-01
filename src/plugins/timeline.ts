import type { WebGL360PluginCleanup, WebGL360PluginContext, WebGL360PluginObject } from '../types';

export type TimelineChapterMap = Record<string, number | TimelineChapterInput>;

export interface TimelineChapterInput {
  time: number;
  label?: string;
}

export interface TimelineChapter {
  id: string;
  label: string;
  time: number;
}

export interface TimelinePluginOptions {
  chapters: TimelineChapterMap;
  onChapterChange?: (chapter: TimelineChapter | undefined, previous: TimelineChapter | undefined) => void;
}

export interface TimelinePlugin extends WebGL360PluginObject {
  setChapters: (chapters: TimelineChapterMap) => void;
  getChapters: () => TimelineChapter[];
  getActiveChapter: () => TimelineChapter | undefined;
  seekToChapter: (id: string) => boolean;
  nextChapter: () => boolean;
  previousChapter: () => boolean;
}

export function createTimelinePlugin(options: TimelinePluginOptions): TimelinePlugin {
  let context: WebGL360PluginContext | undefined;
  let chapters = normalizeChapters(options.chapters);
  let activeChapter: TimelineChapter | undefined;
  const cleanups: WebGL360PluginCleanup[] = [];

  const syncActiveChapter = (): void => {
    if (!context) {
      return;
    }

    const nextChapter = findActiveChapter(chapters, context.getState().currentTime);
    if (nextChapter?.id === activeChapter?.id) {
      return;
    }

    const previousChapter = activeChapter;
    activeChapter = nextChapter;
    options.onChapterChange?.(activeChapter, previousChapter);
  };

  const seekToChapter = (id: string): boolean => {
    const chapter = chapters.find((candidate) => candidate.id === id);
    if (!chapter || !context) {
      return false;
    }

    context.player.seek(chapter.time);
    syncActiveChapter();
    return true;
  };

  return {
    id: 'timeline',
    install(pluginContext) {
      context = pluginContext;

      cleanups.push(pluginContext.on('ready', syncActiveChapter));
      cleanups.push(pluginContext.on('timeupdate', syncActiveChapter));
      cleanups.push(pluginContext.on('seek', syncActiveChapter));

      syncActiveChapter();

      return () => {
        for (const cleanup of cleanups.splice(0).reverse()) {
          cleanup();
        }
        activeChapter = undefined;
        context = undefined;
      };
    },
    setChapters(nextChapters) {
      chapters = normalizeChapters(nextChapters);
      syncActiveChapter();
    },
    getChapters() {
      return chapters.map((chapter) => ({ ...chapter }));
    },
    getActiveChapter() {
      return activeChapter ? { ...activeChapter } : undefined;
    },
    seekToChapter,
    nextChapter() {
      if (!context || chapters.length === 0) {
        return false;
      }

      const currentTime = context.getState().currentTime;
      const nextChapter = chapters.find((chapter) => chapter.time > currentTime);
      return nextChapter ? seekToChapter(nextChapter.id) : false;
    },
    previousChapter() {
      if (!context || chapters.length === 0) {
        return false;
      }

      const currentTime = context.getState().currentTime;
      const previousChapter = [...chapters].reverse().find((chapter) => chapter.time < currentTime);
      return previousChapter ? seekToChapter(previousChapter.id) : false;
    },
  };
}

function normalizeChapters(chapterMap: TimelineChapterMap): TimelineChapter[] {
  return Object.entries(chapterMap)
    .map(([id, value]) => {
      const chapter = typeof value === 'number'
        ? { time: value }
        : value;

      return {
        id,
        label: chapter.label ?? id,
        time: chapter.time,
      };
    })
    .filter((chapter) => Number.isFinite(chapter.time) && chapter.time >= 0)
    .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

function findActiveChapter(
  chapters: TimelineChapter[],
  currentTime: number,
): TimelineChapter | undefined {
  let activeChapter: TimelineChapter | undefined;

  for (const chapter of chapters) {
    if (chapter.time > currentTime) {
      break;
    }
    activeChapter = chapter;
  }

  return activeChapter;
}

export const timelinePlugin = createTimelinePlugin;
