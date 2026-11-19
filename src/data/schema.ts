import { z } from 'zod';

export const AUDITORIUM_TYPES = ['standard', 'vip'] as const;
export const ENTRANCES = ['front-left', 'front-right', 'back-left', 'back-right'] as const;
export const ROW_ALIGNMENTS = ['center', 'left', 'right'] as const;

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase letters, digits and hyphens only');

/** Optional display names per locale code, e.g. { "ko": "…", "zh-Hans": "…" }. */
const localizedNames = z.record(z.string(), z.string().min(1));

const hasDuplicates = (values: readonly unknown[]): boolean =>
  new Set(values).size !== values.length;

// Objects are strict so a misspelled field ("rowSpacing" for "rowSpacing_m") is reported
// instead of being silently replaced by a default.
const ScreenSchema = z.strictObject({
  width_m: z.number().min(2).max(40).optional(),
  /** Width divided by height: 2.39 for scope, 1.85 for flat. */
  aspect: z.number().min(1).max(3).optional(),
  /** Height of the screen's bottom edge above the floor in front of row 1. */
  bottomHeight_m: z.number().min(0).max(6).optional(),
});

const RowSchema = z
  .strictObject({
    label: z.string().regex(/^[A-Za-z0-9]{1,3}$/, 'row labels are 1 to 3 letters or digits'),
    /** Seat numbers from the viewer's left to right when facing the screen. null is a gap. */
    seats: z
      .array(z.union([z.number().int().min(1).max(999), z.null()]))
      .min(1)
      .max(80),
  })
  .superRefine((row, context) => {
    const numbers = row.seats.filter((seat) => seat !== null);
    if (numbers.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['seats'],
        message: `row ${row.label} has no seats, only gaps`,
      });
    }
    const repeated = numbers.find((seat, index) => numbers.indexOf(seat) !== index);
    if (repeated !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['seats'],
        message: `seat ${repeated} appears more than once in row ${row.label}`,
      });
    }
  });

export const AuditoriumSchema = z
  .strictObject({
    id: slug,
    theatreId: slug,
    name: z.string().min(1),
    names: localizedNames.optional(),
    type: z.enum(AUDITORIUM_TYPES),
    // Every dimension is optional. Missing values come from src/config/defaults.ts.
    screen: ScreenSchema.optional(),
    /** Distance from the screen to the eyes of someone in the first row. */
    firstRowDistance_m: z.number().min(1).max(40).optional(),
    rowSpacing_m: z.number().min(0.6).max(3).optional(),
    /** How much higher each row's floor is than the row in front. */
    rowRise_m: z.number().min(0).max(1).optional(),
    seatWidth_m: z.number().min(0.4).max(1.5).optional(),
    /** Seated eye height above the floor of that row. */
    eyeHeight_m: z.number().min(0.8).max(1.6).optional(),
    /** Rows from the one nearest the screen to the back. */
    rows: z.array(RowSchema).min(1).max(60),
    /** How rows of different lengths line up. Defaults to "center". */
    rowAlign: z.enum(ROW_ALIGNMENTS).optional(),
    /** Where the avatar walks in from. Defaults to "front-left". */
    entrance: z.enum(ENTRANCES).optional(),
    /** false (the default) means the dimensions are estimates, not measured. */
    verified: z.boolean().optional(),
    /** true for the made-up sample layouts that ship with the app. */
    placeholder: z.boolean().optional(),
    source: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((auditorium, context) => {
    const labels = auditorium.rows.map((row) => row.label);
    const repeated = labels.find((label, index) => labels.indexOf(label) !== index);
    if (repeated !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['rows'],
        message: `row label "${repeated}" is used more than once`,
      });
    }
  });

export const TheatreSchema = z.strictObject({
  id: slug,
  /** Official name, in English. Best-effort: correct it here if it is wrong. */
  name: z.string().min(1),
  area: z.string().min(1),
  names: localizedNames.optional(),
  areaNames: localizedNames.optional(),
  /** Auditorium ids in display order. Files not listed here are appended alphabetically. */
  auditoriums: z.array(slug).refine((ids) => !hasDuplicates(ids), 'auditorium ids must be unique'),
  notes: z.string().optional(),
});

/** data/theatres.json: theatre ids in display order. */
export const TheatreIndexSchema = z
  .array(slug)
  .refine((ids) => !hasDuplicates(ids), 'theatre ids must be unique');

export const MovieSchema = z.strictObject({
  id: slug,
  title: z.string().min(1),
  youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/, 'YouTube ids are exactly 11 characters'),
  /** The official studio or distributor channel that uploaded the trailer. */
  channel: z.string().min(1),
  verifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use the form YYYY-MM-DD'),
});

export const MoviesSchema = z
  .array(MovieSchema)
  .refine((movies) => !hasDuplicates(movies.map((movie) => movie.id)), 'movie ids must be unique');

export type Auditorium = z.infer<typeof AuditoriumSchema>;
export type AuditoriumRow = Auditorium['rows'][number];
export type AuditoriumType = (typeof AUDITORIUM_TYPES)[number];
export type Entrance = (typeof ENTRANCES)[number];
export type RowAlignment = (typeof ROW_ALIGNMENTS)[number];
export type Theatre = z.infer<typeof TheatreSchema>;
export type Movie = z.infer<typeof MovieSchema>;

/** Number of real seats, ignoring gaps. */
export function countSeats(rows: readonly AuditoriumRow[]): number {
  return rows.reduce((total, row) => total + row.seats.filter((seat) => seat !== null).length, 0);
}
