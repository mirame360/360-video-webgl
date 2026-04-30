import { DEFAULT_COLOR_FILTERS, normalizeColorFilters } from '../colorFilters';
import type { WebGL360ColorFilters, WebGL360PluginContext, WebGL360PluginObject } from '../types';

export interface ColorGradingPluginOptions {
  filters?: WebGL360ColorFilters;
}

export interface ColorGradingPlugin extends WebGL360PluginObject {
  setFilters: (filters: WebGL360ColorFilters) => void;
  getFilters: () => Required<WebGL360ColorFilters>;
  reset: () => void;
}

export function createColorGradingPlugin(options: ColorGradingPluginOptions = {}): ColorGradingPlugin {
  let filters = normalizeColorFilters(options.filters);
  let context: WebGL360PluginContext | undefined;

  return {
    id: 'color-grading',
    install(pluginContext) {
      context = pluginContext;
      context.setColorFilters(filters);

      return () => {
        context = undefined;
      };
    },
    setFilters(nextFilters) {
      filters = normalizeColorFilters({
        ...filters,
        ...nextFilters,
      });
      context?.setColorFilters(filters);
    },
    getFilters() {
      return { ...filters };
    },
    reset() {
      filters = { ...DEFAULT_COLOR_FILTERS };
      context?.setColorFilters(filters);
    },
  };
}

export const colorGradingPlugin = createColorGradingPlugin;
