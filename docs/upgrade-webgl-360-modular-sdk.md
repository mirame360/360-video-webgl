# Plan: Upgrade WebGL 360 Player to Modular SDK

## Status
Proposed

## Objective
Transition the `webgl-360-player` from an iPhone-specific experimental renderer into a professional, modular 360 video playback and editing SDK. This upgrade focuses on exposing core extension points for plugins, expanding the public API for host applications, and supporting advanced interactive features like hotspots and timelines.

## Phase 1: Core Extension Points (Architecture)
To support advanced plugins without bloating the core, we must expose specific handles in the `WebGL360PluginContext`.

### 1.1 Spatial Mapping
- **Goal:** Allow plugins to place HTML elements (hotspots, labels) over 3D coordinates.
- **Action:** Implement `projectYawPitchToScreen(yaw: number, pitch: number): { x: number, y: number } | null` in the renderer and expose it via the plugin context.
- **Dependency:** Requires access to the `THREE.Camera` and container dimensions.

### 1.2 Render & Overlay Hooks
- **Goal:** Enable frame-accurate animations and dedicated DOM layers.
- **Action:**
    - Add `onRenderFrame(callback: (delta: number) => void)` to the context.
    - Implement `getOverlayRoot(): HTMLElement`, providing a dedicated, transparent layer above the video but below the controls.

### 1.3 Multi-Source Loader Registry
- **Goal:** Support multiple streaming protocols (HLS, DASH) via optional plugins.
- **Action:** Move the single `sourceLoader` logic into a registry. Plugins can call `registerSourceLoader(type, loader)` to handle specific mime-types or protocols.

## Phase 2: Public API Expansion
Enhance the imperative API to support custom UI and state persistence.

### 2.1 View & State Management
- **Consolidated View:** Add `setView({ yaw, pitch, fov })` and `getView()` to simplify orientation updates.
- **Persistence:** Implement `exportConfig()` and `importConfig(config)` to serialize the current presentation state (orientation, active filters, muted state).

### 2.2 Control & Fullscreen
- **Fullscreen API:** Add `requestFullscreen()` and `exitFullscreen()` to the public API, handling cross-browser prefixing and the container wrapper.
- **Snapshot API:** Add `captureFrame(options)` to return a JPEG/PNG blob of the current view, useful for generating dynamic posters or thumbnails.

## Phase 3: Priority Plugins
Implement high-value plugins using the new Phase 1 architecture.

### 3.1 Hotspots Plugin (`@mirame360/webgl-360-hotspots`)
- **Features:** 
    - Spatial anchoring (Yaw/Pitch).
    - Visibility ranges (start/end time).
    - Custom HTML/React templates for hotspot content.
- **Mechanism:** Uses `projectYawPitchToScreen` on every `timeupdate` and `viewchange`.

### 3.2 Timeline & Markers Plugin (`@mirame360/webgl-360-timeline`)
- **Features:**
    - Named markers with `markerenter` / `markerleave` events.
    - Trim and Loop range metadata.
    - Chapter support for navigation.

### 3.3 Web Component Wrapper
- **Goal:** Zero-config integration for non-framework sites.
- **Action:** Create `<webgl-360-player>` using the Custom Elements API, mapping attributes to the player config.

## Phase 4: Advanced Rendering
- **180 & Stereo Support:** Update `SceneRenderer` to support Top/Bottom and Left/Right stereo layouts.
- **Shader Pipeline:** Formalize the color filter system into a `registerVideoFilter` hook for custom post-processing (e.g., sharpening, LUTs).

## Phase 5: Technical Polish
- **Theming:** Implement a CSS variable system (`--webgl-360-accent`, etc.) for all UI components.
- **Accessibility:** Ensure ARIA parity for all dynamic states (play/pause, volume, quality).
- **Diagnostics:** Expand `getDiagnostics()` to include frame-drop ratios and WebGL memory pressure.

## Success Criteria
1. The core bundle size remains under a strict limit (e.g., <50KB gzipped).
2. A "Hotspot" can be added to a video without modifying the `createPlayer.ts` file.
3. The player can be initialized, configured, and destroyed purely via the Web Component.
