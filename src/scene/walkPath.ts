import { SEAT_REACH_M } from '../config/defaults';
import { WALK } from '../config/walk';
import type { AuditoriumLayout, SeatPosition } from '../metrics/layout';
import { entranceDoor, floorAt, roomShape, rowFrontZ } from './room';

export interface FloorPoint {
  x: number;
  z: number;
}

/** The route from the entrance door to the seat, and how long each part takes. */
export interface WalkPlan {
  /** Door → side aisle → up or down the aisle → along the row to the seat. */
  waypoints: FloorPoint[];
  /** Total path length in metres. */
  length: number;
  /** x of the side aisle the route uses. */
  aisleX: number;
  walkDuration: number;
  sitDuration: number;
  totalDuration: number;
}

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/**
 * Floor height at depth z with each step turned into a short ramp, so the avatar climbs
 * the stairs instead of teleporting up them.
 */
export function smoothFloorAt(layout: AuditoriumLayout, z: number): number {
  const { rows } = layout;
  for (let index = 1; index < rows.length; index++) {
    const riser = rowFrontZ(layout, index);
    if (Math.abs(z - riser) < WALK.stepRamp) {
      const below = rows[index - 1]?.floorY ?? 0;
      const above = rows[index]?.floorY ?? below;
      const t = (z - (riser - WALK.stepRamp)) / (2 * WALK.stepRamp);
      return below + (above - below) * smoothstep(t);
    }
  }
  return floorAt(layout, z);
}

export function planWalk(layout: AuditoriumLayout, seat: SeatPosition): WalkPlan {
  const room = roomShape(layout);
  const door = entranceDoor(layout, room);

  // Use whichever side aisle is closer to the seat, walking across the front or the back
  // of the room first when that aisle is on the far side from the door.
  const aisleOffset = room.halfWidth - room.sideAisle / 2;
  const aisleX = seat.x <= 0 ? -aisleOffset : aisleOffset;

  // Stand in the middle of the legroom: between the step's riser and the seat cushions.
  const reach = SEAT_REACH_M[layout.auditorium.type];
  const rowZ = (rowFrontZ(layout, seat.rowIndex) + seat.z - reach) / 2;

  const waypoints: FloorPoint[] = [
    { x: door.side * (room.halfWidth - WALK.doorInset), z: door.z },
    { x: aisleX, z: door.z },
    { x: aisleX, z: rowZ },
    { x: seat.x, z: rowZ },
  ];

  let length = 0;
  for (let index = 1; index < waypoints.length; index++) {
    const a = waypoints[index - 1]!;
    const b = waypoints[index]!;
    length += Math.hypot(b.x - a.x, b.z - a.z);
  }

  const walkDuration = Math.min(
    WALK.maxWalkSeconds,
    Math.max(WALK.minWalkSeconds, length / WALK.pace),
  );
  return {
    waypoints,
    length,
    aisleX,
    walkDuration,
    sitDuration: WALK.sitSeconds,
    totalDuration: walkDuration + WALK.sitSeconds,
  };
}

/** Position and direction of travel after walking `distance` metres along the plan. */
export function pointAlong(
  plan: WalkPlan,
  distance: number,
): FloorPoint & { heading: number; leg: number } {
  const { waypoints } = plan;
  let remaining = Math.max(0, distance);
  for (let index = 1; index < waypoints.length; index++) {
    const a = waypoints[index - 1]!;
    const b = waypoints[index]!;
    const legLength = Math.hypot(b.x - a.x, b.z - a.z);
    if (legLength === 0) continue;
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    if (remaining <= legLength && remaining < plan.length) {
      const t = remaining / legLength;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading, leg: index - 1 };
    }
    remaining -= legLength;
  }
  const last = waypoints[waypoints.length - 1]!;
  const before = waypoints[waypoints.length - 2] ?? last;
  return {
    x: last.x,
    z: last.z,
    heading: Math.atan2(last.x - before.x, last.z - before.z),
    leg: waypoints.length - 2,
  };
}
