# webgl-360-player

A high-performance, framework-agnostic WebGL 360-degree video player for equirectangular video. Built with Three.js, it provides a sleek, modern interface with advanced features for mobile and desktop browsers.

## Key Features

- **Framework Agnostic**: Core logic in vanilla TypeScript; works with React, Vue, Svelte, or plain HTML.
- **React Ready**: Includes a first-class React wrapper with declarative props and imperative refs.
- **Sequence Playlist**: Support for `preSources` (intro) and `postSources` (outro) videos.
- **Mobile Optimized**: Custom interaction model for iPhone, including pseudo-fullscreen and motion (gyroscope) controls.
- **Quality Heuristics**: Automatic resolution selection (HLS/MP4) with hardware-safe ceilings (e.g., 4k cap on iPhone).
- **Debug Mode**: Real-time performance overlay (FPS, Bitrate, Resolution).
- **Secure Context Awareness**: Handles HTTPS requirements for motion sensors automatically.

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
        sources={[{ src: '/video.mp4', type: 'mp4', quality: '1080p' }]}
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
  sources: [{ src: '/video.mp4', type: 'mp4', quality: '1080p' }],
  autoplay: true,
  onReady: (state) => console.log('Player ready!', state)
});
```

## Development & Build

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Setup
```bash
# Install dependencies
npm install
```

### Build the Library
This will generate the ESM, CJS, and Standalone UMD bundles in the `dist/` directory.
```bash
npm run build
```

### Run the Demo
Launches a Vite development server with a sleek testing interface.
```bash
npm run demo
```

### Run Tests
```bash
# Unit tests
npm run test:unit

# All tests
npm run test
```

## Configuration Options

| Option | Type | Description |
| :--- | :--- | :--- |
| `sources` | `Source[]` | **Required**. Main video sources. |
| `preSources` | `Source[]` | Optional intro video(s). |
| `postSources` | `Source[]` | Optional outro video(s). |
| `debug` | `boolean` | Enables the green performance overlay and touch logging. |
| `motionControls` | `boolean` | Enables/Disables gyroscope support. |
| `onClick` | `function` | Callback for user clicks on the canvas. |
| `onTimeUpdate` | `function` | Callback for playback progress. |

## License

MIT
