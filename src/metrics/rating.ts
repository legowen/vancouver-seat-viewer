import { BANDS, RATING, type Band, type RatingThresholds } from '../config/rating';
import type { SeatMetrics } from './metrics';

/** Why a seat is worse than its viewing angle alone would suggest. */
export type RatingReason = 'neck' | 'tooClose' | 'side' | 'sideMild';

/** i18n keys of the one-line verdicts. Each must exist in every locale file. */
export type VerdictKey =
  | 'verdict.prime'
  | 'verdict.recommended'
  | 'verdict.ok'
  | 'verdict.meh'
  | 'verdict.neck'
  | 'verdict.tooClose'
  | 'verdict.side'
  | 'verdict.sideMild';

export interface SeatRating {
  band: Band;
  /** Most important first. Empty when the viewing angle alone decided the band. */
  reasons: RatingReason[];
  verdict: VerdictKey;
}

const BAND_VERDICTS: Record<Exclude<Band, 'avoid'>, VerdictKey> = {
  prime: 'verdict.prime',
  recommended: 'verdict.recommended',
  ok: 'verdict.ok',
  meh: 'verdict.meh',
};

const REASON_VERDICTS: Record<RatingReason, VerdictKey> = {
  neck: 'verdict.neck',
  tooClose: 'verdict.tooClose',
  side: 'verdict.side',
  sideMild: 'verdict.sideMild',
};

function bandForViewingAngle(angle: number, thresholds: RatingThresholds): Band {
  if (angle >= thresholds.primeFrom) return 'prime';
  if (angle >= thresholds.recommendedFrom) return 'recommended';
  if (angle >= thresholds.okFrom) return 'ok';
  return 'meh';
}

/** Puts a seat in a band and picks the sentence that explains it. */
export function rateSeat(metrics: SeatMetrics, thresholds: RatingThresholds = RATING): SeatRating {
  // Hard limits first, in the order a person would feel them.
  const hard: RatingReason[] = [];
  if (metrics.verticalToTop > thresholds.maxVerticalToTop) hard.push('neck');
  if (metrics.viewingAngle > thresholds.maxViewingAngle) hard.push('tooClose');
  if (metrics.offAxis > thresholds.maxOffAxis) hard.push('side');
  const [first] = hard;
  if (first) return { band: 'avoid', reasons: hard, verdict: REASON_VERDICTS[first] };

  const band = bandForViewingAngle(metrics.viewingAngle, thresholds);
  if (band !== 'avoid' && metrics.offAxis > thresholds.sideDowngradeAbove) {
    // One band down for a noticeable side angle, but "avoid" stays reserved for hard limits.
    const lowered = BANDS[Math.min(BANDS.indexOf(band) + 1, BANDS.indexOf('meh'))] ?? band;
    return { band: lowered, reasons: ['sideMild'], verdict: REASON_VERDICTS.sideMild };
  }
  return {
    band,
    reasons: [],
    verdict: band === 'avoid' ? 'verdict.tooClose' : BAND_VERDICTS[band],
  };
}
