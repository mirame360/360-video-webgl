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
  sources: [{ src: 'video_4k.mp4', type: 'mp4', quality: '4k' }],
  autoplay: true
});
```

## License

MIT
