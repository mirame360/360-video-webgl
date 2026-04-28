import { getSourceSupport } from './capabilities';
import type {
  SourceSelectionOptions,
  SourceSelectionResult,
  WebGL360Quality,
  WebGL360Source,
  WebGL360SourceType,
} from './types';

const QUALITY_ALIASES: Record<string, number> = {
  sd: 480,
  hd: 720,
  fhd: 1080,
  uhd: 2160,
  '2k': 2000,
  '4k': 4000,
  '8k': 8000,
};

export function selectInitialSource(
  sources: WebGL360Source[],
  options: SourceSelectionOptions,
): SourceSelectionResult {
  const candidates = buildSourceCandidateQueue(sources, options);

  return {
    selectedSource: candidates[0],
    candidates,
  };
}

export function buildSourceCandidateQueue(
  sources: WebGL360Source[],
  options: SourceSelectionOptions,
): WebGL360Source[] {
  const supportedTypes = options.supportedTypes ?? ['hls', 'mp4'];
  const maxRank = options.maxQuality ? getQualityRank(options.maxQuality) : Number.POSITIVE_INFINITY;
  const defaultRank = options.defaultQuality ? getQualityRank(options.defaultQuality) : undefined;

  const supported = sources
    .filter((source) => supportedTypes.includes(source.type))
    .filter((source) => !options.capabilities || getSourceSupport(source, options.capabilities).supported)
    .filter((source) => getSourceQualityRank(source) <= maxRank);

  if (supported.length === 0) {
    return [];
  }

  const supportedRanks = supported.map(getSourceQualityRank);
  const highestSupportedRank = Math.max(...supportedRanks);
  const exactDefault = options.defaultQuality
    ? supported.filter((source) => source.quality === options.defaultQuality)
    : [];
  const lowerThanDefault = defaultRank === undefined
    ? []
    : supported.filter((source) => getSourceQualityRank(source) < defaultRank);
  const targetQualityRank = getTargetQualityRank({
    defaultRank,
    exactDefaultCount: exactDefault.length,
    highestSupportedRank,
    lowerThanDefaultRanks: lowerThanDefault.map(getSourceQualityRank),
    supportedRanks,
  });

  const sameQuality = supported.filter((source) => getSourceQualityRank(source) === targetQualityRank);
  const lowerQuality = supported.filter((source) => getSourceQualityRank(source) < targetQualityRank);
  const higherFallback = supported.filter((source) => getSourceQualityRank(source) > targetQualityRank);

  return [
    ...sortBySourcePreference(sameQuality, options.sourcePreference),
    ...sortByQualityThenType(lowerQuality, options.sourcePreference),
    ...sortByQualityThenType(higherFallback, options.sourcePreference),
  ];
}

function getTargetQualityRank(input: {
  defaultRank?: number;
  exactDefaultCount: number;
  highestSupportedRank: number;
  lowerThanDefaultRanks: number[];
  supportedRanks: number[];
}): number {
  if (input.defaultRank === undefined) {
    return input.highestSupportedRank;
  }

  if (input.exactDefaultCount > 0) {
    return input.defaultRank;
  }

  if (input.lowerThanDefaultRanks.length > 0) {
    return Math.max(...input.lowerThanDefaultRanks);
  }

  return Math.min(...input.supportedRanks);
}

export function compareQuality(left: WebGL360Quality, right: WebGL360Quality): number {
  return getQualityRank(left) - getQualityRank(right);
}

export function getQualityRank(quality: WebGL360Quality): number {
  const normalized = quality.trim().toLowerCase();

  if (QUALITY_ALIASES[normalized] !== undefined) {
    return QUALITY_ALIASES[normalized];
  }

  const numeric = normalized.match(/^(\d+(?:\.\d+)?)(p|k)?$/);

  if (!numeric) {
    return 0;
  }

  const value = Number(numeric[1]);
  const unit = numeric[2];

  if (unit === 'k') {
    return value * 1000;
  }

  return value;
}

function getSourceQualityRank(source: WebGL360Source): number {
  return source.height ?? getQualityRank(source.quality);
}

function sortByQualityThenType(
  sources: WebGL360Source[],
  sourcePreference: WebGL360SourceType[],
): WebGL360Source[] {
  return [...sources].sort((left, right) => {
    const qualityDelta = getSourceQualityRank(right) - getSourceQualityRank(left);

    if (qualityDelta !== 0) {
      return qualityDelta;
    }

    return getSourcePreferenceRank(left.type, sourcePreference) - getSourcePreferenceRank(right.type, sourcePreference);
  });
}

function sortBySourcePreference(
  sources: WebGL360Source[],
  sourcePreference: WebGL360SourceType[],
): WebGL360Source[] {
  return [...sources].sort((left, right) => (
    getSourcePreferenceRank(left.type, sourcePreference) - getSourcePreferenceRank(right.type, sourcePreference)
  ));
}

function getSourcePreferenceRank(sourceType: WebGL360SourceType, sourcePreference: WebGL360SourceType[]): number {
  const rank = sourcePreference.indexOf(sourceType);
  return rank === -1 ? sourcePreference.length : rank;
}
