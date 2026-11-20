import { ROOM } from '../config/defaults';
import { WALK } from '../config/walk';
import type { AuditoriumLayout } from '../metrics/layout';

/** The box the auditorium is built in, in the world coordinates of `metrics/layout.ts`. */
export interface RoomShape {
  /** Side walls stand at x = ±halfWidth. */
  halfWidth: number;
  /** Back wall stands at z = back. The screen wall is at z = 0. */
  back: number;
  ceiling: number;
  /** Floor height of the last row and the back aisle behind it. */
  lastFloor: number;
  /** Width of the walkway between the outermost seats and each side wall. */
  sideAisle: number;
}

export function roomShape(layout: AuditoriumLayout): RoomShape {
  const lastRow = layout.rows[layout.rows.length - 1];
  const lastZ = lastRow?.z ?? layout.dims.firstRowDistance;
  const lastFloor = lastRow?.floorY ?? 0;
  const halfWidth = Math.max(
    layout.screen.width / 2 + ROOM.screenMargin_m,
    layout.seatingHalfWidth + ROOM.sideAisle_m,
  );
  return {
    halfWidth,
    back: lastZ + (1 - ROOM.stepAhead) * layout.dims.rowSpacing + ROOM.backAisle_m,
    ceiling: Math.max(
      layout.screen.top + ROOM.ceilingAboveScreen_m,
      lastFloor + ROOM.ceilingAboveLastRow_m,
    ),
    lastFloor,
    sideAisle: halfWidth - layout.seatingHalfWidth,
  };
}

/** z where the step of row `index` begins (its riser, nearest the screen). */
export function rowFrontZ(layout: AuditoriumLayout, index: number): number {
  return layout.dims.firstRowDistance + (index - ROOM.stepAhead) * layout.dims.rowSpacing;
}

/** Floor height at depth z: flat in front of the first row, then one step up per row. */
export function floorAt(layout: AuditoriumLayout, z: number): number {
  const { rows, dims } = layout;
  const start = rowFrontZ(layout, 0);
  if (z < start || rows.length === 0) return 0;
  const index = Math.min(rows.length - 1, Math.floor((z - start) / dims.rowSpacing));
  return rows[index]?.floorY ?? 0;
}

/** Where the entrance door is: on which wall, at what depth and floor height. */
export function entranceDoor(layout: AuditoriumLayout, room: RoomShape = roomShape(layout)) {
  const atBack = layout.entrance.startsWith('back');
  return {
    /** -1 for the left wall, 1 for the right wall. */
    side: layout.entrance.endsWith('left') ? -1 : 1,
    z: atBack ? room.back - WALK.backDoorInset : WALK.frontDoorZ,
    floorY: atBack ? room.lastFloor : 0,
  } as const;
}
