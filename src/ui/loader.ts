export interface LoaderHandle {
  setState: (state: string) => void;
  destroy: () => void;
}

export function createLoader(container: HTMLElement): LoaderHandle {
  const root = document.createElement('div');
  root.className = 'webgl-360-player__loader';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.style.cssText = [
    'position:absolute',
    'inset:0',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'background:rgba(0,0,0,0.45)',
    'color:#fff',
    'font:500 14px/1.4 sans-serif',
    'z-index:2',
    'pointer-events:none',
  ].join(';');

  const label = document.createElement('span');
  root.appendChild(label);
  ensurePositioned(container);
  container.appendChild(root);

  return {
    setState(state: string) {
      label.textContent = state;
    },
    destroy() {
      root.remove();
    },
  };
}

function ensurePositioned(container: HTMLElement): void {
  const position = getComputedStyle(container).position;

  if (position === 'static') {
    container.style.position = 'relative';
  }
}
