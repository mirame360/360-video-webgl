import type { WebGL360Analytics } from './types';

export function track(
  analytics: WebGL360Analytics | undefined,
  event: string,
  payload?: Record<string, unknown>,
): void {
  try {
    analytics?.track(event, payload);
  } catch {
    // Analytics must never break playback or fallback.
  }
}
