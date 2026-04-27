import { clamp } from '../config';
import type { WebGL360PlayerState } from '../types';

export interface ControlsTarget {
  getState: () => WebGL360PlayerState;
  setYaw: (yaw: number) => void;
  setPitch: (pitch: number) => void;
  setFov: (fov: number) => void;
  onClick?: (event: PointerEvent) => void;
  debug?: boolean;
}

export interface ControlsHandle {
  destroy: () => void;
}

export function createPointerControls(container: HTMLElement, target: ControlsTarget): ControlsHandle {
  let activePointerId: number | undefined;
  let lastX = 0;
  let lastY = 0;
  let startX = 0;
  let startY = 0;
  let didMove = false;

  const handlePointerDown = (event: PointerEvent): void => {
    if (target.debug) {
      console.info(`WebGL360Player Debug: Touch start at (${event.clientX}, ${event.clientY})`, {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
      });
    }
    activePointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    startX = event.clientX;
    startY = event.clientY;
    didMove = false;
    container.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (activePointerId !== event.pointerId) {
      return;
    }

    const dist = Math.sqrt(
      Math.pow(event.clientX - startX, 2) + Math.pow(event.clientY - startY, 2)
    );
    
    // Threshold of 5 pixels to differentiate click from drag
    if (dist > 5) {
      didMove = true;
    }

    if (target.debug) {
      console.info(`WebGL360Player Debug: Touch move at (${event.clientX}, ${event.clientY}), didMove: ${didMove}`);
    }

    const deltaX = event.clientX - lastX;
    const deltaY = event.clientY - lastY;
    const state = target.getState();

    // Increased sensitivity for better navigation
    target.setYaw(state.yaw - deltaX * 0.25);
    target.setPitch(clamp(state.pitch + deltaY * 0.25, -89, 89));
    lastX = event.clientX;
    lastY = event.clientY;
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (activePointerId === event.pointerId) {
      if (target.debug) {
        console.info(`WebGL360Player Debug: Touch end at (${event.clientX}, ${event.clientY}), didMove: ${didMove}`);
      }
      
      // If we didn't move significantly, treat it as a click
      if (!didMove) {
        target.onClick?.(event);
      }
      
      activePointerId = undefined;
    }
  };

  const handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const state = target.getState();
    target.setFov(state.fov + Math.sign(event.deltaY) * 4);
  };

  container.addEventListener('pointerdown', handlePointerDown);
  container.addEventListener('pointermove', handlePointerMove);
  container.addEventListener('pointerup', handlePointerUp);
  container.addEventListener('pointercancel', handlePointerUp);
  container.addEventListener('wheel', handleWheel, { passive: false });

  return {
    destroy() {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerUp);
      container.removeEventListener('wheel', handleWheel);
    },
  };
}
