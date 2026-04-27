import { describe, expect, it, vi } from 'vitest';
import {
  canUseNativeHls,
  getSupportedSourceTypes,
  isIPhone,
  shouldUseWebGL360Player,
  supportsMotion,
} from '../capabilities';

describe('capabilities', () => {
  it('detects motion support', () => {
    // In jsdom/node it might be undefined by default
    expect(typeof supportsMotion()).toBe('boolean');
  });

  it('detects iPhone without matching iPad or desktop Safari', () => {
    expect(isIPhone('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIPhone('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(false);
    expect(isIPhone('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15')).toBe(false);
  });

  it('detects native HLS support through video canPlayType', () => {
    const video = {
      canPlayType: vi.fn((type: string) => (type === 'application/vnd.apple.mpegurl' ? 'maybe' : '')),
    } as unknown as HTMLVideoElement;

    expect(canUseNativeHls(video)).toBe(true);
    expect(getSupportedSourceTypes(video)).toEqual(['hls']);
  });

  it('does not require an iPhone or feature flag by default', () => {
    const canvas = {
      getContext: vi.fn(() => ({})),
    };
    const documentRef = {
      createElement: vi.fn(() => canvas),
    } as unknown as Document;

    expect(shouldUseWebGL360Player({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15',
      isEligibleMedia: true,
      documentRef,
    })).toBe(true);
  });

  it('supports caller-enforced iPhone and feature flag policy', () => {
    const canvas = {
      getContext: vi.fn(() => ({})),
    };
    const documentRef = {
      createElement: vi.fn(() => canvas),
    } as unknown as Document;

    expect(shouldUseWebGL360Player({
      flags: { enabled: true },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15',
      isEligibleMedia: true,
      requireIPhone: true,
      documentRef,
    })).toBe(false);

    expect(shouldUseWebGL360Player({
      flags: { enabled: false },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      isEligibleMedia: true,
      requireIPhone: true,
      documentRef,
    })).toBe(false);
  });
});
