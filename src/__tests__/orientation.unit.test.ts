import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  composeMotionCameraQuaternion,
  getCameraQuaternionFromYawPitch,
  getLookTargetFromYawPitch,
  getRelativeCameraQuaternion,
  getYawPitchFromCameraQuaternion,
} from '../renderer/orientation';

describe('renderer orientation helpers', () => {
  it.each([
    { yaw: 0, pitch: 0 },
    { yaw: 45, pitch: 12 },
    { yaw: -90, pitch: -20 },
    { yaw: 180, pitch: 60 },
  ])('creates the same camera orientation as lookAt for yaw $yaw pitch $pitch', ({ yaw, pitch }) => {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1100);
    camera.lookAt(getLookTargetFromYawPitch(yaw, pitch));

    const quaternion = getCameraQuaternionFromYawPitch(yaw, pitch);

    expect(Math.abs(camera.quaternion.angleTo(quaternion))).toBeLessThan(0.000001);
  });

  it('round-trips yaw and pitch from a camera quaternion', () => {
    const quaternion = getCameraQuaternionFromYawPitch(38, -15);
    const pose = getYawPitchFromCameraQuaternion(quaternion);

    expect(pose.yaw).toBeCloseTo(38, 5);
    expect(pose.pitch).toBeCloseTo(-15, 5);
  });

  it('calculates sensor deltas in world space', () => {
    const initial = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, THREE.MathUtils.degToRad(20), 0, 'YXZ'));
    const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, THREE.MathUtils.degToRad(15), 0, 'YXZ'));
    const current = new THREE.Quaternion().copy(delta).multiply(initial);

    expect(getRelativeCameraQuaternion(initial, current).angleTo(delta)).toBeLessThan(0.000001);
  });

  it('applies motion before manual yaw and pitch so drag axes stay world-relative', () => {
    const manual = getCameraQuaternionFromYawPitch(35, 10);
    const sensorInitial = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(THREE.MathUtils.degToRad(25), THREE.MathUtils.degToRad(10), 0, 'YXZ'),
    );
    const sensorDelta = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, THREE.MathUtils.degToRad(-30), THREE.MathUtils.degToRad(20), 'YXZ'),
    );
    const sensorCurrent = new THREE.Quaternion().copy(sensorDelta).multiply(sensorInitial);

    const composed = composeMotionCameraQuaternion(manual, sensorInitial, sensorCurrent);
    const expected = new THREE.Quaternion().copy(sensorDelta).multiply(manual);

    expect(composed.angleTo(expected)).toBeLessThan(0.000001);
  });
});
