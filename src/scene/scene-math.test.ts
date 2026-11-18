import { describe, expect, it } from 'vitest';
import { makeLayout } from '../testing/fixtures';
import {
  LOOK_LIMITS,
  VIEW_FOV,
  aimAngles,
  clampLook,
  dragToLook,
  horizontalFov,
  insetProjection,
  verticalFov,
} from './camera';
import { HEAD_STYLES, occupantOf, occupantsInFront } from './occupancy';
import { hashString, mulberry32, seededRandom } from './random';

describe('random', () => {
  it('hashes strings deterministically', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('K-23')).toBe(hashString('K-23'));
    expect(hashString('K-23')).not.toBe(hashString('K-24'));
  });

  it('repeats the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const first = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(first);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('spreads values over [0, 1)', () => {
    const random = seededRandom('spread');
    const values = Array.from({ length: 2000 }, random);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

describe('occupancy', () => {
  const layout = makeLayout();
  const viewer = layout.seatById.get('J-9')!;

  it('only fills rows in front of the viewer', () => {
    const occupants = occupantsInFront('test-room', layout, 'J-9');
    expect(occupants.length).toBeGreaterThan(0);
    for (const occupant of occupants) {
      expect(occupant.seat.rowIndex).toBeLessThan(viewer.rowIndex);
    }
  });

  it('looks the same every time', () => {
    expect(occupantsInFront('test-room', layout, 'J-9')).toEqual(
      occupantsInFront('test-room', layout, 'J-9'),
    );
  });

  it('keeps the same people in the same seats whichever seat you pick', () => {
    const fromJ = occupantsInFront('test-room', layout, 'J-9').filter((o) => o.seat.rowIndex < 3);
    const fromN = occupantsInFront('test-room', layout, 'N-2').filter((o) => o.seat.rowIndex < 3);
    expect(fromN).toEqual(fromJ);
  });

  it('differs between auditoriums', () => {
    const ids = (room: string) =>
      occupantsInFront(room, layout, 'N-9')
        .map((o) => o.seat.id)
        .join();
    expect(ids('room-a')).not.toBe(ids('room-b'));
  });

  it('fills roughly the configured share of seats', () => {
    const occupants = occupantsInFront('test-room', layout, 'N-9');
    const inFront = layout.seats.filter((s) => s.rowIndex < 13).length;
    const share = occupants.length / inFront;
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.75);
  });

  it('keeps every variation in range', () => {
    for (const seat of layout.seats) {
      const o = occupantOf('test-room', seat, 1);
      expect(o).not.toBeNull();
      expect(o!.style).toBeGreaterThanOrEqual(0);
      expect(o!.style).toBeLessThan(HEAD_STYLES);
      expect(o!.scale).toBeGreaterThanOrEqual(0.88);
      expect(o!.scale).toBeLessThan(1.1);
      expect(Math.abs(o!.shiftX)).toBeLessThanOrEqual(0.04);
    }
  });

  it('returns nobody for an unknown seat or a zero rate', () => {
    expect(occupantsInFront('test-room', layout, 'Z-1')).toEqual([]);
    expect(occupantsInFront('test-room', layout, 'N-9', 0)).toEqual([]);
  });
});

describe('camera', () => {
  it('keeps an 80° horizontal field on landscape screens', () => {
    const aspect = 16 / 9;
    expect(horizontalFov(verticalFov(aspect), aspect)).toBeCloseTo(VIEW_FOV.horizontal, 6);
  });

  it('caps the vertical field on tall phone screens', () => {
    const portrait = 360 / 740;
    expect(verticalFov(portrait)).toBe(VIEW_FOV.maxVertical);
    expect(horizontalFov(verticalFov(portrait), portrait)).toBeLessThan(VIEW_FOV.horizontal);
    expect(verticalFov(10)).toBe(VIEW_FOV.minVertical);
    expect(verticalFov(0)).toBeGreaterThan(0);
  });

  it('clamps drag-to-look to ±40° yaw and ±20° pitch', () => {
    expect(LOOK_LIMITS).toEqual({ yaw: 40, pitch: 20 });
    expect(clampLook({ yaw: 55, pitch: -31 })).toEqual({ yaw: 40, pitch: -20 });
    expect(clampLook({ yaw: -12, pitch: 7 })).toEqual({ yaw: -12, pitch: 7 });
  });

  it('aims at a point straight ahead, to the side and above', () => {
    const ahead = aimAngles({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 });
    expect(ahead.yaw).toBeCloseTo(0, 10);
    expect(ahead.pitch).toBeCloseTo(0, 10);
    const left = aimAngles({ x: 0, y: 0, z: 10 }, { x: -10, y: 0, z: 0 });
    expect(left.yaw).toBeCloseTo(Math.PI / 4, 10);
    const up = aimAngles({ x: 0, y: 0, z: 10 }, { x: 0, y: 10, z: 0 });
    expect(up.pitch).toBeCloseTo(Math.PI / 4, 10);
  });

  it('turns a drag into degrees so the scene follows the finger', () => {
    expect(dragToLook(180, -36, 360, 80)).toEqual({ yaw: 40, pitch: -8 });
    expect(dragToLook(10, 0, 0, 80).yaw).toBe(800);
  });

  it('moves the aim point above a bottom card without changing the visible field', () => {
    const p = insetProjection(400, 800, 200, 90);
    expect(p.fullHeight).toBe(1000);
    expect(p.offsetY).toBe(200);
    expect(p.aspect).toBeCloseTo(0.4, 10);
    // The 800 visible pixels still cover a 90° field: tan(fov/2) scales with the image height.
    expect(Math.tan(((p.fov / 2) * Math.PI) / 180)).toBeCloseTo((1 * 1000) / 800, 10);
    expect(insetProjection(400, 800, 0, 90)).toEqual({
      fov: expect.closeTo(90, 10),
      aspect: 0.5,
      fullHeight: 800,
      offsetY: 0,
    });
  });
});
