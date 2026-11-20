/** How the seated first-person view behaves. Angles are in degrees. */
export const VIEW = {
  /**
   * Horizontal field of view the camera tries to show. It stays the same for every seat,
   * so a screen that looks bigger here really is bigger from that seat.
   */
  horizontalFov: 75,
  /** On tall portrait screens the horizontal field narrows rather than exceed this. */
  maxVerticalFov: 90,
  /** Drag-to-look limits, measured from looking straight at the screen centre. */
  maxYaw: 40,
  maxPitch: 20,
  /** Arrow-key step. */
  keyStep: 5,
  /** Duration of the recentre animation, in milliseconds. */
  recentreMs: 450,
};
