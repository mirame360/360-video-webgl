import { describe, expect, it } from 'vitest';
import { createWatermarkPlugin, watermarkPlugin } from '../plugins/watermark';
import type { WebGL360PluginContext } from '../types';

describe('createWatermarkPlugin', () => {
  it('renders a clickable powered-by watermark and cleans up', () => {
    const container = document.createElement('div');
    const plugin = createWatermarkPlugin({
      text: 'Mirame360',
      href: 'https://mirame360.com',
      poweredBy: true,
      position: 'bottom-right',
    });

    const cleanup = plugin.install({ container } as unknown as WebGL360PluginContext);
    const element = container.querySelector<HTMLAnchorElement>('.webgl-360-watermark');

    expect(element?.textContent).toBe('Powered by Mirame360');
    expect(element?.href).toBe('https://mirame360.com/');
    expect(element?.dataset.position).toBe('bottom-right');

    plugin.setText('New Brand');
    plugin.setPosition('top-left');

    expect(plugin.getElement()?.textContent).toBe('New Brand');
    expect(plugin.getElement()?.dataset.position).toBe('top-left');

    if (typeof cleanup === 'function') {
      cleanup();
    }

    expect(container.querySelector('.webgl-360-watermark')).toBeNull();
  });

  it('supports the factory alias and switching between plain text and link rendering', () => {
    const container = document.createElement('div');
    const plugin = watermarkPlugin({
      text: 'Brand',
    });

    const cleanup = plugin.install({ container } as unknown as WebGL360PluginContext);

    expect(plugin.id).toBe('watermark');
    expect(plugin.getElement()?.tagName).toBe('DIV');

    plugin.setHref('https://example.com');

    expect(plugin.getElement()?.tagName).toBe('A');

    plugin.setHref(undefined);

    expect(plugin.getElement()?.tagName).toBe('DIV');

    if (typeof cleanup === 'function') {
      cleanup();
    }
  });
});
