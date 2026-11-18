/**
 * Compact seat-map text → auditorium JSON. Shared by `npm run import:auditorium` and the
 * `#/editor` page, so both produce exactly the same file.
 */
import type { AuditoriumType } from '../config/defaults';
import { parseCompactSeatMap, type CompactError } from './compact';
import {
  auditoriumSchema,
  formatIssues,
  type AuditoriumInput,
  type Entrance,
} from './schema';

/** Measured dimensions to write into the file. Anything left out falls back to the defaults. */
export interface DimensionOverrides {
  screenWidth_m?: number;
  screenAspect?: number;
  screenBottomHeight_m?: number;
  firstRowDistance_m?: number;
  rowSpacing_m?: number;
  rowRise_m?: number;
  seatWidth_m?: number;
  eyeHeight_m?: number;
}

export interface CompactImportOptions {
  id: string;
  theatreId: string;
  name: string;
  type?: AuditoriumType;
  entrance?: Entrance;
  /** Line up the aisles (default true). */
  align?: boolean;
  /** Seat widths per aisle (default 2). */
  aisleCells?: number;
  dimensions?: DimensionOverrides;
  verified?: boolean;
  source?: string;
  notes?: string;
}

export interface CompactImportResult {
  /** The file content, or null when the seat map has errors or no rows. */
  auditorium: AuditoriumInput | null;
  /** Problems in the typed seat map, by line. */
  errors: CompactError[];
  /** Schema problems with the rest of the file (id, name, …), as readable lines. */
  issues: string[];
}

function round(value: number | undefined, digits = 3): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function auditoriumFromCompact(
  text: string,
  options: CompactImportOptions,
): CompactImportResult {
  const parsed = parseCompactSeatMap(text, {
    align: options.align ?? true,
    aisleCells: options.aisleCells ?? 2,
  });
  if (parsed.errors.length > 0 || parsed.rows.length === 0) {
    return { auditorium: null, errors: parsed.errors, issues: [] };
  }

  const d = options.dimensions ?? {};
  const screen = {
    width_m: round(d.screenWidth_m, 2),
    aspect: round(d.screenAspect, 2),
    bottomHeight_m: round(d.screenBottomHeight_m, 2),
  };
  const hasScreen = Object.values(screen).some((value) => value !== undefined);

  const auditorium: AuditoriumInput = {
    id: options.id,
    theatreId: options.theatreId,
    name: options.name,
    type: options.type ?? 'standard',
    screen: hasScreen ? screen : undefined,
    firstRowDistance_m: round(d.firstRowDistance_m, 2),
    rowSpacing_m: round(d.rowSpacing_m, 2),
    rowRise_m: round(d.rowRise_m, 2),
    seatWidth_m: round(d.seatWidth_m, 2),
    eyeHeight_m: round(d.eyeHeight_m, 2),
    rows: parsed.rows,
    entrance: options.entrance ?? 'front-left',
    verified: options.verified ?? false,
    source: options.source?.trim() || undefined,
    notes: options.notes?.trim() || undefined,
  };

  const check = auditoriumSchema.safeParse(auditorium);
  return {
    auditorium,
    errors: [],
    issues: check.success ? [] : formatIssues(check.error),
  };
}
