import type {
  WebGL360DeviceCapabilities,
  WebGL360Source,
  WebGL360SourceSupport,
  WebGL360SourceType,
} from './types';

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

export function isAndroid(userAgent = getNavigatorUserAgent()): boolean {
  return /Android/i.test(userAgent);
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

export function detectDeviceCapabilities(
  video: HTMLVideoElement,
  documentRef: Document | undefined = globalThis.document,
): WebGL360DeviceCapabilities {
  const userAgent = getNavigatorUserAgent();
  const maxTextureSize = getMaxTextureSize(documentRef);
  const iphone = isIPhone(userAgent);
  const android = isAndroid(userAgent);
  const hevcSupported = canPlayAny(video, [
    'video/mp4; codecs="hvc1.1.6.L120.B0"',
    'video/mp4; codecs="hev1.1.6.L120.B0"',
    'video/mp4; codecs="hvc1"',
    'video/mp4; codecs="hev1"',
  ]);
  const h264Supported = canPlayAny(video, [
    'video/mp4; codecs="avc1.42E01E"',
    'video/mp4; codecs="avc1.640028"',
    'video/mp4',
  ]);

  const maxVideoPixels = getMaxVideoPixels({ iphone, android, maxTextureSize });
  const maxVideoWidth = Math.min(maxTextureSize || 4096, android ? 4096 : 8192);
  const maxVideoHeight = Math.min(maxTextureSize || 4096, android ? 2160 : 4096);

  return {
    supportedTypes: getSupportedSourceTypes(video),
    maxTextureSize,
    maxVideoPixels,
    maxVideoWidth,
    maxVideoHeight,
    hevcSupported,
    h264Supported,
    isIPhone: iphone,
    isAndroid: android,
    userAgent,
  };
}

export function getSourceSupport(
  source: WebGL360Source,
  capabilities: WebGL360DeviceCapabilities,
): WebGL360SourceSupport {
  if (!capabilities.supportedTypes.includes(source.type)) {
    return { source, supported: false, reason: `${source.type} is not supported by this browser` };
  }

  const dimensions = getSourceDimensions(source);

  if (dimensions.width > capabilities.maxTextureSize || dimensions.height > capabilities.maxTextureSize) {
    return {
      source,
      supported: false,
      reason: `${dimensions.width}x${dimensions.height} exceeds WebGL max texture size ${capabilities.maxTextureSize}`,
    };
  }

  if (dimensions.width > capabilities.maxVideoWidth || dimensions.height > capabilities.maxVideoHeight) {
    return {
      source,
      supported: false,
      reason: `${dimensions.width}x${dimensions.height} exceeds conservative device video limit ${capabilities.maxVideoWidth}x${capabilities.maxVideoHeight}`,
    };
  }

  if (dimensions.width * dimensions.height > capabilities.maxVideoPixels) {
    return {
      source,
      supported: false,
      reason: `${dimensions.width}x${dimensions.height} exceeds conservative device pixel limit ${capabilities.maxVideoPixels}`,
    };
  }

  if (isLikelyHevc(source) && !capabilities.hevcSupported) {
    return { source, supported: false, reason: 'HEVC is not reported as playable by this browser' };
  }

  return { source, supported: true };
}

export function getSupportedSources(
  sources: WebGL360Source[],
  capabilities: WebGL360DeviceCapabilities,
): WebGL360Source[] {
  return sources.filter((source) => getSourceSupport(source, capabilities).supported);
}

export function getSourceSupportList(
  sources: WebGL360Source[],
  capabilities: WebGL360DeviceCapabilities,
): WebGL360SourceSupport[] {
  return sources.map((source) => getSourceSupport(source, capabilities));
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

function canPlayAny(video: HTMLVideoElement, mimeTypes: string[]): boolean {
  return mimeTypes.some((mimeType) => Boolean(video.canPlayType(mimeType)));
}

function getMaxTextureSize(documentRef: Document | undefined): number {
  if (!documentRef?.createElement) {
    return 4096;
  }

  const canvas = documentRef.createElement('canvas');
  const context = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;

  if (!context) {
    return 4096;
  }

  return context.getParameter(context.MAX_TEXTURE_SIZE) || 4096;
}

function getMaxVideoPixels(input: { iphone: boolean; android: boolean; maxTextureSize: number }): number {
  const texturePixels = input.maxTextureSize * input.maxTextureSize;

  if (input.android) {
    return Math.min(texturePixels, 3840 * 2160);
  }

  if (input.iphone) {
    return Math.min(texturePixels, 3840 * 2160);
  }

  return texturePixels;
}

function getSourceDimensions(source: WebGL360Source): { width: number; height: number } {
  if (source.width && source.height) {
    return { width: source.width, height: source.height };
  }

  const rank = getQualityRank(source.quality);

  if (rank >= 8000) {
    return { width: 7680, height: 3840 };
  }

  if (rank >= 4000) {
    return { width: 3840, height: 1920 };
  }

  if (rank >= 2000) {
    return { width: 2560, height: 1280 };
  }

  if (rank >= 1080) {
    return { width: 1920, height: 960 };
  }

  if (rank >= 720) {
    return { width: 1280, height: 640 };
  }

  return { width: 640, height: 320 };
}

function isLikelyHevc(source: WebGL360Source): boolean {
  const mimeType = source.mimeType?.toLowerCase() ?? '';

  return (
    mimeType.includes('hvc1') ||
    mimeType.includes('hev1') ||
    source.quality.toLowerCase().includes('hevc')
  );
}

function getQualityRank(quality: string): number {
  const normalized = quality.trim().toLowerCase();
  const aliases: Record<string, number> = {
    sd: 480,
    hd: 720,
    fhd: 1080,
    uhd: 2160,
    '2k': 2000,
    '4k': 4000,
    '8k': 8000,
  };

  if (aliases[normalized] !== undefined) {
    return aliases[normalized];
  }

  const numeric = normalized.match(/^(\d+(?:\.\d+)?)(p|k)?$/);

  if (!numeric) {
    return 0;
  }

  const value = Number(numeric[1]);
  return numeric[2] === 'k' ? value * 1000 : value;
}
