/** Helpers for tests only. Nothing in the app imports this file. */
import { resolveAuditorium, type Auditorium } from '../data/resolve';
import { auditoriumSchema, type AuditoriumInput } from '../data/schema';
import { computeLayout, type AuditoriumLayout } from '../geometry/layout';

/** Seat numbers 1…n. */
export function range(n: number): number[] {
  return Array.from({ length: n }, (_unused, i) => i + 1);
}

/**
 * A measured, fully specified standard room: 12 m wide 2.4:1 screen, first row 5 m away,
 * 14 rows of 2 + aisle + 14 + aisle + 2 seats.
 */
export function makeAuditorium(patch: Partial<AuditoriumInput> = {}): Auditorium {
  return resolveAuditorium(
    auditoriumSchema.parse({
      id: 'test-room',
      theatreId: 'test-theatre',
      name: 'Test room',
      screen: { width_m: 12, aspect: 2.4, bottomHeight_m: 1.2 },
      firstRowDistance_m: 5,
      rowSpacing_m: 1,
      rowRise_m: 0.35,
      seatWidth_m: 0.5,
      eyeHeight_m: 1.15,
      rows: 'ABCDEFGHIJKLMN'.split('').map((label) => ({
        label,
        seats: [1, 2, null, ...range(14).map((n) => n + 2), null, 17, 18],
      })),
      verified: true,
      ...patch,
    }),
  );
}

export function makeLayout(patch: Partial<AuditoriumInput> = {}): AuditoriumLayout {
  return computeLayout(makeAuditorium(patch));
}
