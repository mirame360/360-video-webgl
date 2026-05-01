import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { createWebGL360Player } from '../createPlayer';
import type { WebGL360Player as PlayerInstance, WebGL360PlayerOptions } from '../types';

export interface ReactWebGL360PlayerProps extends WebGL360PlayerOptions {
  /**
   * Optional CSS class for the container div.
   */
  className?: string;
  /**
   * Optional inline styles for the container div.
   */
  style?: React.CSSProperties;
}

/**
 * React wrapper for the WebGL 360 Video Player.
 * 
 * This component initializes the imperative WebGL player in a div container
 * and ensures proper cleanup on unmount.
 * 
 * Access the imperative API (play, pause, seek, etc.) using a ref.
 * 
 * @example
 * ```tsx
 * const playerRef = useRef<WebGL360Player>(null);
 * <ReactWebGL360Player ref={playerRef} sources={sources} />
 * ```
 */
export const ReactWebGL360Player = forwardRef<PlayerInstance, ReactWebGL360PlayerProps>((props, ref) => {
  const { className, style, ...playerOptions } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerInstance | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const player = createWebGL360Player(containerRef.current, playerOptions);
    playerRef.current = player;

    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!playerRef.current) return;
    if (props.initialYaw !== undefined) playerRef.current.setYaw(props.initialYaw);
  }, [props.initialYaw]);

  useEffect(() => {
    if (!playerRef.current) return;
    if (props.initialPitch !== undefined) playerRef.current.setPitch(props.initialPitch);
  }, [props.initialPitch]);

  useEffect(() => {
    if (!playerRef.current) return;
    if (props.initialFov !== undefined) playerRef.current.setFov(props.initialFov);
  }, [props.initialFov]);

  useEffect(() => {
    if (!playerRef.current) return;
    if (props.muted !== undefined) playerRef.current.setMuted(props.muted);
  }, [props.muted]);

  useEffect(() => {
    if (!playerRef.current) return;
    if (props.debug !== undefined) playerRef.current.setDebug(props.debug);
  }, [props.debug]);

  useImperativeHandle(ref, () => {
    return {
      on: (event, handler) => playerRef.current?.on(event, handler) ?? (() => undefined),
      off: (event, handler) => playerRef.current?.off(event, handler),
      play: () => playerRef.current?.play() ?? Promise.resolve(),
      pause: () => playerRef.current?.pause(),
      stop: () => playerRef.current?.stop(),
      togglePlay: () => playerRef.current?.togglePlay() ?? Promise.resolve(),
      seek: (time: number) => playerRef.current?.seek(time),
      setYaw: (yaw: number) => playerRef.current?.setYaw(yaw),
      setPitch: (pitch: number) => playerRef.current?.setPitch(pitch),
      setFov: (fov: number) => playerRef.current?.setFov(fov),
      setView: (view) => playerRef.current?.setView(view),
      getView: () => {
        if (!playerRef.current) {
          throw new Error('WebGL360Player is not initialized.');
        }

        return playerRef.current.getView();
      },
      setMuted: (muted: boolean) => playerRef.current?.setMuted(muted),
      setDebug: (enabled: boolean) => playerRef.current?.setDebug(enabled),
      setMotionEnabled: (enabled: boolean) => playerRef.current?.setMotionEnabled(enabled) ?? Promise.resolve(false),
      setQuality: (quality) => playerRef.current?.setQuality(quality) ?? Promise.resolve({ ok: false, quality, reason: 'player is not ready' }),
      exportConfig: () => {
        if (!playerRef.current) {
          throw new Error('WebGL360Player is not initialized.');
        }

        return playerRef.current.exportConfig();
      },
      importConfig: (config) => playerRef.current?.importConfig(config) ?? Promise.resolve(),
      requestFullscreen: () => playerRef.current?.requestFullscreen() ?? Promise.resolve(false),
      exitFullscreen: () => playerRef.current?.exitFullscreen() ?? Promise.resolve(false),
      captureFrame: (options) => {
        if (!playerRef.current) {
          return Promise.reject(new Error('WebGL360Player is not initialized.'));
        }

        return playerRef.current.captureFrame(options);
      },
      getState: () => {
        if (!playerRef.current) {
          throw new Error('WebGL360Player is not initialized.');
        }

        return playerRef.current.getState();
      },
      destroy: () => playerRef.current?.destroy(),
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className={className} 
      style={{ 
        position: 'relative', 
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        ...style 
      }} 
    />
  );
});

ReactWebGL360Player.displayName = 'ReactWebGL360Player';
