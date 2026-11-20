import { describe, expect, it } from 'vitest';
import type { Auditorium } from '../src/data/schema';
import { resolveAuditorium } from '../src/metrics/layout';
import { moveSelection } from '../src/ui/seatNavigation';

// Row A is shorter than row B and centred, so A-1 sits directly in front of B-2.
//   A:       [1] [2]  _  [3]
//   B:   [1] [2] [3] [4] [5] [6]
const layout = resolveAuditorium({
  id: 'nav',
  theatreId: 't',
  name: 'Nav',
  type: 'standard',
  seatWidth_m: 0.5,
  rows: [
    { label: 'A', seats: [1, 2, null, 3] },
    { label: 'B', seats: [1, 2, 3, 4, 5, 6] },
    { label: 'C', seats: [6, 5, 4, 3, 2, 1] },
  ],
} satisfies Auditorium);

describe('moveSelection', () => {
  it('moves along the row and jumps over aisles', () => {
    expect(moveSelection(layout, 'A-1', 'right')).toBe('A-2');
    expect(moveSelection(layout, 'A-2', 'right')).toBe('A-3');
    expect(moveSelection(layout, 'A-3', 'left')).toBe('A-2');
  });

  it('stays put at the end of a row', () => {
    expect(moveSelection(layout, 'A-1', 'left')).toBe('A-1');
    expect(moveSelection(layout, 'B-6', 'right')).toBe('B-6');
  });

  it('follows the order on the map, not the seat numbers', () => {
    // Row C is numbered right to left.
    expect(moveSelection(layout, 'C-6', 'right')).toBe('C-5');
    expect(moveSelection(layout, 'C-1', 'left')).toBe('C-2');
  });

  it('jumps to the first or last seat of the row', () => {
    expect(moveSelection(layout, 'B-3', 'home')).toBe('B-1');
    expect(moveSelection(layout, 'B-3', 'end')).toBe('B-6');
  });

  it('moves towards the screen and away from it to the nearest seat', () => {
    expect(moveSelection(layout, 'B-6', 'up')).toBe('A-3');
    expect(moveSelection(layout, 'B-1', 'up')).toBe('A-1');
    expect(moveSelection(layout, 'A-3', 'down')).toBe('B-5');
    expect(moveSelection(layout, 'B-2', 'down')).toBe('C-5');
  });

  it('stays put in the first and last rows', () => {
    expect(moveSelection(layout, 'A-2', 'up')).toBe('A-2');
    expect(moveSelection(layout, 'C-3', 'down')).toBe('C-3');
  });

  it('returns the key unchanged when the seat does not exist', () => {
    expect(moveSelection(layout, 'Z-9', 'left')).toBe('Z-9');
  });
});
