export interface LoaderHandle {
  setState: (state: string) => void;
  destroy: () => void;
}

export function createLoader(container: HTMLElement): LoaderHandle {
  ensureStyles();
  
  const root = document.createElement('div');
  root.className = 'webgl-360-player__loader';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  
  const spinner = document.createElement('div');
  spinner.className = 'webgl-360-player__spinner';
  root.appendChild(spinner);

  const label = document.createElement('span');
  label.className = 'webgl-360-player__loader-text';
  root.appendChild(label);
  
  ensurePositioned(container);
  container.appendChild(root);

  return {
    setState(state: string) {
      label.textContent = state;
      root.setAttribute('aria-label', state);
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

function ensureStyles(): void {
  const id = 'webgl-360-player-loader-styles';
  if (document.getElementById(id)) return;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    .webgl-360-player__loader {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--webgl-360-loader-bg, rgba(0, 0, 0, 0.5));
      z-index: 100;
      pointer-events: none;
      backdrop-filter: blur(4px);
    }
    .webgl-360-player__spinner {
      width: 48px;
      height: 48px;
      border: 4px solid var(--webgl-360-spinner-track, rgba(255, 255, 255, 0.1));
      border-left-color: var(--webgl-360-spinner-accent, var(--webgl-360-accent, #3b82f6));
      border-radius: 50%;
      animation: webgl-360-spin 0.8s linear infinite;
    }
    .webgl-360-player__loader-text {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }
    @keyframes webgl-360-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}
