/**
 * Turns seat metrics into a rating band and a verdict. Thresholds come from
 * `src/config/rating.ts`; the rules are listed in `.claude/skills/seat-metrics/SKILL.md`.
 */
import { BANDS, RATING, type Band, type RatingThresholds } from '../config/rating';
import type { MessageKey } from '../i18n';
import type { SeatMetrics } from './metrics';

/** Why a seat is "avoid", or that it was moved down a band for its side angle. */
export type RatingReason = 'tooClose' | 'neck' | 'side' | 'offAxis';

export interface SeatRating {
  band: Band;
  /** `null` when the band comes from the viewing angle alone. */
  reason: RatingReason | null;
}

export type VerdictKey = Extract<MessageKey, `verdict.${string}`>;
export type BandLabelKey = Extract<MessageKey, `band.${string}`>;

function baseBand(viewingAngle: number, t: RatingThresholds): Exclude<Band, 'avoid'> {
  if (viewingAngle >= t.primeMin) return 'prime';
  if (viewingAngle >= t.recommendedMin) return 'recommended';
  if (viewingAngle >= t.okMin) return 'ok';
  return 'meh';
}

const ONE_DOWN: Record<Exclude<Band, 'avoid'>, Exclude<Band, 'avoid'>> = {
  prime: 'recommended',
  recommended: 'ok',
  ok: 'meh',
  meh: 'meh',
};

export function rateSeat(metrics: SeatMetrics, thresholds: RatingThresholds = RATING): SeatRating {
  const t = thresholds;
  if (metrics.viewingAngle_deg > t.avoidViewingAngle) return { band: 'avoid', reason: 'tooClose' };
  if (metrics.verticalAngle_deg > t.avoidVerticalAngle) return { band: 'avoid', reason: 'neck' };
  if (metrics.offAxis_deg > t.avoidOffAxis) return { band: 'avoid', reason: 'side' };

  const band = baseBand(metrics.viewingAngle_deg, t);
  if (metrics.offAxis_deg > t.demoteOffAxis) return { band: ONE_DOWN[band], reason: 'offAxis' };
  return { band, reason: null };
}

export function verdictKey(rating: SeatRating): VerdictKey {
  switch (rating.band) {
    case 'avoid':
      if (rating.reason === 'neck') return 'verdict.avoidNeck';
      if (rating.reason === 'side') return 'verdict.avoidSide';
      return 'verdict.avoidTooClose';
    case 'meh':
      return rating.reason === 'offAxis' ? 'verdict.mehOffAxis' : 'verdict.meh';
    default:
      return rating.reason === 'offAxis' ? 'verdict.offAxis' : `verdict.${rating.band}`;
  }
}

export function bandLabelKey(band: Band): BandLabelKey {
  return `band.${band}`;
}

/** 0 for prime … 4 for avoid. */
export function bandRank(band: Band): number {
  return BANDS.indexOf(band);
}
