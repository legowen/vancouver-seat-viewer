/**
 * Tunable numbers for the seat rating. The formulas that use them live in `src/metrics/`;
 * `.claude/skills/seat-metrics/SKILL.md` documents both, and the tests pin every boundary.
 */

/** Rating bands, best first. */
export const BANDS = ['prime', 'recommended', 'ok', 'meh', 'avoid'] as const;
export type Band = (typeof BANDS)[number];

export interface RatingThresholds {
  /** Avoid when the screen spans more than this horizontal angle (°): you turn your head. */
  avoidViewingAngle: number;
  /** Avoid when the top of the screen is more than this far above eye level (°): neck strain. */
  avoidVerticalAngle: number;
  /** Avoid when the screen centre is more than this far to the side (°). */
  avoidOffAxis: number;
  /** Lowest viewing angle (°) of each band. Below `okMin` is "meh". */
  primeMin: number;
  recommendedMin: number;
  okMin: number;
  /** Move one band down when the screen centre is more than this far to the side (°). */
  demoteOffAxis: number;
}

export const RATING: RatingThresholds = {
  avoidViewingAngle: 60,
  avoidVerticalAngle: 35,
  avoidOffAxis: 35,
  primeMin: 45,
  recommendedMin: 36,
  okMin: 30,
  demoteOffAxis: 25,
};

/**
 * Band colours. They must match the `--band-*` variables in `src/styles/tokens.css`
 * (a test checks this): the 2D map uses the CSS, the 3D scene uses these.
 */
export const BAND_COLORS: Record<Band, string> = {
  prime: '#ffd166',
  recommended: '#5cd8a6',
  ok: '#72b7ff',
  meh: '#9a96c4',
  avoid: '#ff7385',
};
