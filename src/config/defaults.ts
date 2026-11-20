import type { AuditoriumType } from '../data/schema';

/**
 * Default dimensions for auditoriums whose JSON file leaves a value out.
 *
 * Every dimension in an auditorium file is optional. Anything missing is taken from here,
 * chosen by the auditorium type (standard or VIP) and by its size, which is inferred from
 * the seat count. These are typical values for North American stadium-seating multiplexes,
 * not measurements of any particular Cineplex room: an auditorium keeps its
 * "Estimated dimensions" badge until someone measures it and sets `"verified": true`.
 *
 * All lengths are in metres.
 */

export type AuditoriumSize = 'small' | 'medium' | 'large';

/** Seat counts from which an auditorium counts as medium or large. */
export const SIZE_THRESHOLDS: Record<AuditoriumType, { medium: number; large: number }> = {
  // Standard rooms: about 100–150 seats is a small house, 300–450 a big one.
  standard: { medium: 150, large: 280 },
  // VIP rooms use wide recliners, so a room of the same size holds far fewer seats.
  vip: { medium: 50, large: 90 },
};

export interface SizeDefaults {
  /** Screen width. Bigger rooms get bigger screens. */
  screenWidth_m: number;
  /** Distance from the screen to the eyes of someone sitting in the first row. */
  firstRowDistance_m: number;
}

export interface TypeDefaults {
  /** Front-to-back distance from one row to the next. */
  rowSpacing_m: number;
  /** Centre-to-centre distance between neighbouring seats. Gaps take the same width. */
  seatWidth_m: number;
  /** How much higher each row's floor is than the row in front (stadium seating). */
  rowRise_m: number;
  /** Seated eye height above the floor of that row. */
  eyeHeight_m: number;
  bySize: Record<AuditoriumSize, SizeDefaults>;
}

export const TYPE_DEFAULTS: Record<AuditoriumType, TypeDefaults> = {
  standard: {
    rowSpacing_m: 1.0,
    seatWidth_m: 0.55,
    rowRise_m: 0.35,
    eyeHeight_m: 1.15,
    bySize: {
      small: { screenWidth_m: 9.5, firstRowDistance_m: 4.5 },
      medium: { screenWidth_m: 12, firstRowDistance_m: 5.5 },
      large: { screenWidth_m: 15, firstRowDistance_m: 6.5 },
    },
  },
  vip: {
    // Recliners need roughly half a metre more legroom when the footrest is up.
    rowSpacing_m: 1.5,
    seatWidth_m: 0.75,
    // Deeper rows need a bigger step to keep sightlines clear over the row in front.
    rowRise_m: 0.45,
    eyeHeight_m: 1.15,
    bySize: {
      small: { screenWidth_m: 9, firstRowDistance_m: 4.5 },
      medium: { screenWidth_m: 10, firstRowDistance_m: 5 },
      large: { screenWidth_m: 12, firstRowDistance_m: 5.5 },
    },
  },
};

export const SCREEN_DEFAULTS = {
  /** Width ÷ height. 2.39 is "scope", the usual shape of a multiplex screen. */
  aspect: 2.39,
  /** Height of the screen's bottom edge above the floor in front of the first row. */
  bottomHeight_m: 1.2,
};

/**
 * Proportions of the 3D room around the seats. They change how the room looks, never the
 * seat ratings.
 */
export const ROOM = {
  /** Walkway between the outermost seats and the side walls. */
  sideAisle_m: 1.2,
  /** Walkway behind the last row. */
  backAisle_m: 1.5,
  /** The room is at least this much wider than the screen on each side. */
  screenMargin_m: 1.0,
  /** Ceiling clearance above the top of the screen… */
  ceilingAboveScreen_m: 1.6,
  /** …and above the floor of the last row. Whichever is higher wins. */
  ceilingAboveLastRow_m: 3.2,
};
