/**
 * Camera maths for the seated view, kept free of three.js so it can be unit-tested.
 * Angles in degrees unless the name says radians.
 */
import type { Point3 } from '../geometry/layout';

/** How far drag-to-look may turn away from the screen centre (°). */
export const LOOK_LIMITS = { yaw: 40, pitch: 20 } as const;

/**
 * Field of view of the seated camera. A fixed horizontal field makes the screen take up the
 * same share of the display for the same seat on any device, so seats can be compared. Tall
 * phone screens would need an extreme vertical field for that, so it is capped.
 */
export const VIEW_FOV = { horizontal: 80, minVertical: 40, maxVertical: 95 } as const;

const RAD = Math.PI / 180;

export function verticalFov(aspect: number, fov: typeof VIEW_FOV = VIEW_FOV): number {
  const safeAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const vertical = (2 * Math.atan(Math.tan((fov.horizontal * RAD) / 2) / safeAspect)) / RAD;
  return Math.min(fov.maxVertical, Math.max(fov.minVertical, vertical));
}

export function horizontalFov(verticalDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((verticalDeg * RAD) / 2) * aspect)) / RAD;
}

export interface LookAngles {
  yaw: number;
  pitch: number;
}

export function clampLook(look: LookAngles, limits = LOOK_LIMITS): LookAngles {
  return {
    yaw: Math.min(limits.yaw, Math.max(-limits.yaw, look.yaw)),
    pitch: Math.min(limits.pitch, Math.max(-limits.pitch, look.pitch)),
  };
}

/**
 * Yaw and pitch (radians) that point a camera at `to` from `from`, for Euler order 'YXZ'.
 * A camera with zero rotation looks down −z; positive yaw turns it towards −x.
 */
export function aimAngles(from: Point3, to: Point3): LookAngles {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horizontal = Math.hypot(dx, dz);
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, horizontal) };
}

/**
 * Converts a drag in CSS pixels into a change of look angle that keeps the scene under the
 * finger ("grab the world"): dragging right turns the view left, dragging down looks up.
 */
export function dragToLook(
  dx: number,
  dy: number,
  viewportWidth: number,
  horizontalFovDeg: number,
): LookAngles {
  const perPixel = horizontalFovDeg / Math.max(1, viewportWidth);
  return { yaw: dx * perPixel, pitch: dy * perPixel };
}

/**
 * Projection settings that keep the camera's aim point in the middle of the part of the canvas
 * that is not covered by a bottom card of `inset` pixels, without changing the visible field.
 */
export function insetProjection(
  width: number,
  height: number,
  inset: number,
  verticalFovDeg: number,
): { fov: number; aspect: number; fullHeight: number; offsetY: number } {
  const clamped = Math.max(0, Math.min(inset, height * 0.8));
  const fullHeight = height + clamped;
  const fov = (2 * Math.atan((Math.tan((verticalFovDeg * RAD) / 2) * fullHeight) / height)) / RAD;
  return { fov, aspect: width / fullHeight, fullHeight, offsetY: clamped };
}
