import React, { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ReactWebGL360Player } from '../react/ReactWebGL360Player';
import * as createPlayerMod from '../createPlayer';
import type { WebGL360Player as PlayerInstance } from '../types';

describe('ReactWebGL360Player', () => {
  const mockPlayer: PlayerInstance = {
    destroy: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    seek: vi.fn(),
    setYaw: vi.fn(),
    setPitch: vi.fn(),
    setFov: vi.fn(),
    setMotionEnabled: vi.fn().mockResolvedValue(true),
    getState: vi.fn().mockReturnValue({ mode: 'ready', yaw: 0, pitch: 0, fov: 75 }),
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
