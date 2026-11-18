/**
 * Who is sitting where. Each seat's occupant is drawn from a generator seeded with the
 * auditorium and seat ids, so the same people sit in the same places on every visit and
 * whichever seat you pick.
 */
import type { AuditoriumLayout, SeatPosition } from '../geometry/layout';
import { between, seededRandom } from './random';

/** Share of seats that look taken. */
export const OCCUPANCY_RATE = 0.6;

/** Head shapes: plain, hair bun, cap. */
export const HEAD_STYLES = 3;

export interface Occupant {
  seat: SeatPosition;
  /** 0 … HEAD_STYLES − 1 */
  style: number;
  /** Overall size, so not every head is the same. */
  scale: number;
  /** Sideways shift from the seat centre (m). */
  shiftX: number;
  /** Sideways lean (radians). */
  lean: number;
  /** Head turned left or right (radians). */
  turn: number;
  /** 0 = darkest silhouette, 1 = lightest (grey hair, light jacket). */
  tone: number;
}

export function occupantOf(
  auditoriumId: string,
  seat: SeatPosition,
  rate = OCCUPANCY_RATE,
): Occupant | null {
  const random = seededRandom(auditoriumId, seat.id);
  if (random() >= rate) return null;
  return {
    seat,
    style: Math.min(HEAD_STYLES - 1, Math.floor(random() * HEAD_STYLES)),
    scale: between(random, 0.88, 1.1),
    shiftX: between(random, -0.04, 0.04),
    lean: between(random, -0.07, 0.07),
    turn: between(random, -0.3, 0.3),
    tone: random(),
  };
}

/**
 * The people in the rows in front of `viewerSeatId`. The viewer's own row and the rows behind
 * stay empty: they are out of sight once seated, and the walk-in path stays clear.
 */
export function occupantsInFront(
  auditoriumId: string,
  layout: AuditoriumLayout,
  viewerSeatId: string,
  rate = OCCUPANCY_RATE,
): Occupant[] {
  const viewer = layout.seatById.get(viewerSeatId);
  if (!viewer) return [];
  const out: Occupant[] = [];
  for (const seat of layout.seats) {
    if (seat.rowIndex >= viewer.rowIndex) continue;
    const occupant = occupantOf(auditoriumId, seat, rate);
    if (occupant) out.push(occupant);
  }
  return out;
}
