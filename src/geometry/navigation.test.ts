import { describe, expect, it } from 'vitest';
import { makeLayout } from '../testing/fixtures';
import { nearestSeat, neighbourSeat } from './navigation';

const _ = null;

describe('neighbourSeat', () => {
  // A: 1 2 _ 3 4      (5 cells)
  // B: 1 2 3 4 5 6    (6 cells: centred, so half a seat off the grid of row A)
  // C:     1 2        (2 seats in a 6-cell row)
  const layout = makeLayout({
    rows: [
      { label: 'A', seats: [1, 2, _, 3, 4] },
      { label: 'B', seats: [1, 2, 3, 4, 5, 6] },
      { label: 'C', seats: [_, _, 1, 2, _, _] },
    ],
  });
  const go = (id: string, direction: Parameters<typeof neighbourSeat>[2]) =>
    neighbourSeat(layout, id, direction)?.id;

  it('moves left and right within a row, skipping aisles', () => {
    expect(go('A-2', 'right')).toBe('A-3');
    expect(go('A-3', 'left')).toBe('A-2');
  });

  it('stays put at the ends of a row', () => {
    expect(go('A-1', 'left')).toBe('A-1');
    expect(go('B-6', 'right')).toBe('B-6');
  });

  it('jumps to the first and last seat of the row', () => {
    expect(go('B-3', 'rowStart')).toBe('B-1');
    expect(go('B-3', 'rowEnd')).toBe('B-6');
  });

  it('moves between rows to the seat closest sideways', () => {
    expect(go('A-1', 'down')).toBe('B-1');
    expect(go('A-4', 'down')).toBe('B-6');
    expect(go('B-3', 'up')).toBe('A-2');
    expect(go('B-4', 'up')).toBe('A-3');
    expect(go('B-1', 'down')).toBe('C-1');
    expect(go('C-2', 'up')).toBe('B-4');
  });

  it('stays put at the front and back rows', () => {
    expect(go('A-2', 'up')).toBe('A-2');
    expect(go('C-1', 'down')).toBe('C-1');
  });

  it('returns nothing for an unknown seat', () => {
    expect(go('Z-1', 'left')).toBeUndefined();
  });
});

describe('nearestSeat', () => {
  const layout = makeLayout({
    rows: [
      { label: 'A', seats: [1, 2, _, _, 3, 4] },
      { label: 'B', seats: [1, 2, 3, 4, 5, 6] },
    ],
  });

  it('finds the seat under a point', () => {
    const seat = layout.seatById.get('A-1')!;
    expect(nearestSeat(layout, seat.gridX, 0)?.id).toBe('A-1');
  });

  it('picks the closest seat when the point is in an aisle', () => {
    const left = layout.seatById.get('A-2')!;
    expect(nearestSeat(layout, left.gridX + 0.9, 0)?.id).toBe('A-2');
  });

  it('ignores points far from every seat', () => {
    expect(nearestSeat(layout, 20, 0)).toBeUndefined();
    expect(nearestSeat(layout, 0, 6)).toBeUndefined();
  });
});
