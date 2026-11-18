/**
 * Turns a validated auditorium JSON into an `Auditorium` in which every dimension has a value,
 * filling the gaps from `src/config/defaults.ts`.
 */
import {
  defaultsFor,
  sizeClassFor,
  type AuditoriumType,
  type DimensionDefaults,
  type SizeClass,
} from '../config/defaults';
import type { AuditoriumJson, Entrance, RowJson } from './schema';

export interface ScreenDimensions {
  width_m: number;
  aspect: number;
  bottomHeight_m: number;
  /** Derived: `width_m / aspect`. */
  height_m: number;
}

export interface Auditorium {
  id: string;
  theatreId: string;
  name: string;
  type: AuditoriumType;
  /** Front row first. */
  rows: RowJson[];
  entrance: Entrance;
  verified: boolean;
  placeholder: boolean;
  source?: string;
  notes?: string;

  seatCount: number;
  sizeClass: SizeClass;

  screen: ScreenDimensions;
  firstRowDistance_m: number;
  rowSpacing_m: number;
  rowRise_m: number;
  seatWidth_m: number;
  eyeHeight_m: number;

  /** Dimensions that were not in the JSON and came from the defaults. */
  defaulted: (keyof DimensionDefaults)[];
}

export function countSeats(rows: readonly { seats: readonly (number | null)[] }[]): number {
  let total = 0;
  for (const row of rows) {
    for (const cell of row.seats) if (cell !== null) total += 1;
  }
  return total;
}

export function resolveAuditorium(json: AuditoriumJson): Auditorium {
  const seatCount = countSeats(json.rows);
  const defaults = defaultsFor(json.type, seatCount);
  const defaulted: (keyof DimensionDefaults)[] = [];

  const pick = (key: keyof DimensionDefaults, value: number | undefined): number => {
    if (value === undefined) {
      defaulted.push(key);
      return defaults[key];
    }
    return value;
  };

  const width_m = pick('screenWidth_m', json.screen?.width_m);
  const aspect = pick('screenAspect', json.screen?.aspect);
  const bottomHeight_m = pick('screenBottomHeight_m', json.screen?.bottomHeight_m);

  return {
    id: json.id,
    theatreId: json.theatreId,
    name: json.name,
    type: json.type,
    rows: json.rows,
    entrance: json.entrance,
    verified: json.verified,
    placeholder: json.placeholder ?? false,
    source: json.source,
    notes: json.notes,
    seatCount,
    sizeClass: sizeClassFor(json.type, seatCount),
    screen: { width_m, aspect, bottomHeight_m, height_m: width_m / aspect },
    firstRowDistance_m: pick('firstRowDistance_m', json.firstRowDistance_m),
    rowSpacing_m: pick('rowSpacing_m', json.rowSpacing_m),
    rowRise_m: pick('rowRise_m', json.rowRise_m),
    seatWidth_m: pick('seatWidth_m', json.seatWidth_m),
    eyeHeight_m: pick('eyeHeight_m', json.eyeHeight_m),
    defaulted,
  };
}
