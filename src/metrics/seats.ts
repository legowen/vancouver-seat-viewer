/** Metrics and rating for every seat of an auditorium, and the pick of the best seat. */
import type { AuditoriumLayout, SeatPosition } from '../geometry/layout';
import { computeMetrics, type SeatMetrics } from './metrics';
import { bandRank, rateSeat, type SeatRating } from './rating';

export interface SeatEvaluation {
  seat: SeatPosition;
  metrics: SeatMetrics;
  rating: SeatRating;
}

export function evaluateSeat(layout: AuditoriumLayout, seat: SeatPosition): SeatEvaluation {
  const metrics = computeMetrics(seat.eye, layout.screen);
  return { seat, metrics, rating: rateSeat(metrics) };
}

/** Every seat, keyed by seat id, in seat-map order (front row first, left to right). */
export function evaluateSeats(layout: AuditoriumLayout): Map<string, SeatEvaluation> {
  const out = new Map<string, SeatEvaluation>();
  for (const seat of layout.seats) out.set(seat.id, evaluateSeat(layout, seat));
  return out;
}

/** The viewing angle that feels best inside the prime band (°). */
const IDEAL_ANGLE = 50;

/**
 * Lower is better: the band first, then how central the seat is, how close the viewing angle is
 * to the ideal, and how far you look up.
 */
export function seatScore(evaluation: SeatEvaluation): number {
  const { metrics, rating } = evaluation;
  return (
    bandRank(rating.band) * 1000 +
    metrics.offAxis_deg * 2 +
    Math.abs(metrics.viewingAngle_deg - IDEAL_ANGLE) +
    Math.max(0, metrics.verticalAngle_deg - 15) * 0.5
  );
}

/** The seat the seat map starts on. Ties go to the seat nearer the front, then further left. */
export function bestSeat(evaluations: Iterable<SeatEvaluation>): SeatEvaluation | undefined {
  let best: SeatEvaluation | undefined;
  let bestScore = Infinity;
  for (const evaluation of evaluations) {
    const score = seatScore(evaluation);
    if (score < bestScore - 1e-9) {
      best = evaluation;
      bestScore = score;
    }
  }
  return best;
}
