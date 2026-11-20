import { describe, expect, it } from 'vitest';
import { SIZE_THRESHOLDS, TYPE_DEFAULTS } from '../src/config/defaults';
import type { Auditorium } from '../src/data/schema';
import { findSeat, inferSize, resolveAuditorium, seatKey } from '../src/metrics/layout';

function auditorium(overrides: Partial<Auditorium> = {}): Auditorium {
  return {
    id: 'a-1',
    theatreId: 'a',
    name: 'Auditorium 1',
    type: 'standard',
    rows: [
      { label: 'A', seats: [1, 2, null, 3] },
      { label: 'B', seats: [1, 2, 3, null, 4, 5] },
    ],
    ...overrides,
  };
}

/** n rows of `perRow` seats each, labelled A, B, C… */
function rowsOf(count: number, perRow: number): Auditorium['rows'] {
  return Array.from({ length: count }, (_, index) => ({
    label: String.fromCharCode(65 + index),
    seats: Array.from({ length: perRow }, (_, seat) => seat + 1),
  }));
}

describe('inferSize', () => {
  it('uses seat-count thresholds per auditorium type', () => {
    const standard = SIZE_THRESHOLDS.standard;
    expect(inferSize('standard', standard.medium - 1)).toBe('small');
    expect(inferSize('standard', standard.medium)).toBe('medium');
    expect(inferSize('standard', standard.large - 1)).toBe('medium');
    expect(inferSize('standard', standard.large)).toBe('large');
  });

  it('treats a VIP room as larger than a standard room with the same seat count', () => {
    expect(inferSize('vip', 60)).toBe('medium');
    expect(inferSize('standard', 60)).toBe('small');
  });
});

describe('resolveAuditorium defaults', () => {
  it('fills every missing dimension from the standard defaults', () => {
    const layout = resolveAuditorium(auditorium({ rows: rowsOf(12, 18) }));
    const defaults = TYPE_DEFAULTS.standard;
    expect(layout.size).toBe('medium');
    expect(layout.dims.rowSpacing).toBe(defaults.rowSpacing_m);
    expect(layout.dims.seatWidth).toBe(defaults.seatWidth_m);
    expect(layout.dims.rowRise).toBe(defaults.rowRise_m);
    expect(layout.dims.eyeHeight).toBe(defaults.eyeHeight_m);
    expect(layout.dims.screenWidth).toBe(defaults.bySize.medium.screenWidth_m);
    expect(layout.dims.firstRowDistance).toBe(defaults.bySize.medium.firstRowDistance_m);
  });

  it('uses wider seats and deeper rows for VIP recliners', () => {
    const layout = resolveAuditorium(auditorium({ type: 'vip' }));
    expect(layout.dims.rowSpacing).toBe(1.5);
    expect(layout.dims.seatWidth).toBe(0.75);
  });

  it('gives a large room a wider screen and a more distant first row than a small one', () => {
    const small = resolveAuditorium(auditorium({ rows: rowsOf(8, 12) }));
    const large = resolveAuditorium(auditorium({ rows: rowsOf(16, 24) }));
    expect(small.size).toBe('small');
    expect(large.size).toBe('large');
    expect(large.dims.screenWidth).toBeGreaterThan(small.dims.screenWidth);
    expect(large.dims.firstRowDistance).toBeGreaterThan(small.dims.firstRowDistance);
  });

  it('keeps every value the file does give, including part of the screen object', () => {
    const layout = resolveAuditorium(
      auditorium({
        screen: { width_m: 14 },
        firstRowDistance_m: 5,
        rowSpacing_m: 1.1,
        rowRise_m: 0.4,
        seatWidth_m: 0.6,
        eyeHeight_m: 1.2,
      }),
    );
    expect(layout.dims).toMatchObject({
      screenWidth: 14,
      firstRowDistance: 5,
      rowSpacing: 1.1,
      rowRise: 0.4,
      seatWidth: 0.6,
      eyeHeight: 1.2,
    });
    expect(layout.dims.screenAspect).toBe(2.39);
  });

  it('derives the screen rectangle from width, aspect and bottom height', () => {
    const layout = resolveAuditorium(
      auditorium({ screen: { width_m: 12, aspect: 2, bottomHeight_m: 1 } }),
    );
    expect(layout.screen.width).toBe(12);
    expect(layout.screen.height).toBeCloseTo(6);
    expect(layout.screen.bottom).toBe(1);
    expect(layout.screen.top).toBeCloseTo(7);
    expect(layout.screen.centerY).toBeCloseTo(4);
  });

  it('marks dimensions as estimated unless the file says they were verified', () => {
    expect(resolveAuditorium(auditorium()).estimated).toBe(true);
    expect(resolveAuditorium(auditorium({ verified: false })).estimated).toBe(true);
    expect(resolveAuditorium(auditorium({ verified: true })).estimated).toBe(false);
  });

  it('defaults the entrance to the front left', () => {
    expect(resolveAuditorium(auditorium()).entrance).toBe('front-left');
    expect(resolveAuditorium(auditorium({ entrance: 'back-right' })).entrance).toBe('back-right');
  });
});

describe('resolveAuditorium seat positions', () => {
  const layout = resolveAuditorium(
    auditorium({
      firstRowDistance_m: 6,
      rowSpacing_m: 1,
      rowRise_m: 0.3,
      seatWidth_m: 0.5,
      eyeHeight_m: 1.1,
    }),
  );

  it('places each row further back and higher than the one in front', () => {
    expect(layout.rows.map((row) => row.z)).toEqual([6, 7]);
    expect(layout.rows[0]!.floorY).toBe(0);
    expect(layout.rows[1]!.floorY).toBeCloseTo(0.3);
  });

  it('puts the eyes at eye height above the floor of the row', () => {
    const seat = findSeat(layout, 'B-4')!;
    expect(seat.z).toBe(7);
    expect(seat.eyeY).toBeCloseTo(0.3 + 1.1);
  });

  it('centres rows on the screen and lets gaps take up a seat width', () => {
    const row = layout.rows[0]!;
    expect(row.slotX).toEqual([-0.75, -0.25, 0.25, 0.75]);
    expect(row.slots[2]).toBeNull();
    expect(findSeat(layout, 'A-3')!.x).toBeCloseTo(0.75);
  });

  it('lines rows up on the left or right edge when asked', () => {
    const left = resolveAuditorium(auditorium({ rowAlign: 'left', seatWidth_m: 0.5 }));
    const right = resolveAuditorium(auditorium({ rowAlign: 'right', seatWidth_m: 0.5 }));
    // The widest row (6 slots) spans -1.25 … 1.25 either way.
    expect(left.rows[0]!.slotX[0]).toBeCloseTo(-1.25);
    expect(right.rows[0]!.slotX[3]).toBeCloseTo(1.25);
    expect(left.rows[1]!.slotX[0]).toBeCloseTo(-1.25);
  });

  it('counts seats and records the widest row', () => {
    expect(layout.seatCount).toBe(8);
    expect(layout.seats).toHaveLength(8);
    expect(layout.maxSlots).toBe(6);
    expect(layout.seatingHalfWidth).toBeCloseTo(1.5);
  });

  it('keys seats as <row>-<number> and finds them again', () => {
    expect(seatKey('K', 23)).toBe('K-23');
    expect(findSeat(layout, 'A-1')).toMatchObject({
      row: 'A',
      number: 1,
      rowIndex: 0,
      slotIndex: 0,
    });
    expect(findSeat(layout, 'A-9')).toBeUndefined();
    expect(findSeat(layout, 'nonsense')).toBeUndefined();
  });
});
