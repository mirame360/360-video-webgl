import type {
  WebGL360PluginCleanup,
  WebGL360PluginContext,
  WebGL360PluginObject,
  WebGL360RendererHandle,
} from '../types';

export interface XRPluginOptions {
  controls?: boolean;
  className?: string;
  buttonLabel?: string;
  activeButtonLabel?: string;
  unavailableButtonLabel?: string;
  requiredFeatures?: XRSessionInit['requiredFeatures'];
  optionalFeatures?: XRSessionInit['optionalFeatures'];
}

export interface XRPlugin extends WebGL360PluginObject {
  enter: () => Promise<boolean>;
  exit: () => Promise<void>;
  isActive: () => boolean;
  isSupported: () => boolean | undefined;
}

const ROOT_CLASS = 'webgl-360-xr-control';

export function createXRPlugin(options: XRPluginOptions = {}): XRPlugin {
  let context: WebGL360PluginContext | undefined;
  let button: HTMLButtonElement | undefined;
  let currentSession: XRSession | undefined;
  let cleanupControl: WebGL360PluginCleanup | undefined;
  let supported: boolean | undefined;

  const inactiveLabel = options.buttonLabel ?? 'Enter VR';
  const activeLabel = options.activeButtonLabel ?? 'Exit VR';
  const unavailableLabel = options.unavailableButtonLabel ?? 'VR unavailable';

  const updateButtonState = (): void => {
    if (!button) {
      return;
    }

    button.textContent = currentSession ? activeLabel : supported === false ? unavailableLabel : inactiveLabel;
    button.disabled = supported === false;
    button.dataset.active = currentSession ? 'true' : 'false';
    button.style.color = currentSession
      ? 'var(--webgl-360-control-active-color, #4ade80)'
      : 'var(--webgl-360-control-color, #fff)';
    button.setAttribute('aria-pressed', String(Boolean(currentSession)));
  };

  const markUnsupported = (): void => {
    supported = false;
    updateButtonState();
  };

  const checkSupport = async (): Promise<void> => {
    const xr = navigator.xr;
    if (!xr) {
      markUnsupported();
      return;
    }

    if (typeof xr.isSessionSupported !== 'function') {
      supported = true;
      updateButtonState();
      return;
    }

    try {
      supported = await xr.isSessionSupported('immersive-vr');
    } catch {
      supported = false;
    }
    updateButtonState();
  };

  const handleSessionEnd = (): void => {
    currentSession?.removeEventListener('end', handleSessionEnd);
    currentSession = undefined;
    updateButtonState();
  };

  const getRenderer = (): WebGL360RendererHandle | undefined => context?.getRenderer?.() ?? context?.renderer;

  const enter = async (): Promise<boolean> => {
    if (currentSession) {
      return true;
    }

    if (supported === false || !navigator.xr) {
      markUnsupported();
      return false;
    }

    const renderer = getRenderer();
    if (!renderer?.xr) {
      context?.emitDiagnostic({
        type: 'plugin_error',
        message: 'WebXR session could not start because the renderer is not ready',
        reason: 'xr_renderer_unavailable',
      });
      return false;
    }

    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: options.requiredFeatures,
        optionalFeatures: options.optionalFeatures ?? ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
      });

      renderer.xr.setReferenceSpaceType?.('local-floor');
      await renderer.xr.setSession(session);

      currentSession = session;
      currentSession.addEventListener('end', handleSessionEnd);
      supported = true;
      updateButtonState();
      return true;
    } catch (error) {
      context?.emitDiagnostic({
        type: 'plugin_error',
        message: 'WebXR session failed to start',
        reason: 'xr_session_start_failed',
        error: error instanceof Error ? error.message : String(error),
      });
      updateButtonState();
      return false;
    }
  };

  const exit = async (): Promise<void> => {
    const session = currentSession;
    if (!session) {
      return;
    }

    await session.end();
  };

  const handleButtonClick = (): void => {
    if (currentSession) {
      void exit();
      return;
    }

    void enter();
  };

  return {
    id: 'xr',
    install(pluginContext) {
      context = pluginContext;

      if (options.controls ?? true) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = options.className ? `${ROOT_CLASS} ${options.className}` : ROOT_CLASS;
        button.textContent = inactiveLabel;
        button.title = 'Enter immersive VR';
        button.setAttribute('aria-pressed', 'false');
        applyXRButtonStyles(button);
        button.addEventListener('click', handleButtonClick);
        cleanupControl = pluginContext.mountControl(button);
      }

      void checkSupport();
      updateButtonState();

      return () => {
        button?.removeEventListener('click', handleButtonClick);
        cleanupControl?.();
        cleanupControl = undefined;
        button = undefined;
        void exit();
        context = undefined;
      };
    },
    enter,
    exit,
    isActive() {
      return Boolean(currentSession);
    },
    isSupported() {
      return supported;
    },
  };
}

function applyXRButtonStyles(button: HTMLButtonElement): void {
  button.style.height = '34px';
  button.style.border = '1px solid var(--webgl-360-control-border, rgba(255, 255, 255, 0.16))';
  button.style.borderRadius = '8px';
  button.style.background = 'var(--webgl-360-control-bg, rgba(0, 0, 0, 0.62))';
  button.style.backdropFilter = 'blur(8px)';
  button.style.font = '700 12px/1 var(--webgl-360-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)';
  button.style.letterSpacing = '0';
  button.style.cursor = 'pointer';
  button.style.padding = '0 12px';
}

export const xrPlugin = createXRPlugin;
