# Changelog

All notable changes to `webgl-360-player` are documented here.

## 0.1.0 - Unreleased

- Added framework-agnostic WebGL equirectangular 360 video playback.
- Added MP4 and HLS source selection with source preference and quality ceilings.
- Added optional React wrapper.
- Added motion controls and pointer controls for drag, pinch zoom, and click/tap.
- Added intro/main/outro sequence playback.
- Added `setQuality()` for runtime quality switching.
- Added device capability detection for source type, WebGL texture limits, conservative video limits, HEVC/H.264 support, iPhone, and Android.
- Added source support reporting through `availableQualities` and `sourceSupport`.
- Added runtime diagnostics for selected source, source errors, decode errors, context loss, dropped frames, device metadata, quality change events, and fallback reason.
- Added demo HLS source support through `hls.js`.

## Release Process

1. Update this changelog.
2. Run `npm run check`.
3. Run the real-device QA checklist in `docs/release-qa-checklist.md`.
4. Build the demo with `npm run demo:build`.
5. Run `npm run pack:dry-run` and inspect package contents.
6. Tag the release after package artifacts and docs are verified.
