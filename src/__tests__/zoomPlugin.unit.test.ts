import { describe, expect, it, vi } from 'vitest';
import { createZoomPlugin } from '../plugins/zoom';
import type { WebGL360PluginContext, WebGL360PlayerState } from '../types';

describe('zoom plugin', () => {
  it('mounts zoom controls and updates the player fov', async () => {
    const state = { fov: 75 } as WebGL360PlayerState;
    const handlers = new Map<string, Function>();
    const mounted: HTMLElement[] = [];
    const setFov = vi.fn((fov: number) => {
      state.fov = fov;
    });
    const context = {
      player: { setFov },
      getState: () => state,
      on: vi.fn((event: string, handler: Function) => handlers.set(event, handler)),
      off: vi.fn(),
      mountControl: vi.fn((element: HTMLElement) => {
        mounted.push(element);
        return () => element.remove();
      }),
    } as unknown as WebGL360PluginContext;

    await createZoomPlugin().install(context);

    expect(mounted).toHaveLength(1);
    expect(mounted[0].textContent).toBe('+1.0×−');

    mounted[0].querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')?.click();
    expect(setFov).toHaveBeenCalledWith(70);

    handlers.get('viewchange')?.();
    expect(mounted[0].textContent).toBe('+1.1×−');
  });
});
