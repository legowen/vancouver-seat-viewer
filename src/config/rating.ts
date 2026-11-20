/** Rating bands from best to worst. The 2D map, legend and cards all use this order. */
export const BANDS = ['prime', 'recommended', 'ok', 'meh', 'avoid'] as const;
export type Band = (typeof BANDS)[number];

/**
 * Thresholds behind the seat ratings, in degrees. Tune them here; the rating code,
 * seat maps and tests all read from this object.
 */
export interface RatingThresholds {
  /** A wider horizontal viewing angle means turning your head to take in the screen. */
  maxViewingAngle: number;
  /** Looking up more than this to see the top of the screen strains the neck. */
  maxVerticalToTop: number;
  /** Sitting further off the centre line than this skews the picture. */
  maxOffAxis: number;
  /** A side angle above this moves a seat one band down (never into "avoid"). */
  sideDowngradeAbove: number;
  /** Lowest viewing angle of each band. Below `okFrom` is "meh". */
  primeFrom: number;
  recommendedFrom: number;
  okFrom: number;
  /** Viewing angle of the seat suggested before the user picks one. */
  idealViewingAngle: number;
}

export const RATING: RatingThresholds = {
  maxViewingAngle: 60,
  maxVerticalToTop: 35,
  maxOffAxis: 35,
  sideDowngradeAbove: 25,
  primeFrom: 45,
  recommendedFrom: 36,
  okFrom: 30,
  idealViewingAngle: 50,
};
