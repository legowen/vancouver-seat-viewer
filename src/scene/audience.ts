import type { AuditoriumLayout, SeatPosition } from '../metrics/layout';
import { hashString, seededRandom } from './random';

/** Share of seats that look occupied. */
export const OCCUPANCY = 0.6;
/** Number of hair tones the 3D heads choose from. */
export const HAIR_TONES = 5;

export interface AudienceMember {
  seat: SeatPosition;
  /** Sideways lean, in metres. */
  offsetX: number;
  /** Size relative to an average person. */
  scale: number;
  /** Index into the hair palette, 0 … HAIR_TONES - 1. */
  tone: number;
}

/**
 * People sitting in the rows in front of `viewer`. Whether a seat is taken depends only on
 * the auditorium and that seat, so a given seat always shows the same heads in front of it,
 * and moving to another seat keeps everyone where they were.
 */
export function audienceInFrontOf(
  layout: AuditoriumLayout,
  viewer: SeatPosition | null,
  occupancy: number = OCCUPANCY,
): AudienceMember[] {
  if (!viewer) return [];
  const members: AudienceMember[] = [];
  for (const seat of layout.seats) {
    // Seats are listed front row first.
    if (seat.rowIndex >= viewer.rowIndex) break;
    const random = seededRandom(hashString(`${layout.auditorium.id}:${seat.key}`));
    if (random() >= occupancy) continue;
    members.push({
      seat,
      offsetX: (random() - 0.5) * 0.08,
      scale: 0.9 + random() * 0.2,
      tone: Math.floor(random() * HAIR_TONES),
    });
  }
  return members;
}
