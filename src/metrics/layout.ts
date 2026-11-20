import {
  SCREEN_DEFAULTS,
  SIZE_THRESHOLDS,
  TYPE_DEFAULTS,
  type AuditoriumSize,
} from '../config/defaults';
import { countSeats, type Auditorium, type AuditoriumType, type Entrance } from '../data/schema';

/**
 * World coordinates, in metres, used by the metrics and the 3D scene:
 *
 *   x  to the right of someone facing the screen (0 = the screen's centre line)
 *   y  up (0 = the floor in front of the first row)
 *   z  away from the screen (0 = the screen plane)
 */

export interface ResolvedDimensions {
  screenWidth: number;
  screenAspect: number;
  screenBottom: number;
  firstRowDistance: number;
  rowSpacing: number;
  rowRise: number;
  seatWidth: number;
  eyeHeight: number;
}

export interface ScreenGeometry {
  width: number;
  height: number;
  bottom: number;
  top: number;
  centerY: number;
}

export interface SeatPosition {
  /** "<row>-<number>", e.g. "K-23". */
  key: string;
  row: string;
  number: number;
  /** 0 for the row nearest the screen. */
  rowIndex: number;
  /** Position within the row's `seats` array, counting gaps. */
  slotIndex: number;
  /** Centre of the seat. */
  x: number;
  /** Distance from the screen plane to the seated viewer's eyes. */
  z: number;
  floorY: number;
  eyeY: number;
}

export interface RowLayout {
  label: string;
  index: number;
  z: number;
  floorY: number;
  /** One entry per slot: a seat, or null for a gap. */
  slots: (SeatPosition | null)[];
  /** x of every slot, gaps included. */
  slotX: number[];
}

export interface AuditoriumLayout {
  auditorium: Auditorium;
  size: AuditoriumSize;
  seatCount: number;
  dims: ResolvedDimensions;
  screen: ScreenGeometry;
  rows: RowLayout[];
  /** Front row first, left to right within a row. */
  seats: SeatPosition[];
  /** Slots in the longest row. */
  maxSlots: number;
  /** Distance from the centre line to the outer edge of the outermost seat. */
  seatingHalfWidth: number;
  /** True unless the file says its dimensions were measured. */
  estimated: boolean;
  entrance: Entrance;
  seatIndex: ReadonlyMap<string, SeatPosition>;
}

export function seatKey(row: string, number: number): string {
  return `${row}-${number}`;
}

export function inferSize(type: AuditoriumType, seatCount: number): AuditoriumSize {
  const thresholds = SIZE_THRESHOLDS[type];
  if (seatCount >= thresholds.large) return 'large';
  if (seatCount >= thresholds.medium) return 'medium';
  return 'small';
}

/** Fills in default dimensions and works out where every seat and the screen are. */
export function resolveAuditorium(auditorium: Auditorium): AuditoriumLayout {
  const seatCount = countSeats(auditorium.rows);
  const size = inferSize(auditorium.type, seatCount);
  const typeDefaults = TYPE_DEFAULTS[auditorium.type];
  const sizeDefaults = typeDefaults.bySize[size];

  const dims: ResolvedDimensions = {
    screenWidth: auditorium.screen?.width_m ?? sizeDefaults.screenWidth_m,
    screenAspect: auditorium.screen?.aspect ?? SCREEN_DEFAULTS.aspect,
    screenBottom: auditorium.screen?.bottomHeight_m ?? SCREEN_DEFAULTS.bottomHeight_m,
    firstRowDistance: auditorium.firstRowDistance_m ?? sizeDefaults.firstRowDistance_m,
    rowSpacing: auditorium.rowSpacing_m ?? typeDefaults.rowSpacing_m,
    rowRise: auditorium.rowRise_m ?? typeDefaults.rowRise_m,
    seatWidth: auditorium.seatWidth_m ?? typeDefaults.seatWidth_m,
    eyeHeight: auditorium.eyeHeight_m ?? typeDefaults.eyeHeight_m,
  };

  const height = dims.screenWidth / dims.screenAspect;
  const screen: ScreenGeometry = {
    width: dims.screenWidth,
    height,
    bottom: dims.screenBottom,
    top: dims.screenBottom + height,
    centerY: dims.screenBottom + height / 2,
  };

  const maxSlots = Math.max(...auditorium.rows.map((row) => row.seats.length));
  const align = auditorium.rowAlign ?? 'center';
  const seats: SeatPosition[] = [];
  const seatIndex = new Map<string, SeatPosition>();
  let seatingHalfWidth = 0;

  const rows = auditorium.rows.map((row, index): RowLayout => {
    const z = dims.firstRowDistance + index * dims.rowSpacing;
    const floorY = index * dims.rowRise;
    const spare = maxSlots - row.seats.length;
    const shift = align === 'center' ? spare / 2 : align === 'left' ? 0 : spare;
    const slotX = row.seats.map((_, slot) => (slot + shift - (maxSlots - 1) / 2) * dims.seatWidth);
    const slots = row.seats.map((number, slotIndex): SeatPosition | null => {
      if (number === null) return null;
      const x = slotX[slotIndex] ?? 0;
      const seat: SeatPosition = {
        key: seatKey(row.label, number),
        row: row.label,
        number,
        rowIndex: index,
        slotIndex,
        x,
        z,
        floorY,
        eyeY: floorY + dims.eyeHeight,
      };
      seats.push(seat);
      seatIndex.set(seat.key, seat);
      seatingHalfWidth = Math.max(seatingHalfWidth, Math.abs(x) + dims.seatWidth / 2);
      return seat;
    });
    return { label: row.label, index, z, floorY, slots, slotX };
  });

  return {
    auditorium,
    size,
    seatCount,
    dims,
    screen,
    rows,
    seats,
    maxSlots,
    seatingHalfWidth,
    estimated: auditorium.verified !== true,
    entrance: auditorium.entrance ?? 'front-left',
    seatIndex,
  };
}

export function findSeat(layout: AuditoriumLayout, key: string): SeatPosition | undefined {
  return layout.seatIndex.get(key);
}
