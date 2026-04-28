# Browser Support

This package targets modern browsers with WebGL and HTML video support.

## Expected Support

| Platform | Browser | MP4 | HLS | Motion Controls | Notes |
| --- | --- | --- | --- | --- | --- |
| iPhone | Safari | Yes | Native | Permission required | Conservative quality ceiling defaults to 4k unless configured and device capabilities allow more. |
| iPhone | Chrome / Firefox | Yes | Native through WebKit | Permission required | Same WebKit media behavior as Safari. |
| Android | Chrome | Yes | Via `hls.js` | Usually available | 8k HEVC is commonly unsupported; capability checks should disable unsuitable sources. |
| Android | Samsung Internet | Yes | Via `hls.js` | Usually available | Must be real-device tested before release. |
| Desktop macOS | Safari | Yes | Native | No practical gyro | Good HLS compatibility; HEVC depends on hardware/browser support. |
| Desktop Chrome / Edge | Yes | Via `hls.js` | No practical gyro | Use `sourceLoader` for HLS. |
| Firefox Desktop | Yes | Via `hls.js` | No practical gyro | Codec support varies by OS. |

## Requirements

- WebGL context creation must succeed.
- Video source must be CORS-compatible when used as a WebGL texture.
- HLS on non-Safari browsers requires a `sourceLoader`, usually backed by `hls.js`.
- Motion controls generally require HTTPS and a user gesture. iOS requires `DeviceOrientationEvent.requestPermission()`.

## Capability Checks

The player detects and exposes:

- supported source types
- WebGL max texture size
- conservative max video width, height, and pixel count
- HEVC and H.264 playback signals from `canPlayType`
- iPhone and Android user-agent classification
- source support reasons for disabled qualities

The checks are intentionally conservative. They prevent obvious failures but do not replace real-device testing.
