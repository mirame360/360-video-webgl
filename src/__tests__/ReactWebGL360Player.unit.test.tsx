import React, { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ReactWebGL360Player } from '../react/ReactWebGL360Player';
import * as createPlayerMod from '../createPlayer';
import type { WebGL360Player as PlayerInstance } from '../types';

describe('ReactWebGL360Player', () => {
  const mockPlayer: PlayerInstance = {
    destroy: vi.fn(),
    on: vi.fn(() => () => undefined),
    off: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    stop: vi.fn(),
    togglePlay: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn(),
    setYaw: vi.fn(),
    setPitch: vi.fn(),
    setFov: vi.fn(),
    setView: vi.fn(),
    getView: vi.fn().mockReturnValue({ yaw: 0, pitch: 0, fov: 75 }),
    setMuted: vi.fn(),
    setDebug: vi.fn(),
    setMotionEnabled: vi.fn().mockResolvedValue(true),
    setQuality: vi.fn().mockResolvedValue({ ok: true, quality: '1080p' }),
    exportConfig: vi.fn().mockReturnValue({
      view: { yaw: 0, pitch: 0, fov: 75 },
      muted: true,
      debug: false,
      motionEnabled: false,
      stereoMode: { enabled: false, eyeYawOffset: 1.5 },
      colorFilters: {
        exposure: 0,
        brightness: 1,
        contrast: 1,
        saturation: 1,
        temperature: 0,
        tint: 0,
        vignette: 0,
      },
      quality: '1080p',
    }),
    importConfig: vi.fn().mockResolvedValue(undefined),
    requestFullscreen: vi.fn().mockResolvedValue(true),
    exitFullscreen: vi.fn().mockResolvedValue(true),
    captureFrame: vi.fn().mockResolvedValue(new Blob(['frame'], { type: 'image/png' })),
    getState: vi.fn().mockReturnValue({
      mode: 'ready',
      yaw: 0,
      pitch: 0,
      fov: 75,
      availableQualities: ['1080p'],
      sourceSupport: [],
      attemptedSources: [],
      diagnostics: {
        contextLostCount: 0,
        decodedFrames: 0,
        droppedFrames: 0,
        droppedFrameRatio: 0,
        events: [],
      },
    }),
  };

  vi.spyOn(createPlayerMod, 'createWebGL360Player').mockReturnValue(mockPlayer);

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('mounts, initializes the core player, and cleans up on unmount', () => {
    const sources = [{ src: 'test.mp4', type: 'mp4' as const, quality: '1080p' }];
    const { unmount } = render(
      <ReactWebGL360Player sources={sources} initialYaw={10} />
    );

    expect(createPlayerMod.createWebGL360Player).toHaveBeenCalledOnce();
    expect(createPlayerMod.createWebGL360Player).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ sources, initialYaw: 10 })
    );

    unmount();
    expect(mockPlayer.destroy).toHaveBeenCalledOnce();
  });

  it('exposes the imperative API via ref', () => {
    const ref = createRef<PlayerInstance>();
    render(
      <ReactWebGL360Player sources={[{ src: 'test.mp4', type: 'mp4', quality: '1080p' }]} ref={ref} />
    );

    expect(ref.current).not.toBeNull();
    ref.current?.play();
    expect(mockPlayer.play).toHaveBeenCalledOnce();
    ref.current?.setView({ yaw: 15 });
    expect(mockPlayer.setView).toHaveBeenCalledWith({ yaw: 15 });
    expect(ref.current?.getView()).toEqual({ yaw: 0, pitch: 0, fov: 75 });
  });

  it('forwards event subscription methods through the imperative ref', () => {
    const ref = createRef<PlayerInstance>();
    const handler = vi.fn();
    render(
      <ReactWebGL360Player sources={[{ src: 'test.mp4', type: 'mp4', quality: '1080p' }]} ref={ref} />
    );

    const unsubscribe = ref.current?.on('ready', handler);
    ref.current?.off('ready', handler);

    expect(mockPlayer.on).toHaveBeenCalledWith('ready', handler);
    expect(mockPlayer.off).toHaveBeenCalledWith('ready', handler);
    expect(typeof unsubscribe).toBe('function');
  });

  it('syncs props to the imperative API', () => {
    const { rerender } = render(
      <ReactWebGL360Player 
        sources={[{ src: 'test.mp4', type: 'mp4', quality: '1080p' }]} 
        initialYaw={0} 
      />
    );

    rerender(
      <ReactWebGL360Player 
        sources={[{ src: 'test.mp4', type: 'mp4', quality: '1080p' }]} 
        initialYaw={45} 
      />
    );

    expect(mockPlayer.setYaw).toHaveBeenCalledWith(45);
  });
});
