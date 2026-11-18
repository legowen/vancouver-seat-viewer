/**
 * Where every seat is, in metres.
 *
 * One function feeds the metrics, the 2D seat map and the procedural 3D room, so they can never
 * disagree. Coordinates:
 *   x  across the room; 0 is the screen's centre line, negative is audience-left
 *   y  up; 0 is the floor at the screen wall
 *   z  horizontal distance from the screen plane (the screen is at z = 0)
 */
import { ROOM } from '../config/defaults';
import type { Auditorium } from '../data/resolve';

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface SeatPosition {
  /** `<row label>-<seat number>`, unique within an auditorium. */
  id: string;
  rowIndex: number;
  rowLabel: string;
  number: number;
  /** Index of the cell inside the row's `seats` array. */
  cell: number;
  /** Horizontal position in seat widths from the centre line (may end in .5). */
  gridX: number;
  /** Centre of the seat. */
  x: number;
  z: number;
  /** Height of this row's floor. */
  floorY: number;
  /** Seated eye position. */
  eye: Point3;
}

export interface RowLayout {
  index: number;
  label: string;
  z: number;
  floorY: number;
  /** Number of cells (seats and gaps) in this row. */
  cells: number;
  seats: SeatPosition[];
}

export interface ScreenLayout {
  width: number;
  height: number;
  bottom: number;
  top: number;
  centre: Point3;
}

export interface RoomLayout {
  /** Half of the inner width, wall to wall. */
  halfWidth: number;
  /** Width of the walkway between the seat block and each side wall. */
  sideAisle: number;
  /** z of the back wall. */
  backZ: number;
  ceilingY: number;
  /** z where each row's floor step begins (front edge), index-aligned with `rows`. */
  stepFrontZ: number[];
}

export interface AuditoriumLayout {
  rows: RowLayout[];
  seats: SeatPosition[];
  seatById: Map<string, SeatPosition>;
  /** Cells in the widest row. */
  maxCells: number;
  seatWidth: number;
  rowSpacing: number;
  /** Half the width of the widest row. */
  blockHalfWidth: number;
  screen: ScreenLayout;
  room: RoomLayout;
}

export function seatId(rowLabel: string, seatNumber: number): string {
  return `${rowLabel}-${seatNumber}`;
}

export function computeLayout(auditorium: Auditorium): AuditoriumLayout {
  const { seatWidth_m, rowSpacing_m, rowRise_m, firstRowDistance_m, eyeHeight_m } = auditorium;

  const rows: RowLayout[] = [];
  const seats: SeatPosition[] = [];
  const seatById = new Map<string, SeatPosition>();
  let maxCells = 0;

  auditorium.rows.forEach((row, rowIndex) => {
    const cells = row.seats.length;
    maxCells = Math.max(maxCells, cells);
    const z = firstRowDistance_m + rowIndex * rowSpacing_m;
    const floorY = rowIndex * rowRise_m;
    const rowSeats: SeatPosition[] = [];

    row.seats.forEach((cellValue, cell) => {
      if (cellValue === null) return;
      // Every row is centred on the screen's centre line.
      const gridX = cell - (cells - 1) / 2;
      const x = gridX * seatWidth_m;
      const seat: SeatPosition = {
        id: seatId(row.label, cellValue),
        rowIndex,
        rowLabel: row.label,
        number: cellValue,
        cell,
        gridX,
        x,
        z,
        floorY,
        eye: { x, y: floorY + eyeHeight_m, z },
      };
      rowSeats.push(seat);
      seats.push(seat);
      seatById.set(seat.id, seat);
    });

    rows.push({ index: rowIndex, label: row.label, z, floorY, cells, seats: rowSeats });
  });

  const blockHalfWidth = (maxCells * seatWidth_m) / 2;
  const screen: ScreenLayout = {
    width: auditorium.screen.width_m,
    height: auditorium.screen.height_m,
    bottom: auditorium.screen.bottomHeight_m,
    top: auditorium.screen.bottomHeight_m + auditorium.screen.height_m,
    centre: { x: 0, y: auditorium.screen.bottomHeight_m + auditorium.screen.height_m / 2, z: 0 },
  };

  const sideAisle = ROOM.sideAisle_m[auditorium.type];
  const lastRow = rows[rows.length - 1];
  const lastRowZ = lastRow?.z ?? firstRowDistance_m;
  const lastRowFloor = lastRow?.floorY ?? 0;
  const room: RoomLayout = {
    halfWidth: Math.max(blockHalfWidth + sideAisle, screen.width / 2 + ROOM.besideScreen_m),
    sideAisle,
    backZ: lastRowZ + (1 - ROOM.rowFrontShare) * rowSpacing_m + ROOM.backWalkway_m,
    ceilingY: Math.max(screen.top + ROOM.aboveScreen_m, lastRowFloor + ROOM.headroom_m),
    stepFrontZ: rows.map((row) => row.z - ROOM.rowFrontShare * rowSpacing_m),
  };

  return {
    rows,
    seats,
    seatById,
    maxCells,
    seatWidth: seatWidth_m,
    rowSpacing: rowSpacing_m,
    blockHalfWidth,
    screen,
    room,
  };
}

/**
 * Floor height at depth `z`: flat in front of the first row, then one step per row.
 * With `blend` > 0 each step becomes a short ramp of that length, which is what the walking
 * avatar and the follow camera use so they do not pop from step to step.
 */
export function floorHeightAt(layout: AuditoriumLayout, z: number, blend = 0): number {
  const { rows, room } = layout;
  let height = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const edge = room.stepFrontZ[i];
    const rise = rows[i].floorY - rows[i - 1].floorY;
    if (blend <= 0) {
      if (z >= edge) height += rise;
    } else {
      const t = Math.min(1, Math.max(0, (z - (edge - blend)) / blend));
      height += rise * t * t * (3 - 2 * t);
    }
  }
  return height;
}
