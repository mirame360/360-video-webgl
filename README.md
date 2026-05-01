# WebGL 360 Video Player

A high-performance, framework-agnostic WebGL-based video player designed for equirectangular 360-degree video content. This library provides a professional-grade viewing experience with smooth interaction, hardware acceleration, and a modern UI.

## Why WebGL instead of a standard Canvas?

Traditional 360-degree video players often rely on a standard 2D `<canvas>` element and manual JavaScript calculations to "distort" the video into a spherical view. This project uses **WebGL** (via Three.js), which offers several critical advantages:

1.  **Hardware Acceleration**: WebGL offloads all spherical projection and rendering tasks to the device's **GPU**. A standard 2D canvas performs these calculations on the CPU, which is significantly slower and leads to frame drops, especially at 4k resolutions.
2.  **True 3D Projection**: Instead of simulating a curve, this player renders a literal 3D sphere and places the camera inside it. This results in mathematically perfect projection with zero visual artifacts at the poles.
3.  **High-Resolution Support**: Because the GPU handles the heavy lifting, this player can maintain 60 FPS even when rendering high-bitrate 4k video, whereas 2D canvas players typically struggle above 1080p.
4.  **Lower Battery Consumption**: By using the dedicated hardware decoder and GPU, the player minimizes CPU load, drastically reducing heat and battery drain on mobile devices.

## How it Works

The player operates on an **"Inside-Out Sphere"** model:

- **Geometry**: The player generates a high-detail 3D sphere. The geometry is then "inverted" so that the faces point inward.
- **Texture**: The HTML5 `<video>` element is captured as a dynamic texture and mapped onto the inside of the sphere using equirectangular UV coordinates.
- **Camera**: A virtual perspective camera is placed at the exact center of the sphere `(0, 0, 0)`.
- **Interaction**: When a user drags the screen or moves their phone, the player doesn't move the video; it rotates the **camera**. This provides the most natural and immersive feel, mimicking how human eyes work.

## Key Features

- **Framework Agnostic**: Core logic is written in vanilla TypeScript.
- **Sequence Support**: Configure `preSources` (intro) and `postSources` (outro) to create a seamless playback sequence.
- **React Ready**: Includes a first-class React wrapper with declarative props and imperative refs.
- **Mobile Optimized**: Custom interaction model for mobile browsers, including a pseudo-fullscreen fallback for iOS and motion (gyroscope) controls.
- **Quality Heuristics**: Automatic resolution selection with hardware-safe ceilings (e.g., 4k limit on mobile to prevent crashes).
- **Immersive Modes**: Optional split-view stereo rendering and WebXR session support through plugins.
- **Debug Mode**: Real-time performance overlay showing FPS, bitrate, and camera coordinates.

## Installation

```bash
npm install webgl-360-player
```

## Quick Start (React)

```tsx
import { ReactWebGL360Player, type WebGL360Player } from 'webgl-360-player';
import { useRef } from 'react';

function App() {
  const playerRef = useRef<WebGL360Player>(null);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactWebGL360Player
        ref={playerRef}
        sources={[{ src: 'video_4k.mp4', type: 'mp4', quality: '4k' }]}
        autoplay
        muted
        debug={true}
      />
    </div>
  );
}
```

## Quick Start (Vanilla JS)

```javascript
import { createWebGL360Player } from 'webgl-360-player';

const container = document.getElementById('player');
const player = createWebGL360Player(container, {
  sources: [
    {
      src: 'video_4k.mp4',
      type: 'mp4',
      quality: '4k',
      width: 3840,
      height: 1920,
      mimeType: 'video/mp4',
    },
    {
      src: 'video.m3u8',
      type: 'hls',
      quality: 'hls',
      mimeType: 'application/vnd.apple.mpegurl',
    },
  ],
  autoplay: true,
  analytics: {
    track(event, payload) {
      console.log(event, payload);
    },
  },
  onDiagnostic(event, state) {
    console.log('diagnostic', event, state.diagnostics);
  },
});
```

## Public API

```ts
const player = createWebGL360Player(container, options);

await player.play();
player.pause();
player.seek(30);
player.setYaw(90);
player.setPitch(10);
player.setFov(70);
player.setView({ yaw: 90, pitch: 10, fov: 70 });
const view = player.getView();
player.setMuted(true);
player.setDebug(true);
await player.setMotionEnabled(true);
await player.setQuality('4k');
const saved = player.exportConfig();
await player.importConfig(saved);
await player.requestFullscreen();
await player.exitFullscreen();
const posterBlob = await player.captureFrame({ type: 'image/jpeg', quality: 0.9 });
const state = player.getState();
player.destroy();
```

`getState()` returns the active source, supported qualities, source support reasons, detected device capabilities, playback counters, and recent diagnostic events. `exportConfig()` serializes the current presentation state: view, mute/debug/motion flags, stereo mode, color filters, and active quality. It does not serialize media URLs or plugin definitions.

## Optional Plugins

Plugins are installed through the `plugins` option and can subscribe to runtime events without increasing the core player surface.

```ts
import {
  createAnalyticsPlugin,
  createHotspotsPlugin,
  createStereoPlugin,
  createSubtitlesPlugin,
  createTimelinePlugin,
  createWatermarkPlugin,
  createWebGL360Player,
  createXRPlugin,
} from 'webgl-360-player';

const analytics = createAnalyticsPlugin({
  track(event, payload) {
    console.log(event, payload);
  },
});
const subtitles = createSubtitlesPlugin({
  tracks: [
    { id: 'en', src: '/subtitles-en.vtt', label: 'English', srclang: 'en', default: true },
  ],
  controls: true,
});
const watermark = createWatermarkPlugin({
  text: 'Example Brand',
  href: 'https://example.com',
  poweredBy: true,
  position: 'top-left',
});
const stereo = createStereoPlugin({
  controls: true,
});
const xr = createXRPlugin({
  controls: true,
});
const hotspots = createHotspotsPlugin({
  hotspots: [
    { id: 'door', yaw: 35, pitch: -4, label: 'Door', startTime: 2, endTime: 18 },
  ],
});
const timeline = createTimelinePlugin({
  chapters: {
    intro: 0,
    gallery: { time: 42, label: 'Gallery' },
    rooftop: { time: 96, label: 'Rooftop' },
  },
  onChapterChange(chapter) {
    console.log('chapter', chapter?.label);
  },
});

const player = createWebGL360Player(container, {
  sources: [{ src: 'video_4k.mp4', type: 'mp4', quality: '4k' }],
  projectionMode: '360',
  stereoSourceLayout: 'mono',
  plugins: [analytics, subtitles, watermark, stereo, xr, hotspots, timeline],
});
```

The analytics plugin emits:

- `webgl_360_ready`
- `webgl_360_play`
- `webgl_360_pause`
- `webgl_360_seek`
- `webgl_360_quality_change`
- `webgl_360_quality_fallback`
- `webgl_360_motion_change`
- `webgl_360_view_duration`
- `webgl_360_heatmap_sample`
- `webgl_360_source_error`
- `webgl_360_fallback`

The subtitles plugin attaches WebVTT tracks to the active video element, renders active cues into a player overlay, and can mount a `CC` control button through the shared plugin controls slot. The custom overlay is required because the media element itself is hidden while WebGL renders the 360 texture.

The watermark plugin renders a configurable brand badge with optional click URL and powered-by text.

The stereo plugin mounts a `VR` control and asks the renderer to draw a Cardboard-style left/right split view. This is a regular inline canvas mode; it does not start a browser-managed immersive session.

The XR plugin mounts an `Enter VR` control for browsers that support WebXR `immersive-vr`. It looks up the current Three.js renderer when the user clicks, starts an XR session, and switches the button to `Exit VR` until the session ends. Unsupported browsers show a disabled `VR unavailable` control.

The hotspots plugin mounts HTML hotspots on a dedicated overlay layer and positions them from yaw/pitch coordinates. Hotspots can be limited to playback time ranges and can provide custom DOM through a `render()` callback.

The timeline plugin tracks chapter markers from a hashmap keyed by chapter id. Values can be a time in seconds or `{ time, label }`. The first shipped marker type is chapters only; UI can subscribe through `onChapterChange()` or call `seekToChapter(id)`, `nextChapter()`, and `previousChapter()` on the plugin instance.

Plugins can also register source loaders by source type:

```ts
const hlsPlugin = {
  id: 'hls-loader',
  install(context) {
    return context.registerSourceLoader('hls', async ({ video, source, waitForReady }) => {
      const hls = new Hls();
      hls.loadSource(source.src);
      hls.attachMedia(video);
      await waitForReady();
      return () => hls.destroy();
    });
  },
};
```

Registered loaders are selected before the top-level `sourceLoader` option, which remains available as a fallback for compatibility.

## Theming

Built-in player UI reads CSS custom properties from the container scope:

```css
.tour-player {
  --webgl-360-font-family: Inter, system-ui, sans-serif;
  --webgl-360-accent: #22c55e;
  --webgl-360-control-bg: rgba(8, 12, 20, 0.72);
  --webgl-360-control-color: #f8fafc;
  --webgl-360-control-active-color: #86efac;
  --webgl-360-control-border: rgba(255, 255, 255, 0.18);
  --webgl-360-panel-bg: rgba(8, 12, 20, 0.86);
  --webgl-360-subtitle-bg: rgba(0, 0, 0, 0.68);
  --webgl-360-subtitle-color: #fff;
  --webgl-360-hotspot-bg: rgba(8, 12, 20, 0.72);
  --webgl-360-hotspot-color: #fff;
}
```

Additional variables are available for active menu items, subtitles, loaders, spinners, and error states: `--webgl-360-control-active-bg`, `--webgl-360-control-active-fg`, `--webgl-360-subtitle-shadow`, `--webgl-360-loader-bg`, `--webgl-360-spinner-track`, `--webgl-360-spinner-accent`, `--webgl-360-error-bg`, and `--webgl-360-error-color`.

## Web Component

Register the custom element when you want a zero-framework integration:

```ts
import { defineWebGL360PlayerElement } from 'webgl-360-player';

defineWebGL360PlayerElement();
```

```html
<webgl-360-player
  src="/video_4k.mp4"
  quality="4k"
  autoplay
  muted
  projection-mode="360"
  stereo-source-layout="mono"
></webgl-360-player>
```

For multiple sources, pass a JSON `sources` attribute or assign `element.options = { sources, plugins }` before connecting the element.

## Advanced Rendering

`projectionMode` controls the projection geometry:

- `360` renders a full equirectangular sphere.
- `180` renders a half sphere for 180-degree video.

`stereoSourceLayout` controls how the video texture is sampled when stereo rendering is enabled:

- `mono` uses the full video for both eyes.
- `left-right` samples the left and right halves of the source video.
- `top-bottom` samples the top and bottom halves of the source video.

## Configuration Options

| Option | Type | Description |
| :--- | :--- | :--- |
| `sources` | `Source[]` | **Required**. Main video sources. |
| `preSources` | `Source[]` | Optional intro video(s). |
| `postSources` | `Source[]` | Optional outro video(s). |
| `autoplay` | `boolean` | Start playback automatically. |
| `muted` | `boolean` | Start video muted. Default: `true`. |
| `loop` | `boolean` | Repeat the entire sequence (pre -> main -> post) indefinitely. Default: `false`. |
| `keyboardShortcuts` | `boolean` | Enable Space (play/pause), M (mute), arrows (seek). Default: `true`. |
| `debug` | `boolean` | Enables the green performance overlay and touch logging. |
| `motionControls` | `boolean` | Enables/Disables gyroscope support. |
| `sourceLoader` | `function` | Optional custom loader for HLS or application-specific source handling. |
| `analytics` | `object` | Optional `{ track(event, payload) }` adapter for host analytics. |
| `plugins` | `array` | Optional plugin functions or plugin objects installed before playback starts. |
| `requiredPlugins` | `array` | Plugin ids that must install successfully or the player falls back. |
| `onClick` | `function` | Callback for user clicks on the canvas. |
| `onReady` | `function` | Callback when player is initialized. |
| `onPlay` | `function` | Callback when playback starts. |
| `onPause` | `function` | Callback when playback pauses. |
| `onTimeUpdate` | `function` | Callback for playback progress (time, duration). |
| `onEnded` | `function` | Callback when the entire sequence ends. |
| `onQualityChange` | `function` | Called after `setQuality()` succeeds or fails. |
| `onDiagnostic` | `function` | Called for source errors, decode errors, context loss, fallback, and quality changes. |

## Observability

The player exposes diagnostics through `player.getState().diagnostics`, `onDiagnostic`, and analytics events.

Diagnostics include:

- `selectedSource`
- source failure reason and source metadata
- decode/media errors from the underlying video element
- WebGL context loss count
- decoded and dropped frame counts when `getVideoPlaybackQuality()` is available
- device/browser metadata including user agent, supported source types, HEVC/H.264 support, and WebGL texture limit
- quality change success/failure events
- fallback reason

Useful analytics events:

- `webgl_360_player_attempted`
- `webgl_360_player_ready`
- `webgl_360_player_source_error`
- `webgl_360_player_quality_change`
- `webgl_360_player_fallback`

For richer host analytics, use `createAnalyticsPlugin()` to capture playback events, seek events, motion toggles, view duration, heatmap samples, source errors, and quality fallback outcomes.

## HLS

The core accepts HLS sources, but non-Safari browsers need a `sourceLoader` such as `hls.js`.

```ts
import Hls from 'hls.js';

createWebGL360Player(container, {
  sources: [{ src: 'video.m3u8', type: 'hls', quality: 'hls' }],
  sourceLoader: async ({ video, source, defaultLoad, waitForReady }) => {
    if (source.type === 'hls' && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(source.src);
      hls.attachMedia(video);
      await waitForReady();
      return () => hls.destroy();
    }

    await defaultLoad();
  },
});
```

## Packaging Notes

- Keep large demo videos out of git history when possible. Use a CDN, release asset, or Git LFS for production-sized fixtures.
- Published package contents are limited to `dist`, `README.md`, `CHANGELOG.md`, browser support docs, release QA checklist, and `LICENSE`.
- Run `npm run check` before publishing.

See:

- `CHANGELOG.md`
- `docs/browser-support.md`
- `docs/release-qa-checklist.md`

## License

MIT
