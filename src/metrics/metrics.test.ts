import { describe, expect, it } from 'vitest';
import { computeMetrics, type ScreenGeometry } from './metrics';

/** 12 m wide, 5 m tall, bottom edge 1.2 m above the floor. */
const screen: ScreenGeometry = { width: 12, top: 6.2, centre: { x: 0, y: 3.7, z: 0 } };

const deg = (radians: number) => (radians * 180) / Math.PI;

describe('computeMetrics', () => {
  it('measures a seat straight in front of the screen centre', () => {
    const m = computeMetrics({ x: 0, y: 3.7, z: 10 }, screen);
    expect(m.distance_m).toBeCloseTo(10, 10);
    expect(m.viewingAngle_deg).toBeCloseTo(deg(2 * Math.atan(6 / 10)), 10);
    expect(m.viewingAngle_deg).toBeCloseTo(61.9275, 4);
    expect(m.offAxis_deg).toBe(0);
    expect(m.verticalAngle_deg).toBeCloseTo(deg(Math.atan(2.5 / 10)), 10);
    expect(m.verticalAngle_deg).toBeCloseTo(14.0362, 4);
  });

  it('measures a low seat near the front and to the side', () => {
    const m = computeMetrics({ x: 3, y: 1.7, z: 4 }, screen);
    expect(m.distance_m).toBeCloseTo(Math.sqrt(29), 10);
    expect(m.viewingAngle_deg).toBeCloseTo(112.6199, 4);
    expect(m.offAxis_deg).toBeCloseTo(36.8699, 4);
    expect(m.verticalAngle_deg).toBeCloseTo(48.3665, 4);
  });

  it('gives a 90° viewing angle when half the screen width equals the distance', () => {
    expect(computeMetrics({ x: 0, y: 3.7, z: 6 }, screen).viewingAngle_deg).toBeCloseTo(90, 10);
  });

  it('uses the distance to the screen plane for the viewing angle, not the slant distance', () => {
    const centre = computeMetrics({ x: 0, y: 2, z: 12 }, screen);
    const side = computeMetrics({ x: 5, y: 6, z: 12 }, screen);
    expect(side.viewingAngle_deg).toBeCloseTo(centre.viewingAngle_deg, 10);
    expect(side.distance_m).toBeGreaterThan(centre.distance_m);
  });

  it('measures the side angle in the horizontal plane only', () => {
    const level = computeMetrics({ x: 4, y: 3.7, z: 8 }, screen);
    const high = computeMetrics({ x: 4, y: 9, z: 8 }, screen);
    expect(level.offAxis_deg).toBeCloseTo(deg(Math.atan(4 / 8)), 10);
    expect(high.offAxis_deg).toBeCloseTo(level.offAxis_deg, 10);
  });

  it('is symmetric left and right', () => {
    const left = computeMetrics({ x: -3, y: 3, z: 9 }, screen);
    const right = computeMetrics({ x: 3, y: 3, z: 9 }, screen);
    expect(left).toEqual(right);
  });

  it('gives a negative vertical angle when the eye is above the top of the screen', () => {
    expect(computeMetrics({ x: 0, y: 8.2, z: 20 }, screen).verticalAngle_deg).toBeCloseTo(
      deg(Math.atan(-2 / 20)),
      10,
    );
  });

  it('gets smaller in every angle as you move back', () => {
    const near = computeMetrics({ x: 2, y: 2, z: 7 }, screen);
    const far = computeMetrics({ x: 2, y: 2, z: 14 }, screen);
    expect(far.viewingAngle_deg).toBeLessThan(near.viewingAngle_deg);
    expect(far.offAxis_deg).toBeLessThan(near.offAxis_deg);
    expect(far.verticalAngle_deg).toBeLessThan(near.verticalAngle_deg);
    expect(far.distance_m).toBeGreaterThan(near.distance_m);
  });

  it('never divides by zero', () => {
    const m = computeMetrics({ x: 0, y: 3.7, z: 0 }, screen);
    expect(Number.isFinite(m.viewingAngle_deg)).toBe(true);
    expect(m.viewingAngle_deg).toBeCloseTo(180, 3);
  });
});
