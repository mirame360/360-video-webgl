import type { WebGL360PluginContext, WebGL360PluginObject } from '../types';

export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface WatermarkPluginOptions {
  text?: string;
  href?: string;
  target?: '_self' | '_blank' | '_parent' | '_top';
  rel?: string;
  position?: WatermarkPosition;
  poweredBy?: boolean;
  className?: string;
}

export interface WatermarkPlugin extends WebGL360PluginObject {
  setText: (text: string) => void;
  setHref: (href: string | undefined) => void;
  setPosition: (position: WatermarkPosition) => void;
  getElement: () => HTMLElement | undefined;
}

const ROOT_CLASS = 'webgl-360-watermark';

export function createWatermarkPlugin(options: WatermarkPluginOptions = {}): WatermarkPlugin {
  let context: WebGL360PluginContext | undefined;
  let element: HTMLAnchorElement | HTMLDivElement | undefined;
  let text = getWatermarkText(options);
  let href = options.href;
  let position = options.position ?? 'top-left';

  const render = (): void => {
    if (!context || !element) {
      return;
    }

    const nextElement = href ? document.createElement('a') : document.createElement('div');
    nextElement.className = options.className ? `${ROOT_CLASS} ${options.className}` : ROOT_CLASS;
    nextElement.textContent = text;
    nextElement.dataset.position = position;
    applyWatermarkStyles(nextElement, position);

    if (href && nextElement instanceof HTMLAnchorElement) {
      nextElement.href = href;
      nextElement.target = options.target ?? '_blank';
      nextElement.rel = options.rel ?? 'noopener noreferrer';
    }

    element.replaceWith(nextElement);
    element = nextElement;
  };

  return {
    id: 'watermark',
    install(pluginContext) {
      context = pluginContext;
      element = href ? document.createElement('a') : document.createElement('div');
      element.className = options.className ? `${ROOT_CLASS} ${options.className}` : ROOT_CLASS;
      element.textContent = text;
      element.dataset.position = position;
      applyWatermarkStyles(element, position);

      if (href && element instanceof HTMLAnchorElement) {
        element.href = href;
        element.target = options.target ?? '_blank';
        element.rel = options.rel ?? 'noopener noreferrer';
      }

      pluginContext.container.appendChild(element);

      return () => {
        element?.remove();
        element = undefined;
        context = undefined;
      };
    },
    setText(nextText) {
      text = nextText;
      if (element) {
        element.textContent = text;
      }
    },
    setHref(nextHref) {
      href = nextHref;
      render();
    },
    setPosition(nextPosition) {
      position = nextPosition;
      if (element) {
        element.dataset.position = position;
        applyWatermarkStyles(element, position);
      }
    },
    getElement() {
      return element;
    },
  };
}

function getWatermarkText(options: WatermarkPluginOptions): string {
  if (options.text) {
    return options.poweredBy ? `Powered by ${options.text}` : options.text;
  }
  return options.poweredBy ? 'Powered by WebGL 360' : 'WebGL 360';
}

function applyWatermarkStyles(element: HTMLElement, position: WatermarkPosition): void {
  element.style.position = 'absolute';
  element.style.zIndex = '130';
  element.style.display = 'inline-flex';
  element.style.alignItems = 'center';
  element.style.maxWidth = 'min(70%, 360px)';
  element.style.padding = '7px 12px';
  element.style.border = '1px solid var(--webgl-360-control-border, rgba(255, 255, 255, 0.16))';
  element.style.borderRadius = '999px';
  element.style.background = 'var(--webgl-360-control-bg, rgba(0, 0, 0, 0.58))';
  element.style.backdropFilter = 'blur(8px)';
  element.style.color = 'var(--webgl-360-control-color, #fff)';
  element.style.font = '700 12px/1 var(--webgl-360-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)';
  element.style.letterSpacing = '0';
  element.style.textDecoration = 'none';
  element.style.whiteSpace = 'nowrap';
  element.style.overflow = 'hidden';
  element.style.textOverflow = 'ellipsis';
  element.style.pointerEvents = 'auto';

  element.style.top = '';
  element.style.right = '';
  element.style.bottom = '';
  element.style.left = '';

  if (position.includes('top')) {
    element.style.top = '16px';
  } else {
    element.style.bottom = 'calc(16px + env(safe-area-inset-bottom))';
  }

  if (position.includes('left')) {
    element.style.left = '16px';
  } else {
    element.style.right = '16px';
  }
}

export const watermarkPlugin = createWatermarkPlugin;
