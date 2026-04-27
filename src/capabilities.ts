import type { WebGL360SourceType } from './types';

export interface WebGL360EligibilityInput {
  flags?: {
    enabled?: boolean;
  };
  userAgent?: string;
  requireIPhone?: boolean;
  isEligibleMedia?: boolean;
  documentRef?: Document;
}

export function shouldUseWebGL360Player(input: WebGL360EligibilityInput = {}): boolean {
  const flagsEnabled = input.flags?.enabled ?? true;
  const requireIPhone = input.requireIPhone ?? false;
  const mediaEligible = input.isEligibleMedia ?? true;
  const userAgent = input.userAgent ?? getNavigatorUserAgent();

  return (
    flagsEnabled &&
    mediaEligible &&
    (!requireIPhone || isIPhone(userAgent)) &&
    supportsWebGL(input.documentRef)
  );
}

export function isIPhone(userAgent = getNavigatorUserAgent()): boolean {
  return /iPhone/i.test(userAgent);
}

export function isSecureContext(): boolean {
  return globalThis.isSecureContext === true || globalThis.location?.protocol === 'https:';
}

export function supportsMotion(): boolean {
  return typeof DeviceOrientationEvent !== 'undefined';
}

export function supportsWebGL(documentRef: Document | undefined = globalThis.document): boolean {
  if (!documentRef?.createElement) {
    return false;
  }

  const canvas = documentRef.createElement('canvas');

  try {
    const context = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return Boolean(context);
  } catch {
    return false;
  }
}

export function canUseNativeHls(video: HTMLVideoElement): boolean {
  return Boolean(
    video.canPlayType('application/vnd.apple.mpegurl') ||
    video.canPlayType('application/x-mpegURL'),
  );
}

export function getSupportedSourceTypes(video: HTMLVideoElement): WebGL360SourceType[] {
  const supported: WebGL360SourceType[] = [];

  if (canUseNativeHls(video)) {
    supported.push('hls');
  }

  if (video.canPlayType('video/mp4')) {
    supported.push('mp4');
  }

  return supported.length ? supported : ['mp4'];
}

function getNavigatorUserAgent(): string {
  return globalThis.navigator?.userAgent ?? '';
}

export function getIPhoneQualityCeiling(): string | undefined {
  if (isIPhone()) {
    // iPhones generally struggle with 8k, and often have 1080p or 4k caps for HEVC
    // depending on the generation. v1 ceiling is 4k.
    return '4k';
  }
  return undefined;
}
