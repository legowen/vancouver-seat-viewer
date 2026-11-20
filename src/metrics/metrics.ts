const RAD_TO_DEG = 180 / Math.PI;

/** What a seat sees of the screen. Angles are in degrees, distances in metres. */
export interface SeatMetrics {
  /** Straight-line distance from the eyes to the centre of the screen. */
  distance: number;
  /** How much of your horizontal field of view the screen fills. */
  viewingAngle: number;
  /** How far to the side you sit, seen from above: 0° on the centre line. */
  offAxis: number;
  /** How far you tilt your head back to see the top edge. Negative when it is below your eyes. */
  verticalToTop: number;
}

export interface EyePosition {
  x: number;
  y: number;
  z: number;
}

export interface ScreenForMetrics {
  width: number;
  centerY: number;
  top: number;
}

/** 2 · atan((screenWidth / 2) / distance to the screen plane). */
export function viewingAngleDeg(screenWidth: number, distanceToPlane: number): number {
  return 2 * Math.atan(screenWidth / 2 / distanceToPlane) * RAD_TO_DEG;
}

/**
 * Angle between the line to the screen centre and the screen's normal, measured in the
 * horizontal plane. Height is left out on purpose: looking up or down is covered by the
 * vertical angle, and this one is about sitting off to the side.
 */
export function offAxisDeg(x: number, distanceToPlane: number): number {
  return Math.atan2(Math.abs(x), distanceToPlane) * RAD_TO_DEG;
}

/** Elevation of the screen's top edge as seen from the eyes, straight ahead. */
export function verticalAngleToTopDeg(eyeY: number, top: number, distanceToPlane: number): number {
  return Math.atan2(top - eyeY, distanceToPlane) * RAD_TO_DEG;
}

export function computeSeatMetrics(eye: EyePosition, screen: ScreenForMetrics): SeatMetrics {
  return {
    distance: Math.hypot(eye.x, eye.y - screen.centerY, eye.z),
    viewingAngle: viewingAngleDeg(screen.width, eye.z),
    offAxis: offAxisDeg(eye.x, eye.z),
    verticalToTop: verticalAngleToTopDeg(eye.y, screen.top, eye.z),
  };
}
