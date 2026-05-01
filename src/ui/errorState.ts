export interface ErrorStateHandle {
  destroy: () => void;
}

export function createErrorState(container: HTMLElement, message: string): ErrorStateHandle {
  const root = document.createElement('div');
  root.className = 'webgl-360-player__error';
  root.setAttribute('role', 'alert');
  root.style.cssText = [
    'position:absolute',
    'inset:0',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'background:var(--webgl-360-error-bg, #111827)',
    'color:var(--webgl-360-error-color, #fff)',
    'font:500 14px/1.4 var(--webgl-360-font-family, sans-serif)',
    'padding:24px',
    'text-align:center',
    'z-index:3',
  ].join(';');
  root.textContent = message || 'The 360 video player could not start.';
  container.appendChild(root);

  return {
    destroy() {
      root.remove();
    },
  };
}
