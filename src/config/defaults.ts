/**
 * Default dimensions for auditoriums whose JSON leaves a value out.
 *
 * Every number here is an estimate for a typical Cineplex multiplex room, not a measurement.
 * An auditorium that relies on any of them should keep `"verified": false`, which makes the UI
 * show the "Estimated dimensions" badge. To calibrate a real room, put the measured value in
 * that auditorium's JSON (see docs/add-auditorium.md) instead of changing a default here.
 */

export type AuditoriumType = 'standard' | 'vip';
export type SizeClass = 'small' | 'medium' | 'large';

export interface DimensionDefaults {
  /** Width of the visible picture area (m). */
  screenWidth_m: number;
  /** Width ÷ height of the screen surface. 2.39 = "scope", 1.85 = "flat". */
  screenAspect: number;
  /** Height of the screen's bottom edge above the floor at the front of the room (m). */
  screenBottomHeight_m: number;
  /** Horizontal distance from the screen to the eyes of the first row (m). */
  firstRowDistance_m: number;
  /** Distance from one row to the next, front to back (m). */
  rowSpacing_m: number;
  /** How much higher each row's floor is than the row in front (m). Stadium seating. */
  rowRise_m: number;
  /** Centre-to-centre width of one seat, armrest included (m). */
  seatWidth_m: number;
  /** Seated eye height above that row's floor (m). */
  eyeHeight_m: number;
}

/**
 * Seat-count limits of the size classes. Fewer seats than `medium` is "small";
 * `large` seats or more is "large". VIP rooms hold far fewer (wider) seats, so they get their own scale.
 */
export const SIZE_THRESHOLDS: Record<AuditoriumType, { medium: number; large: number }> = {
  standard: { medium: 120, large: 250 },
  vip: { medium: 50, large: 90 },
};

/** Values that depend only on the seat type. */
const BY_TYPE: Record<
  AuditoriumType,
  Pick<
    DimensionDefaults,
    'rowSpacing_m' | 'rowRise_m' | 'seatWidth_m' | 'eyeHeight_m' | 'screenAspect'
  >
> = {
  standard: {
    rowSpacing_m: 1.0, // regular stadium seating
    rowRise_m: 0.35, // roughly two steps per row
    seatWidth_m: 0.55,
    eyeHeight_m: 1.15,
    screenAspect: 2.39,
  },
  vip: {
    rowSpacing_m: 1.5, // recliners need the leg room
    rowRise_m: 0.45, // deeper rows need a taller step to keep sightlines
    seatWidth_m: 0.75,
    eyeHeight_m: 1.15,
    screenAspect: 2.39,
  },
};

/** Values that grow with the room: bigger rooms have a wider screen that sits further away and higher. */
const BY_SIZE: Record<
  AuditoriumType,
  Record<
    SizeClass,
    Pick<DimensionDefaults, 'screenWidth_m' | 'firstRowDistance_m' | 'screenBottomHeight_m'>
  >
> = {
  standard: {
    small: { screenWidth_m: 9.0, firstRowDistance_m: 4.0, screenBottomHeight_m: 1.0 },
    medium: { screenWidth_m: 12.0, firstRowDistance_m: 5.0, screenBottomHeight_m: 1.2 },
    large: { screenWidth_m: 15.0, firstRowDistance_m: 6.0, screenBottomHeight_m: 1.4 },
  },
  vip: {
    small: { screenWidth_m: 8.0, firstRowDistance_m: 4.5, screenBottomHeight_m: 1.0 },
    medium: { screenWidth_m: 10.0, firstRowDistance_m: 5.0, screenBottomHeight_m: 1.1 },
    large: { screenWidth_m: 12.0, firstRowDistance_m: 5.5, screenBottomHeight_m: 1.2 },
  },
};

export function sizeClassFor(type: AuditoriumType, seatCount: number): SizeClass {
  const limits = SIZE_THRESHOLDS[type];
  if (seatCount >= limits.large) return 'large';
  if (seatCount >= limits.medium) return 'medium';
  return 'small';
}

export function defaultsFor(type: AuditoriumType, seatCount: number): DimensionDefaults {
  return { ...BY_TYPE[type], ...BY_SIZE[type][sizeClassFor(type, seatCount)] };
}

/**
 * The shell around the seats. These are not part of the auditorium JSON: they only shape the
 * procedural 3D room and the walk-in path, and do not affect any seat metric.
 */
export const ROOM = {
  /** Width of the walkway between the outermost seat and the side wall (m). */
  sideAisle_m: { standard: 1.3, vip: 1.5 } satisfies Record<AuditoriumType, number>,
  /** Walkway behind the last row (m). */
  backWalkway_m: 1.8,
  /** Minimum clear height above the last row's floor (m). */
  headroom_m: 3.0,
  /** Wall above the top edge of the screen (m). */
  aboveScreen_m: 1.2,
  /** How far the walls extend past the edge of the screen on each side, at least (m). */
  besideScreen_m: 0.9,
  /** Share of a row's depth that lies in front of the seat's eye point (leg room + cushion). */
  rowFrontShare: 0.72,
} as const;

/** Slider ranges for the editor and sanity limits for the schema, per dimension. */
export const DIMENSION_LIMITS = {
  screenWidth_m: { min: 3, max: 30, step: 0.1 },
  screenAspect: { min: 1.3, max: 2.8, step: 0.01 },
  screenBottomHeight_m: { min: 0, max: 5, step: 0.05 },
  firstRowDistance_m: { min: 2, max: 20, step: 0.1 },
  rowSpacing_m: { min: 0.8, max: 2.5, step: 0.05 },
  rowRise_m: { min: 0, max: 0.9, step: 0.01 },
  seatWidth_m: { min: 0.45, max: 1.2, step: 0.01 },
  eyeHeight_m: { min: 0.9, max: 1.5, step: 0.01 },
} as const satisfies Record<keyof DimensionDefaults, { min: number; max: number; step: number }>;
