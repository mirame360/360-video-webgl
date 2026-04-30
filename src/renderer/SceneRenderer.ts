import * as THREE from 'three';
import { normalizeColorFilters } from '../colorFilters';
import { clamp } from '../config';
import type { WebGL360ColorFilters, WebGL360StereoMode } from '../types';
import {
  composeMotionCameraQuaternion,
  getCameraQuaternionFromYawPitch,
  getLookTargetFromYawPitch,
  getYawPitchFromCameraQuaternion,
} from './orientation';

export interface SceneRendererOptions {
  yaw: number;
  pitch: number;
  fov: number;
  minFov: number;
  maxFov: number;
  debug: boolean;
  onContextLost?: () => void;
  onFrame?: () => void;
}

export class SceneRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly texture: THREE.VideoTexture;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.SphereGeometry;
  private readonly mesh: THREE.Mesh;
  private readonly resizeObserver?: ResizeObserver;
  private animationFrame?: number;
  private yaw: number;
  private pitch: number;
  private fov: number;
  private isMotionEnabled = false;
  private screenOrientation = 0;
  private deviceQuaternion = new THREE.Quaternion();
  private sensorOffsetQuaternion?: THREE.Quaternion;
  private stereoMode: Required<WebGL360StereoMode> = {
    enabled: false,
    eyeYawOffset: 1.5,
  };
  private readonly alignQuaternion = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90 deg rotation around X
  private destroyed = false;

  constructor(
    private readonly container: HTMLElement,
    video: HTMLVideoElement,
    private readonly options: SceneRendererOptions,
  ) {
    this.yaw = options.yaw;
    this.pitch = options.pitch;
    this.fov = options.fov;
    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.1, 1100);
    
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x111111, 1);
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.domElement.className = 'webgl-360-player__canvas';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.error('SceneRenderer: video has no dimensions', video.videoWidth, 'x', video.videoHeight);
      throw new Error(`Invalid video dimensions: ${video.videoWidth}x${video.videoHeight}`);
    }

    this.texture = new THREE.VideoTexture(video);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    
    // Handle auto-rotated videos (e.g. from mobile devices)
    if (video.videoHeight > video.videoWidth) {
      this.texture.rotation = Math.PI / 2;
      this.texture.center.set(0.5, 0.5);
    }

    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    this.geometry = new THREE.SphereGeometry(500, 60, 40);
    this.geometry.scale(-1, 1, 1);
    this.material = createColorGradingMaterial(this.texture);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);

    this.container.appendChild(this.renderer.domElement);
    this.resize();

    if ('ResizeObserver' in globalThis) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.container);
    } else {
      globalThis.addEventListener('resize', this.resize);
    }

    this.updateScreenOrientation();
    window.addEventListener('orientationchange', this.handleOrientationChange, false);
    window.addEventListener('deviceorientation', this.handleOrientation, false);
  }

  start(): void {
    this.render();
  }

  setPose(pose: { yaw: number; pitch: number; fov: number }): void {
    this.yaw = pose.yaw;
    this.pitch = clamp(pose.pitch, -89, 89);
    this.fov = clamp(pose.fov, this.options.minFov, this.options.maxFov);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  setMotionEnabled(enabled: boolean): void {
    if (this.isMotionEnabled && !enabled) {
      this.updateYawPitchFromCamera();
    }
    if (!this.isMotionEnabled && enabled) {
      this.sensorOffsetQuaternion = undefined;
    }
    this.isMotionEnabled = enabled;
  }

  setColorFilters(filters: WebGL360ColorFilters): void {
    const normalized = normalizeColorFilters(filters);
    this.material.uniforms.uExposure.value = normalized.exposure;
    this.material.uniforms.uBrightness.value = normalized.brightness;
    this.material.uniforms.uContrast.value = normalized.contrast;
    this.material.uniforms.uSaturation.value = normalized.saturation;
    this.material.uniforms.uTemperature.value = normalized.temperature;
    this.material.uniforms.uTint.value = normalized.tint;
    this.material.uniforms.uVignette.value = normalized.vignette;
  }

  setStereoMode(mode: WebGL360StereoMode): void {
    this.stereoMode = {
      enabled: mode.enabled,
      eyeYawOffset: clamp(mode.eyeYawOffset ?? this.stereoMode.eyeYawOffset, 0, 10),
    };
    this.resize();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    if (this.animationFrame !== undefined) {
      cancelAnimationFrame(this.animationFrame);
    }

    window.removeEventListener('orientationchange', this.handleOrientationChange, false);
    window.removeEventListener('deviceorientation', this.handleOrientation, false);
    this.resizeObserver?.disconnect();
    globalThis.removeEventListener('resize', this.resize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private readonly resize = (): void => {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.updateScreenOrientation();
  };

  private readonly render = (): void => {
    if (this.destroyed) {
      return;
    }

    this.texture.needsUpdate = true;
    if (this.stereoMode.enabled) {
      this.renderStereo();
    } else {
      this.renderer.setScissorTest(false);
      this.updateCameraPose();
      this.renderer.render(this.scene, this.camera);
    }
    this.options.onFrame?.();
    this.animationFrame = requestAnimationFrame(this.render);
  };

  private renderStereo(): void {
    const size = this.renderer.getSize(new THREE.Vector2());
    const width = Math.max(Math.floor(size.x), 1);
    const height = Math.max(Math.floor(size.y), 1);
    const halfWidth = Math.max(Math.floor(width / 2), 1);

    this.renderer.setScissorTest(true);
    this.renderer.clear();

    this.renderer.setViewport(0, 0, halfWidth, height);
    this.renderer.setScissor(0, 0, halfWidth, height);
    this.updateCameraPose(-this.stereoMode.eyeYawOffset);
    this.renderer.render(this.scene, this.camera);

    this.renderer.setViewport(halfWidth, 0, width - halfWidth, height);
    this.renderer.setScissor(halfWidth, 0, width - halfWidth, height);
    this.updateCameraPose(this.stereoMode.eyeYawOffset);
    this.renderer.render(this.scene, this.camera);

    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, width, height);
  }

  private updateCameraPose(yawOffset = 0): void {
    if (this.isMotionEnabled) {
      const manualRotation = getCameraQuaternionFromYawPitch(this.yaw, this.pitch);

      if (this.sensorOffsetQuaternion) {
        this.camera.quaternion.copy(composeMotionCameraQuaternion(
          manualRotation,
          this.sensorOffsetQuaternion,
          this.deviceQuaternion,
        ));
      } else {
        this.camera.quaternion.copy(manualRotation);
      }
      if (yawOffset !== 0) {
        const eyeOffset = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          THREE.MathUtils.degToRad(yawOffset),
        );
        this.camera.quaternion.multiply(eyeOffset);
      }
    } else {
      this.updateCameraRotation(yawOffset);
    }
  }

  private updateCameraRotation(yawOffset = 0): void {
    this.camera.lookAt(getLookTargetFromYawPitch(this.yaw + yawOffset, this.pitch));
  }

  private updateYawPitchFromCamera(): void {
    const pose = getYawPitchFromCameraQuaternion(this.camera.quaternion);
    this.yaw = pose.yaw;
    this.pitch = pose.pitch;
  }

  private readonly handleOrientation = (event: DeviceOrientationEvent): void => {
    if (!this.isMotionEnabled) return;

    const alpha = event.alpha !== null && event.alpha !== undefined ? THREE.MathUtils.degToRad(event.alpha) : 0;
    const beta = event.beta !== null && event.beta !== undefined ? THREE.MathUtils.degToRad(event.beta) : 0;
    const gamma = event.gamma !== null && event.gamma !== undefined ? THREE.MathUtils.degToRad(event.gamma) : 0;
    const orient = THREE.MathUtils.degToRad(this.screenOrientation);

    const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
    this.deviceQuaternion.setFromEuler(euler);
    this.deviceQuaternion.multiply(this.alignQuaternion);
    
    const qScreen = new THREE.Quaternion();
    qScreen.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -orient);
    this.deviceQuaternion.multiply(qScreen);

    if (!this.sensorOffsetQuaternion) {
      this.sensorOffsetQuaternion = new THREE.Quaternion().copy(this.deviceQuaternion);
    }
  };

  private readonly handleOrientationChange = (): void => {
    this.updateScreenOrientation();
  };

  private updateScreenOrientation(): void {
    this.screenOrientation = (globalThis.window.orientation as number) || 0;
    if (globalThis.screen?.orientation?.angle !== undefined) {
      this.screenOrientation = globalThis.screen.orientation.angle;
    }
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.options.onContextLost?.();
  };
}

function createColorGradingMaterial(texture: THREE.VideoTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      map: { value: texture },
      uExposure: { value: 0 },
      uBrightness: { value: 0 },
      uContrast: { value: 1 },
      uSaturation: { value: 1 },
      uTemperature: { value: 0 },
      uTint: { value: 0 },
      uVignette: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float uExposure;
      uniform float uBrightness;
      uniform float uContrast;
      uniform float uSaturation;
      uniform float uTemperature;
      uniform float uTint;
      uniform float uVignette;

      varying vec2 vUv;

      vec3 applySaturation(vec3 color, float saturation) {
        float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
        return mix(vec3(luminance), color, saturation);
      }

      void main() {
        vec4 texel = texture2D(map, vUv);
        vec3 color = texel.rgb;

        color *= pow(2.0, uExposure);
        color += uBrightness;
        color = (color - 0.5) * uContrast + 0.5;
        color = applySaturation(color, uSaturation);

        color.r += uTemperature * 0.08;
        color.b -= uTemperature * 0.08;
        color.g += uTint * 0.06;
        color.r -= uTint * 0.03;
        color.b -= uTint * 0.03;

        float distanceFromCenter = distance(vUv, vec2(0.5));
        float vignette = smoothstep(0.8, 0.2, distanceFromCenter);
        color *= mix(1.0, vignette, uVignette);

        gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
      }
    `,
  });
}
