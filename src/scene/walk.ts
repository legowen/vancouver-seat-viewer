/**
 * The walk to the seat, as pure maths: a path on the floor plan and a timeline. The avatar comes
 * in through the entrance, walks along the front (past the screen) or the back of the room to
 * the side aisle nearest the seat, climbs or descends that aisle to the row, side-steps along the
 * row to the seat and sits down. Heights come from `floorHeightAt` in the scene.
 */
import type { Entrance } from '../data/schema';
import type { AuditoriumLayout, SeatPosition } from '../geometry/layout';

export interface FloorPoint {
  x: number;
  z: number;
}

export type SegmentKind = 'walk' | 'side';

export interface WalkSegment {
  from: FloorPoint;
  to: FloorPoint;
  kind: SegmentKind;
  length: number;
  /** Start and end time of this segment (s). */
  start: number;
  end: number;
}

export interface WalkPlan {
  seat: SeatPosition;
  /** −1: the aisle on the audience-left, 1: on the right. */
  aisleSide: -1 | 1;
  aisleX: number;
  /** Where people walk along the row: between the seats and the row in front. */
  rowLineZ: number;
  segments: WalkSegment[];
  /** End of the walking part (s). */
  walkEnd: number;
  /** End of sitting down (s). */
  sitEnd: number;
  /** End of the camera moving into the seat's eye position: the whole walk-in (s). */
  total: number;
}

export interface WalkTiming {
  /** Walking speed before stretching to fit the time limits (m/s). */
  speed: number;
  /** Side-stepping is this much slower than walking. */
  sideSlowdown: number;
  minWalk: number;
  maxWalk: number;
  sit: number;
  /** Time for the camera to settle at eye level; starts while the avatar is sitting. */
  camera: number;
  cameraOverlap: number;
}

/** About 4–6 s in total, as the spec asks. */
export const WALK_TIMING: WalkTiming = {
  speed: 1.4,
  sideSlowdown: 1.6,
  minWalk: 2.6,
  maxWalk: 4.1,
  sit: 0.6,
  camera: 1.1,
  cameraOverlap: 0.3,
};

function distance(a: FloorPoint, b: FloorPoint): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

export interface DoorPosition {
  /** z of the doorway along the side wall. */
  z: number;
  /** −1 for the left wall, 1 for the right wall. */
  side: -1 | 1;
}

export function planWalk(
  layout: AuditoriumLayout,
  entrance: Entrance,
  door: DoorPosition,
  seat: SeatPosition,
  timing: WalkTiming = WALK_TIMING,
): WalkPlan {
  const { room } = layout;
  const aisleSide: -1 | 1 = seat.x < 0 ? -1 : 1;
  const aisleX = aisleSide * (layout.blockHalfWidth + room.sideAisle / 2);
  const rowLineZ = seat.z - layout.rowSpacing * 0.46;

  // In through the door, a step into the room.
  const start: FloorPoint = { x: door.side * (room.halfWidth - 0.15), z: door.z };
  const inside: FloorPoint = { x: door.side * (room.halfWidth - 0.9), z: door.z };
  // Along the front walkway or the back cross-aisle to the foot (or head) of the side aisle.
  const crossZ = entrance.startsWith('front')
    ? Math.min(door.z, (room.stepFrontZ[0] ?? seat.z) - 0.35)
    : door.z;
  const corner: FloorPoint = { x: aisleX, z: crossZ };
  const rowEntry: FloorPoint = { x: aisleX, z: rowLineZ };
  const atSeat: FloorPoint = { x: seat.x, z: rowLineZ };

  const legs: { from: FloorPoint; to: FloorPoint; kind: SegmentKind }[] = [
    { from: start, to: inside, kind: 'walk' },
    { from: inside, to: { x: inside.x, z: crossZ }, kind: 'walk' },
    { from: { x: inside.x, z: crossZ }, to: corner, kind: 'walk' },
    { from: corner, to: rowEntry, kind: 'walk' },
    { from: rowEntry, to: atSeat, kind: 'side' },
  ];

  const measured = legs
    .map((leg) => ({ ...leg, length: distance(leg.from, leg.to) }))
    .filter((leg) => leg.length > 1e-3);
  const effort = measured.reduce(
    (sum, leg) => sum + leg.length * (leg.kind === 'side' ? timing.sideSlowdown : 1),
    0,
  );
  const walkEnd = Math.min(timing.maxWalk, Math.max(timing.minWalk, effort / timing.speed));
  const secondsPerMetre = effort > 0 ? walkEnd / effort : 0;

  let clock = 0;
  const segments: WalkSegment[] = measured.map((leg) => {
    const duration = leg.length * (leg.kind === 'side' ? timing.sideSlowdown : 1) * secondsPerMetre;
    const segment = { ...leg, start: clock, end: clock + duration };
    clock += duration;
    return segment;
  });

  const sitEnd = walkEnd + timing.sit;
  const total = sitEnd - timing.cameraOverlap + timing.camera;
  return { seat, aisleSide, aisleX, rowLineZ, segments, walkEnd, sitEnd, total };
}

export interface WalkSample {
  x: number;
  z: number;
  /** Direction the avatar faces, as a yaw for a model that faces −z at zero (radians). */
  heading: number;
  phase: 'walk' | 'side' | 'sit' | 'seated';
  /** 0 → 1 while sitting down. */
  sit: number;
  /** Metres walked so far. */
  travelled: number;
  /** Speed along the path right now (m/s); 0 once walking is over. */
  speed: number;
}

/** Facing the direction of travel; side-stepping and sitting face the screen. */
function headingOf(segment: WalkSegment): number {
  if (segment.kind === 'side') return 0;
  return Math.atan2(-(segment.to.x - segment.from.x), -(segment.to.z - segment.from.z));
}

export function sampleWalk(plan: WalkPlan, time: number): WalkSample {
  const { segments } = plan;
  let travelled = 0;
  for (const segment of segments) {
    if (time < segment.end) {
      const span = segment.end - segment.start;
      const t = span > 0 ? Math.max(0, (time - segment.start) / span) : 1;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * t,
        z: segment.from.z + (segment.to.z - segment.from.z) * t,
        heading: headingOf(segment),
        phase: segment.kind,
        sit: 0,
        travelled: travelled + segment.length * t,
        speed: span > 0 ? segment.length / span : 0,
      };
    }
    travelled += segment.length;
  }
  const last = segments[segments.length - 1];
  const end = last ? last.to : { x: plan.seat.x, z: plan.rowLineZ };
  const sitting = Math.min(1, Math.max(0, (time - plan.walkEnd) / (plan.sitEnd - plan.walkEnd)));
  // Sitting down moves the avatar from the row line back onto the seat.
  return {
    x: end.x,
    z: end.z + (plan.seat.z - end.z) * sitting,
    heading: 0,
    phase: time >= plan.sitEnd ? 'seated' : 'sit',
    sit: sitting,
    travelled,
    speed: 0,
  };
}

/** Smoothstep easing for the camera and sitting. */
export function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
