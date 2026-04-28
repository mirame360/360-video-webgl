import { describe, expect, it } from 'vitest';
import { getDragPoseDelta } from '../renderer/controls';

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
});
