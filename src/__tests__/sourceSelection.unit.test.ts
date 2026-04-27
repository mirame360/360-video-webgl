import { describe, expect, it } from 'vitest';
import {
  buildSourceCandidateQueue,
  compareQuality,
  getQualityRank,
  selectInitialSource,
} from '../sourceSelection';
import type { WebGL360Source } from '../types';

const sources: WebGL360Source[] = [
  {
    src: '/video-720p.m3u8',
    type: 'hls',
    quality: '720p',
  },
  {
    src: '/video-720p.mp4',
    type: 'mp4',
    quality: '720p',
  },
  {
    src: '/video-1080p.m3u8',
    type: 'hls',
    quality: '1080p',
  },
  {
    src: '/video-1080p.mp4',
    type: 'mp4',
    quality: '1080p',
  },
  {
    src: '/video-2k.mp4',
    type: 'mp4',
    quality: '2k',
  },
];

describe('source selection', () => {
  it('defaults to the highest available quality when no default or ceiling is configured', () => {
    const result = selectInitialSource(sources, {
      sourcePreference: ['hls', 'mp4'],
      supportedTypes: ['hls', 'mp4'],
    });

    expect(result.selectedSource?.src).toBe('/video-2k.mp4');
  });

  it('selects the configured default quality with HLS-first ordering by default', () => {
    const result = selectInitialSource(sources, {
      defaultQuality: '1080p',
      maxQuality: '1080p',
      sourcePreference: ['hls', 'mp4'],
      supportedTypes: ['hls', 'mp4'],
    });

    expect(result.selectedSource?.src).toBe('/video-1080p.m3u8');
    expect(result.candidates.map((source) => source.src)).toEqual([
      '/video-1080p.m3u8',
      '/video-1080p.mp4',
      '/video-720p.m3u8',
      '/video-720p.mp4',
    ]);
  });

  it('supports MP4-first ordering without changing source data', () => {
    const queue = buildSourceCandidateQueue(sources, {
      defaultQuality: '1080p',
      maxQuality: '1080p',
      sourcePreference: ['mp4', 'hls'],
      supportedTypes: ['hls', 'mp4'],
    });

    expect(queue.map((source) => source.src)).toEqual([
      '/video-1080p.mp4',
      '/video-1080p.m3u8',
      '/video-720p.mp4',
      '/video-720p.m3u8',
    ]);
  });

  it('falls back to the next lower quality when the default quality is unavailable', () => {
    const queue = buildSourceCandidateQueue(sources, {
      defaultQuality: '1440p',
      maxQuality: '1440p',
      sourcePreference: ['hls', 'mp4'],
      supportedTypes: ['hls', 'mp4'],
    });

    expect(queue[0]?.quality).toBe('1080p');
  });

  it('enforces maxQuality as a hard ceiling', () => {
    const queue = buildSourceCandidateQueue(sources, {
      defaultQuality: '2k',
      maxQuality: '1080p',
      sourcePreference: ['mp4', 'hls'],
      supportedTypes: ['hls', 'mp4'],
    });

    expect(queue.some((source) => source.quality === '2k')).toBe(false);
    expect(queue[0]?.quality).toBe('1080p');
  });

  it('can use a maxQuality ceiling without a default quality preference', () => {
    const queue = buildSourceCandidateQueue(sources, {
      maxQuality: '1080p',
      sourcePreference: ['hls', 'mp4'],
      supportedTypes: ['hls', 'mp4'],
    });

    expect(queue[0]?.quality).toBe('1080p');
    expect(queue.some((source) => source.quality === '2k')).toBe(false);
  });
});

describe('quality ranking', () => {
  it('ranks p and k quality labels', () => {
    expect(getQualityRank('720p')).toBe(720);
    expect(getQualityRank('2k')).toBe(2000);
    expect(compareQuality('1080p', '720p')).toBeGreaterThan(0);
  });
});
