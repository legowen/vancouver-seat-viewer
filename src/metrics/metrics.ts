/**
 * Seat metrics: pure functions of the eye position and the screen.
 * Coordinates are the ones of `src/geometry/layout.ts`: the screen is the plane z = 0,
 * x = 0 is its centre line and y is height above the floor at the screen wall.
 */
import type { Point3 } from '../geometry/layout';

export interface ScreenGeometry {
  /** Width of the picture (m). */
  width: number;
  /** Height of the top edge above the floor at the screen wall (m). */
  top: number;
  /** Centre of the picture. */
  centre: Point3;
}

export interface SeatMetrics {
  /** Straight-line distance from the eye to the centre of the screen (m). */
  distance_m: number;
  /** Horizontal angle the screen width spans: 2·atan((W/2) / z), using the distance to the screen plane (°). */
  viewingAngle_deg: number;
  /** How far the screen centre is to the side of straight ahead, in the horizontal plane: atan(|x| / z) (°). */
  offAxis_deg: number;
  /** Angle from eye level up to the top edge of the screen: atan((top − eye.y) / z) (°). Negative when the eye is higher. */
  verticalAngle_deg: number;
}

const DEGREES = 180 / Math.PI;
/** The schema keeps every seat at least 2 m from the screen; this only guards against division by zero. */
const MIN_Z = 1e-6;

export function computeMetrics(eye: Point3, screen: ScreenGeometry): SeatMetrics {
  const z = Math.max(eye.z - screen.centre.z, MIN_Z);
  const dx = eye.x - screen.centre.x;
  const dy = eye.y - screen.centre.y;

  return {
    distance_m: Math.hypot(dx, dy, z),
    viewingAngle_deg: 2 * Math.atan(screen.width / 2 / z) * DEGREES,
    offAxis_deg: Math.atan(Math.abs(dx) / z) * DEGREES,
    verticalAngle_deg: Math.atan((screen.top - eye.y) / z) * DEGREES,
  };
}
