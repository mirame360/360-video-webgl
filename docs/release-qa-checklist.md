# Release QA Checklist

Run this checklist before publishing or deploying a new `webgl-360-player` build.

## Automated Checks

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:dist`
- `npm run demo:build`
- `npm run pack:dry-run`

## Desktop Browser Smoke Tests

- Chrome: MP4 playback, HLS playback through `hls.js`, drag, pinch/wheel zoom, quality switching, fullscreen.
- Safari: MP4 playback, native HLS playback, drag, quality switching, fullscreen.
- Firefox: MP4 playback, HLS playback through `hls.js`, drag, quality switching.

## Mobile Browser Smoke Tests

- iPhone Safari over HTTPS:
  - MP4 playback
  - native HLS playback
  - motion permission prompt
  - motion controls on/off
  - drag with motion enabled
  - orientation change
  - fullscreen or pseudo-fullscreen behavior
  - quality selector disables unsupported sources
- Android Chrome:
  - MP4 playback
  - HLS playback through `hls.js`
  - drag and pinch
  - motion controls on/off
  - drag with motion enabled
  - quality selector disables unsupported 8k/HEVC sources

## Observability Checks

- `player.getState().selectedSource` matches the visible source.
- `player.getState().availableQualities` matches the quality selector.
- `player.getState().sourceSupport` explains disabled qualities.
- `player.getState().deviceCapabilities` contains user agent, max texture size, codec support, and platform flags.
- `player.getState().diagnostics.events` records source errors, quality changes, fallbacks, and context loss.
- Debug overlay shows FPS, dropped frames, selected source, bitrate, texture cap, HEVC status, and last error.
- Analytics adapter receives ready, source error, quality change, and fallback events.

## Asset and Packaging Checks

- Demo videos larger than 50 MB should be hosted outside git when possible.
- Production fixtures should use CDN, object storage, release assets, or Git LFS.
- `npm run pack:dry-run` should include only intended distributable files.
- README, changelog, browser support, and QA checklist must be current.
