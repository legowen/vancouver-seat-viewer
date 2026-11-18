/** Moving between seats with arrow keys and the nudge buttons, skipping aisles and gaps. */
import type { AuditoriumLayout, SeatPosition } from './layout';

/** "up" is the row closer to the screen, as the map is drawn with the screen at the top. */
export type SeatDirection = 'left' | 'right' | 'up' | 'down' | 'rowStart' | 'rowEnd';

/**
 * The seat reached from `seatId` by one step in `direction`, or the same seat at an edge.
 * Up and down go to the seat in the next row that is closest sideways; on a tie, the one further
 * from the centre, so moving along the end of the rows stays at the end on both sides.
 */
export function neighbourSeat(
  layout: AuditoriumLayout,
  seatId: string,
  direction: SeatDirection,
): SeatPosition | undefined {
  const seat = layout.seatById.get(seatId);
  if (!seat) return undefined;
  const row = layout.rows[seat.rowIndex].seats;
  const index = row.indexOf(seat);

  switch (direction) {
    case 'left':
      return row[Math.max(0, index - 1)];
    case 'right':
      return row[Math.min(row.length - 1, index + 1)];
    case 'rowStart':
      return row[0];
    case 'rowEnd':
      return row[row.length - 1];
    case 'up':
    case 'down': {
      const next = layout.rows[seat.rowIndex + (direction === 'up' ? -1 : 1)];
      if (!next || next.seats.length === 0) return seat;
      let best = next.seats[0];
      for (const candidate of next.seats) {
        const gap = Math.abs(candidate.x - seat.x) - Math.abs(best.x - seat.x);
        if (gap < -1e-9 || (Math.abs(gap) <= 1e-9 && Math.abs(candidate.x) > Math.abs(best.x))) {
          best = candidate;
        }
      }
      return best;
    }
  }
}

/** The seat whose centre is closest to a point given in seat-map cell units. */
export function nearestSeat(
  layout: AuditoriumLayout,
  gridX: number,
  rowIndex: number,
  maxDistance = 1.5,
): SeatPosition | undefined {
  let best: SeatPosition | undefined;
  let bestDistance = maxDistance;
  for (const seat of layout.seats) {
    const distance = Math.hypot(seat.gridX - gridX, seat.rowIndex - rowIndex);
    if (distance < bestDistance) {
      best = seat;
      bestDistance = distance;
    }
  }
  return best;
}
