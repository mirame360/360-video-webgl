import * as THREE from 'three';
import { clamp } from '../config';

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
  private readonly material: THREE.MeshBasicMaterial;
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
    this.material = new THREE.MeshBasicMaterial({ 
      map: this.texture,
      side: THREE.DoubleSide
    });
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
    this.updateCameraPose();
    this.renderer.render(this.scene, this.camera);
    this.options.onFrame?.();
    this.animationFrame = requestAnimationFrame(this.render);
  };

  private updateCameraPose(): void {
    if (this.isMotionEnabled) {
      const manualRotation = new THREE.Quaternion();
      const eulerManual = new THREE.Euler(
        THREE.MathUtils.degToRad(this.pitch),
        THREE.MathUtils.degToRad(this.yaw),
        0,
        'YXZ'
      );
      manualRotation.setFromEuler(eulerManual);

      if (this.sensorOffsetQuaternion) {
        const relativeSensorRotation = new THREE.Quaternion()
          .copy(this.sensorOffsetQuaternion)
          .invert()
          .multiply(this.deviceQuaternion);
        
        this.camera.quaternion.copy(manualRotation).multiply(relativeSensorRotation);
      } else {
        this.camera.quaternion.copy(manualRotation);
      }
    } else {
      this.updateCameraRotation();
    }
  }

  private updateCameraRotation(): void {
    const phi = THREE.MathUtils.degToRad(90 - this.pitch);
    const theta = THREE.MathUtils.degToRad(this.yaw);
    const target = new THREE.Vector3(
      500 * Math.sin(phi) * Math.cos(theta),
      500 * Math.cos(phi),
      500 * Math.sin(phi) * Math.sin(theta),
    );
    this.camera.lookAt(target);
  }

  private updateYawPitchFromCamera(): void {
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = THREE.MathUtils.radToDeg(euler.y);
    this.pitch = THREE.MathUtils.radToDeg(euler.x);
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
