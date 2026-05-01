import { describe, expect, it } from 'vitest';
import { normalizePlayerOptions, normalizeSourcePreference } from '../config';
import type { WebGL360Source } from '../types';

const sources: WebGL360Source[] = [
  {
    src: '/video-1080p.mp4',
    type: 'mp4',
    quality: '1080p',
  },
];

describe('normalizePlayerOptions', () => {
  it('applies portable defaults without Mirame360 or React assumptions', () => {
    const options = normalizePlayerOptions({ sources });

    expect(options.defaultQuality).toBeUndefined();
    expect(options.maxQuality).toBeUndefined();
    expect(options.sourcePreference).toEqual(['hls', 'mp4']);
    expect(options.projectionMode).toBe('360');
    expect(options.stereoSourceLayout).toBe('mono');
    expect(options.controls).toBe(true);
    expect(options.motionControls).toBe(true);
    expect(options.crossOrigin).toBe('anonymous');
    expect(options.plugins).toEqual([]);
    expect(options.requiredPlugins).toEqual([]);
  });

  it('preserves plugin configuration for the core player installer', () => {
    const plugin = () => undefined;
    const options = normalizePlayerOptions({
      sources,
      plugins: [plugin],
      requiredPlugins: ['captions'],
    });

    expect(options.plugins).toEqual([plugin]);
    expect(options.requiredPlugins).toEqual(['captions']);
  });

  it('rejects empty source lists', () => {
    expect(() => normalizePlayerOptions({ sources: [] })).toThrow('requires at least one source');
  });

  it('preserves advanced rendering options', () => {
    const options = normalizePlayerOptions({
      sources,
      projectionMode: '180',
      stereoSourceLayout: 'top-bottom',
    });

    expect(options.projectionMode).toBe('180');
    expect(options.stereoSourceLayout).toBe('top-bottom');
  });
});

describe('normalizeSourcePreference', () => {
  it('deduplicates and appends missing supported source types', () => {
    expect(normalizeSourcePreference(['mp4', 'mp4'])).toEqual(['mp4', 'hls']);
  });
});
