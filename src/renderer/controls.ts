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
  const activePointers = new Map<number, { x: number; y: number }>();
  let lastX = 0;
  let lastY = 0;
  let startX = 0;
  let startY = 0;
  let didMove = false;
  let initialPinchDist = 0;
  let initialFov = 0;

  const getPinchDist = (): number => {
    const points = Array.from(activePointers.values());
    if (points.length < 2) return 0;
    return Math.sqrt(
      Math.pow(points[0].x - points[1].x, 2) + Math.pow(points[0].y - points[1].y, 2)
    );
  };

  const handlePointerDown = (event: PointerEvent): void => {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    
    if (activePointers.size === 1) {
      lastX = event.clientX;
      lastY = event.clientY;
      startX = event.clientX;
      startY = event.clientY;
      didMove = false;
    } else if (activePointers.size === 2) {
      initialPinchDist = getPinchDist();
      initialFov = target.getState().fov;
    }
    
    container.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size === 1) {
      const dist = Math.sqrt(
        Math.pow(event.clientX - startX, 2) + Math.pow(event.clientY - startY, 2)
      );
      
      if (dist > 5) didMove = true;

      const deltaX = event.clientX - lastX;
      const deltaY = event.clientY - lastY;
      const state = target.getState();

      target.setYaw(state.yaw - deltaX * 0.25);
      target.setPitch(clamp(state.pitch + deltaY * 0.25, -89, 89));
      lastX = event.clientX;
      lastY = event.clientY;
    } else if (activePointers.size === 2) {
      didMove = true; // Any pinch is a move
      const currentDist = getPinchDist();
      if (initialPinchDist > 0 && currentDist > 0) {
        const ratio = initialPinchDist / currentDist;
        target.setFov(initialFov * ratio);
      }
    }
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (activePointers.has(event.pointerId)) {
      if (activePointers.size === 1 && !didMove) {
        target.onClick?.(event);
      }
      activePointers.delete(event.pointerId);
      
      if (activePointers.size === 1) {
        // Reset lastX/lastY to the remaining pointer to prevent jumps
        const remaining = Array.from(activePointers.values())[0];
        lastX = remaining.x;
        lastY = remaining.y;
      }
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
