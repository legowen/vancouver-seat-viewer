import { describe, expect, it } from 'vitest';
import { ROOM } from '../config/defaults';
import { resolveAuditorium } from '../data/resolve';
import { auditoriumSchema, type AuditoriumInput } from '../data/schema';
import { computeLayout, floorHeightAt, seatId } from './layout';

function layoutOf(patch: Partial<AuditoriumInput> = {}) {
  const auditorium = resolveAuditorium(
    auditoriumSchema.parse({
      id: 'test',
      theatreId: 'theatre',
      name: 'Test',
      screen: { width_m: 12, aspect: 2.4, bottomHeight_m: 1.2 },
      firstRowDistance_m: 5,
      rowSpacing_m: 1,
      rowRise_m: 0.35,
      seatWidth_m: 0.5,
      eyeHeight_m: 1.15,
      rows: [
        { label: 'A', seats: [1, 2, 3, null, 4, 5, 6] },
        { label: 'B', seats: [1, 2, 3, null, 4, 5, 6] },
        { label: 'C', seats: [1, 2, 3, 4] },
      ],
      ...patch,
    }),
  );
  return computeLayout(auditorium);
}

describe('computeLayout', () => {
  it('places rows by distance and rise', () => {
    const layout = layoutOf();
    expect(layout.rows.map((row) => row.z)).toEqual([5, 6, 7]);
    expect(layout.rows.map((row) => row.floorY)).toEqual([0, 0.35, 0.7]);
    expect(layout.rows.map((row) => row.label)).toEqual(['A', 'B', 'C']);
  });

  it('centres each row on the screen axis, skipping gaps', () => {
    const layout = layoutOf();
    const rowA = layout.rows[0].seats;
    expect(rowA.map((seat) => seat.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rowA.map((seat) => seat.x)).toEqual([-1.5, -1, -0.5, 0.5, 1, 1.5]);
    expect(rowA.map((seat) => seat.cell)).toEqual([0, 1, 2, 4, 5, 6]);
  });

  it('centres a shorter row too, which can put it half a seat off the grid', () => {
    const rowC = layoutOf().rows[2].seats;
    expect(rowC.map((seat) => seat.x)).toEqual([-0.75, -0.25, 0.25, 0.75]);
    expect(rowC.map((seat) => seat.gridX)).toEqual([-1.5, -0.5, 0.5, 1.5]);
  });

  it('puts the eye at eye height above the row floor', () => {
    const layout = layoutOf();
    const seat = layout.seatById.get('B-4')!;
    expect(seat.eye).toEqual({ x: 0.5, y: 0.35 + 1.15, z: 6 });
    expect(seat.floorY).toBe(0.35);
    expect(seat.rowIndex).toBe(1);
  });

  it('gives every seat a unique id', () => {
    const layout = layoutOf();
    expect(layout.seats).toHaveLength(16);
    expect(layout.seatById.size).toBe(16);
    expect(seatId('K', 23)).toBe('K-23');
    expect(layout.seatById.get('A-1')?.rowLabel).toBe('A');
  });

  it('describes the screen', () => {
    const { screen } = layoutOf();
    expect(screen.width).toBe(12);
    expect(screen.height).toBeCloseTo(5);
    expect(screen.bottom).toBe(1.2);
    expect(screen.top).toBeCloseTo(6.2);
    expect(screen.centre).toEqual({ x: 0, y: expect.closeTo(3.7), z: 0 });
  });

  it('builds a room that contains the seats, the aisles and the screen', () => {
    const layout = layoutOf();
    expect(layout.maxCells).toBe(7);
    expect(layout.blockHalfWidth).toBeCloseTo(1.75);
    expect(layout.room.sideAisle).toBe(ROOM.sideAisle_m.standard);
    // The screen is wider than the seat block here, so it sets the room width.
    expect(layout.room.halfWidth).toBeCloseTo(6 + ROOM.besideScreen_m);
    expect(layout.room.backZ).toBeGreaterThan(7 + ROOM.backWalkway_m);
    expect(layout.room.ceilingY).toBeGreaterThanOrEqual(layout.screen.top + ROOM.aboveScreen_m);
    expect(layout.room.stepFrontZ).toHaveLength(3);
    expect(layout.room.stepFrontZ[1]).toBeCloseTo(6 - ROOM.rowFrontShare);
  });

  it('widens the room when the seat block is wider than the screen', () => {
    const wide = layoutOf({
      screen: { width_m: 4 },
      rows: [{ label: 'A', seats: Array.from({ length: 20 }, (_unused, i) => i + 1) }],
    });
    expect(wide.room.halfWidth).toBeCloseTo(5 + ROOM.sideAisle_m.standard);
  });
});

describe('floorHeightAt', () => {
  const layout = layoutOf();
  const step1 = layout.room.stepFrontZ[1];
  const step2 = layout.room.stepFrontZ[2];

  it('is flat in front of the second row', () => {
    expect(floorHeightAt(layout, 0)).toBe(0);
    expect(floorHeightAt(layout, layout.rows[0].z)).toBe(0);
    expect(floorHeightAt(layout, step1 - 0.01)).toBe(0);
  });

  it('steps up at the front edge of each row', () => {
    expect(floorHeightAt(layout, step1)).toBeCloseTo(0.35);
    expect(floorHeightAt(layout, layout.rows[1].z)).toBeCloseTo(0.35);
    expect(floorHeightAt(layout, step2)).toBeCloseTo(0.7);
    expect(floorHeightAt(layout, 50)).toBeCloseTo(0.7);
  });

  it('matches every row floor at the row itself', () => {
    for (const row of layout.rows) {
      expect(floorHeightAt(layout, row.z)).toBeCloseTo(row.floorY);
      expect(floorHeightAt(layout, row.z, 0.3)).toBeCloseTo(row.floorY);
    }
  });

  it('ramps smoothly over the blend distance', () => {
    const blend = 0.4;
    expect(floorHeightAt(layout, step1 - blend, blend)).toBeCloseTo(0);
    expect(floorHeightAt(layout, step1 - blend / 2, blend)).toBeCloseTo(0.175);
    expect(floorHeightAt(layout, step1, blend)).toBeCloseTo(0.35);
    const samples = Array.from({ length: 40 }, (_unused, i) =>
      floorHeightAt(layout, 4 + i * 0.1, blend),
    );
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
  });
});
