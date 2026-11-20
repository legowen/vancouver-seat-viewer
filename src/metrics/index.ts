import { BANDS, RATING, type RatingThresholds } from '../config/rating';
import type { AuditoriumLayout, SeatPosition } from './layout';
import { computeSeatMetrics, type SeatMetrics } from './metrics';
import { rateSeat, type SeatRating } from './rating';

export interface RatedSeat {
  seat: SeatPosition;
  metrics: SeatMetrics;
  rating: SeatRating;
}

export function rateSeatAt(
  layout: AuditoriumLayout,
  seat: SeatPosition,
  thresholds: RatingThresholds = RATING,
): RatedSeat {
  const metrics = computeSeatMetrics({ x: seat.x, y: seat.eyeY, z: seat.z }, layout.screen);
  return { seat, metrics, rating: rateSeat(metrics, thresholds) };
}

/** Metrics and rating for every seat, keyed by seat key, front row first. */
export function rateLayout(
  layout: AuditoriumLayout,
  thresholds: RatingThresholds = RATING,
): Map<string, RatedSeat> {
  return new Map(layout.seats.map((seat) => [seat.key, rateSeatAt(layout, seat, thresholds)]));
}

/**
 * The seat to suggest before the user picks one: from the best band on offer, the one
 * closest to the centre line and to the ideal viewing angle.
 */
export function pickDefaultSeat(
  rated: ReadonlyMap<string, RatedSeat>,
  idealViewingAngle: number = RATING.idealViewingAngle,
): string | null {
  let best: RatedSeat | null = null;
  let bestRank = Infinity;
  let bestScore = Infinity;
  for (const entry of rated.values()) {
    const rank = BANDS.indexOf(entry.rating.band);
    const score =
      entry.metrics.offAxis ** 2 + (entry.metrics.viewingAngle - idealViewingAngle) ** 2;
    if (rank < bestRank || (rank === bestRank && score < bestScore)) {
      best = entry;
      bestRank = rank;
      bestScore = score;
    }
  }
  return best ? best.seat.key : null;
}
