# Changelog

All notable changes to `webgl-360-player` are documented here.

## 0.1.6 - 2026-05-02

- Redesigned plugin control system: removed intrusive floating overlay in favor of a customizable `controlsContainer` for toolbar integration.
- Simplified plugin button styling to match host application toolbars.
- Improved subtitle positioning on mobile.

## 0.1.5 - 2026-05-02

- Fixed cramped and overlapping plugin controls on small mobile screens.
- Improved watermark and control spacing for better touch usability.

## 0.1.4 - 2026-05-01

- Improved quality selection UI persistence and visibility in the demo.
- Fixed an issue where the quality dropdown could disappear during initial loading stages.

## 0.1.3 - 2026-05-01

- Expanded 4K support on iPhone by increasing the conservative pixel limit to 4096x2048.

## 0.1.2 - 2026-05-01

- Added buffering indicator when video stalls due to slow network.
- Improved loader persistence and visibility management.

## 0.1.1 - 2026-05-01

- Updated WebGL player with latest plugin changes.
- Built new standalone UMD bundle for mirame360.

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
