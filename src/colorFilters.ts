import type { WebGL360ColorFilters } from './types';

export const DEFAULT_COLOR_FILTERS: Required<WebGL360ColorFilters> = {
  exposure: 0,
  brightness: 0,
  contrast: 1,
  saturation: 1,
  temperature: 0,
  tint: 0,
  vignette: 0,
};

export function normalizeColorFilters(filters: WebGL360ColorFilters = {}): Required<WebGL360ColorFilters> {
  return {
    exposure: clampFilter(filters.exposure ?? DEFAULT_COLOR_FILTERS.exposure, -2, 2),
    brightness: clampFilter(filters.brightness ?? DEFAULT_COLOR_FILTERS.brightness, -1, 1),
    contrast: clampFilter(filters.contrast ?? DEFAULT_COLOR_FILTERS.contrast, 0, 3),
    saturation: clampFilter(filters.saturation ?? DEFAULT_COLOR_FILTERS.saturation, 0, 3),
    temperature: clampFilter(filters.temperature ?? DEFAULT_COLOR_FILTERS.temperature, -1, 1),
    tint: clampFilter(filters.tint ?? DEFAULT_COLOR_FILTERS.tint, -1, 1),
    vignette: clampFilter(filters.vignette ?? DEFAULT_COLOR_FILTERS.vignette, 0, 1),
  };
}

function clampFilter(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min <= 0 && max >= 0 ? 0 : min;
  }
  return Math.min(max, Math.max(min, value));
}
