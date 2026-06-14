import { describe, expect, it } from 'vitest';
import { getDragPoseDelta, isInteractiveControlTarget } from '../renderer/controls';

describe('pointer control drag deltas', () => {
  it('keeps the existing drag pitch direction when motion is disabled', () => {
    expect(getDragPoseDelta(20, 20, false)).toEqual({
      yaw: -5,
      pitch: 5,
    });
  });

  it('inverts vertical drag when motion controls are enabled', () => {
    expect(getDragPoseDelta(20, 20, true)).toEqual({
      yaw: -5,
      pitch: -5,
    });
  });

  it('keeps buttons and form controls out of panorama gestures', () => {
    const button = document.createElement('button');
    const icon = document.createElement('span');
    button.appendChild(icon);
    const canvas = document.createElement('canvas');

    expect(isInteractiveControlTarget(button)).toBe(true);
    expect(isInteractiveControlTarget(icon)).toBe(true);
    expect(isInteractiveControlTarget(document.createElement('input'))).toBe(true);
    expect(isInteractiveControlTarget(canvas)).toBe(false);
  });
});
