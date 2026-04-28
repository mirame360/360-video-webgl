import * as THREE from 'three';
import { clamp } from '../config';

const CAMERA_ORIGIN = new THREE.Vector3(0, 0, 0);
const CAMERA_UP = new THREE.Vector3(0, 1, 0);
const CAMERA_FORWARD = new THREE.Vector3(0, 0, -1);

export function getLookTargetFromYawPitch(yaw: number, pitch: number): THREE.Vector3 {
  const clampedPitch = clamp(pitch, -89, 89);
  const phi = THREE.MathUtils.degToRad(90 - clampedPitch);
  const theta = THREE.MathUtils.degToRad(yaw);

  return new THREE.Vector3(
    500 * Math.sin(phi) * Math.cos(theta),
    500 * Math.cos(phi),
    500 * Math.sin(phi) * Math.sin(theta),
  );
}

export function getCameraQuaternionFromYawPitch(yaw: number, pitch: number): THREE.Quaternion {
  const matrix = new THREE.Matrix4().lookAt(CAMERA_ORIGIN, getLookTargetFromYawPitch(yaw, pitch), CAMERA_UP);
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

export function getRelativeCameraQuaternion(
  from: THREE.Quaternion,
  to: THREE.Quaternion,
): THREE.Quaternion {
  return new THREE.Quaternion().copy(to).multiply(new THREE.Quaternion().copy(from).invert());
}

export function composeMotionCameraQuaternion(
  manualQuaternion: THREE.Quaternion,
  initialSensorQuaternion: THREE.Quaternion,
  currentSensorQuaternion: THREE.Quaternion,
): THREE.Quaternion {
  return getRelativeCameraQuaternion(initialSensorQuaternion, currentSensorQuaternion).multiply(manualQuaternion);
}

export function getYawPitchFromCameraQuaternion(quaternion: THREE.Quaternion): { yaw: number; pitch: number } {
  const direction = CAMERA_FORWARD.clone().applyQuaternion(quaternion).normalize();

  return {
    yaw: THREE.MathUtils.radToDeg(Math.atan2(direction.z, direction.x)),
    pitch: THREE.MathUtils.radToDeg(Math.asin(clamp(direction.y, -1, 1))),
  };
}
