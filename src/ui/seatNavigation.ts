import type { AuditoriumLayout, SeatPosition } from '../metrics/layout';

/** Keyboard moves on the seat map. "up" is towards the screen, which is drawn at the top. */
export type SeatMove = 'left' | 'right' | 'up' | 'down' | 'home' | 'end';

function seatsInRow(layout: AuditoriumLayout, rowIndex: number): SeatPosition[] {
  return (layout.rows[rowIndex]?.slots ?? []).filter((slot) => slot !== null);
}

/**
 * The seat a keyboard move lands on. Moves never wrap: at the edge of the map the
 * selection stays where it is. Moving between rows picks the seat nearest left-to-right.
 */
export function moveSelection(layout: AuditoriumLayout, fromKey: string, move: SeatMove): string {
  const seat = layout.seatIndex.get(fromKey);
  if (!seat) return fromKey;
  const row = seatsInRow(layout, seat.rowIndex);
  const position = row.indexOf(seat);

  switch (move) {
    case 'left':
      return (row[position - 1] ?? seat).key;
    case 'right':
      return (row[position + 1] ?? seat).key;
    case 'home':
      return (row[0] ?? seat).key;
    case 'end':
      return (row[row.length - 1] ?? seat).key;
    case 'up':
    case 'down': {
      const target = seatsInRow(layout, seat.rowIndex + (move === 'up' ? -1 : 1));
      let nearest: SeatPosition | null = null;
      for (const candidate of target) {
        if (!nearest || Math.abs(candidate.x - seat.x) < Math.abs(nearest.x - seat.x) - 1e-9) {
          nearest = candidate;
        }
      }
      return (nearest ?? seat).key;
    }
  }
}
