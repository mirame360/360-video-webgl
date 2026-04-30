import { describe, expect, it, vi } from 'vitest';
import { normalizeColorFilters } from '../colorFilters';
import { colorGradingPlugin, createColorGradingPlugin } from '../plugins/colorGrading';
import type { WebGL360PluginContext } from '../types';

describe('normalizeColorFilters', () => {
  it('applies defaults and clamps unsafe values', () => {
    expect(normalizeColorFilters({
      exposure: 9,
      brightness: -9,
      contrast: 9,
      saturation: Number.NaN,
      temperature: -9,
      tint: 9,
      vignette: 9,
    })).toEqual({
      exposure: 2,
      brightness: -1,
      contrast: 3,
      saturation: 0,
      temperature: -1,
      tint: 1,
      vignette: 1,
    });
  });
});

describe('createColorGradingPlugin', () => {
  it('installs, updates, resets, and detaches from the player context', () => {
    const setColorFilters = vi.fn();
    const context = {
      setColorFilters,
    } as unknown as WebGL360PluginContext;
    const plugin = createColorGradingPlugin({
      filters: {
        exposure: 0.2,
      },
    });

    const cleanup = plugin.install(context);

    expect(setColorFilters).toHaveBeenCalledWith(expect.objectContaining({ exposure: 0.2 }));

    plugin.setFilters({ contrast: 1.4 });
    expect(setColorFilters).toHaveBeenLastCalledWith(expect.objectContaining({
      exposure: 0.2,
      contrast: 1.4,
    }));

    plugin.reset();
    expect(plugin.getFilters()).toEqual({
      exposure: 0,
      brightness: 0,
      contrast: 1,
      saturation: 1,
      temperature: 0,
      tint: 0,
      vignette: 0,
    });

    expect(typeof cleanup).toBe('function');
    if (typeof cleanup === 'function') {
      cleanup();
    }

    setColorFilters.mockClear();
    plugin.setFilters({ brightness: 0.1 });
    expect(setColorFilters).not.toHaveBeenCalled();
  });

  it('exposes a factory alias and clamps updates without requiring an installed player', () => {
    const plugin = colorGradingPlugin({
      filters: {
        brightness: 0.2,
      },
    });

    plugin.setFilters({
      exposure: 99,
      contrast: -1,
      saturation: 2,
    });

    expect(plugin.id).toBe('color-grading');
    expect(plugin.getFilters()).toEqual(expect.objectContaining({
      brightness: 0.2,
      exposure: 2,
      contrast: 0,
      saturation: 2,
    }));
  });
});
