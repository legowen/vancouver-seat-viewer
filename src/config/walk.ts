/** Timing and camera framing of the walk-in animation. Times in seconds, lengths in metres. */
export const WALK = {
  /** Walking pace before the time limits below apply. */
  pace: 1.6,
  /**
   * The walk always takes between these two durations: a long walk in a big room simply
   * goes faster, so the whole sequence stays around 4–6 seconds.
   */
  minWalkSeconds: 2.8,
  maxWalkSeconds: 4.4,
  /** Turning to face the screen, sitting down and the camera moving into the seat. */
  sitSeconds: 1.4,
  /** Each step is climbed over this distance, centred on its riser. */
  stepRamp: 0.14,
  /** The avatar appears this far inside the doorway. */
  doorInset: 0.35,
  /** Front doors are this far from the screen wall; back doors this far from the back wall. */
  frontDoorZ: 1.6,
  backDoorInset: 0.8,
  /** Third-person camera: distance behind and above the avatar, and where it looks. */
  follow: { back: 2.6, up: 1.4, lookAhead: 0.8, lookUp: 0.85, damping: 5 },
};
