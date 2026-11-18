/**
 * zod schemas for every JSON file under `data/`.
 * The app validates each file when it loads; `tests/data-files.test.ts` validates them all in CI.
 */
import { z } from 'zod';
import { DIMENSION_LIMITS } from '../config/defaults';

export const AUDITORIUM_TYPES = ['standard', 'vip'] as const;
export const ENTRANCES = ['front-left', 'front-right', 'back-left', 'back-right'] as const;

export const MAX_ROWS = 60;
export const MAX_CELLS_PER_ROW = 120;
export const MAX_SEAT_NUMBER = 999;

const idSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase letters, digits and hyphens');

function dimension(key: keyof typeof DIMENSION_LIMITS) {
  const { min, max } = DIMENSION_LIMITS[key];
  return z.number().min(min).max(max);
}

const rowSchema = z
  .strictObject({
    /** Row label as printed on the seat map, e.g. "A". */
    label: z.string().trim().min(1).max(4),
    /** Seat numbers from audience-left to audience-right. `null` is an aisle or a gap. */
    seats: z
      .array(z.union([z.number().int().min(1).max(MAX_SEAT_NUMBER), z.null()]))
      .min(1)
      .max(MAX_CELLS_PER_ROW),
  })
  .superRefine((row, ctx) => {
    const seen = new Set<number>();
    let seatCount = 0;
    row.seats.forEach((seat, index) => {
      if (seat === null) return;
      seatCount += 1;
      if (seen.has(seat)) {
        ctx.addIssue({
          code: 'custom',
          message: `seat ${seat} appears twice in row ${row.label}`,
          path: ['seats', index],
        });
      }
      seen.add(seat);
    });
    if (seatCount === 0) {
      ctx.addIssue({ code: 'custom', message: 'a row needs at least one seat', path: ['seats'] });
    }
  });

export const auditoriumSchema = z
  .strictObject({
    id: idSchema,
    theatreId: idSchema,
    name: z.string().trim().min(1).max(80),
    type: z.enum(AUDITORIUM_TYPES).default('standard'),
    screen: z
      .strictObject({
        width_m: dimension('screenWidth_m').optional(),
        aspect: dimension('screenAspect').optional(),
        bottomHeight_m: dimension('screenBottomHeight_m').optional(),
      })
      .optional(),
    firstRowDistance_m: dimension('firstRowDistance_m').optional(),
    rowSpacing_m: dimension('rowSpacing_m').optional(),
    rowRise_m: dimension('rowRise_m').optional(),
    seatWidth_m: dimension('seatWidth_m').optional(),
    eyeHeight_m: dimension('eyeHeight_m').optional(),
    /** Front row first. */
    rows: z.array(rowSchema).min(1).max(MAX_ROWS),
    /** Where the avatar walks in, as seen from the seats facing the screen. */
    entrance: z.enum(ENTRANCES).default('front-left'),
    /** `false` while any dimension is a default rather than a measurement. */
    verified: z.boolean().default(false),
    /** Marks a made-up sample layout so the UI can label it. */
    placeholder: z.boolean().optional(),
    source: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
  })
  .superRefine((auditorium, ctx) => {
    const seen = new Set<string>();
    auditorium.rows.forEach((row, index) => {
      if (seen.has(row.label)) {
        ctx.addIssue({
          code: 'custom',
          message: `row label "${row.label}" is used twice`,
          path: ['rows', index, 'label'],
        });
      }
      seen.add(row.label);
    });
  });

export const theatreSchema = z.strictObject({
  id: idSchema,
  /** English display name. Kept in data so it is easy to correct. */
  name: z.string().trim().min(1).max(120),
  /** City or neighbourhood, e.g. "Richmond". */
  area: z.string().trim().min(1).max(80),
  /** Optional display names per locale code, e.g. { "ko": "…" }. */
  localizedNames: z.record(z.string(), z.string().trim().min(1)).optional(),
  /** Auditorium ids in display order. Each needs a file in `auditoriums/<id>.json`. */
  auditoriums: z.array(idSchema),
  notes: z.string().max(2000).optional(),
});

export const theatreIndexSchema = z
  .array(idSchema)
  .min(1)
  .superRefine((ids, ctx) => {
    const seen = new Set<string>();
    ids.forEach((id, index) => {
      if (seen.has(id)) {
        ctx.addIssue({ code: 'custom', message: `"${id}" is listed twice`, path: [index] });
      }
      seen.add(id);
    });
  });

export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const youtubeIdSchema = z.string().regex(YOUTUBE_ID_PATTERN, 'must be an 11-character YouTube id');
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-11-17');

export const movieSchema = z.strictObject({
  id: idSchema,
  /** Movie title, always in English. */
  title: z.string().trim().min(1).max(160),
  youtubeId: youtubeIdSchema,
  /** `author_name` returned by YouTube oEmbed: the official studio or distributor channel. */
  channel: z.string().trim().min(1).max(120),
  /** Day the id last passed the oEmbed check. */
  verifiedOn: isoDateSchema,
});

export const moviesSchema = z.array(movieSchema);

/** Search results waiting for an oEmbed check. Never loaded by the app. */
export const movieCandidateSchema = z.strictObject({
  id: idSchema,
  title: z.string().trim().min(1).max(160),
  youtubeId: youtubeIdSchema,
  expectedChannel: z.string().trim().min(1).max(120),
  foundAt: z.string().min(1).max(500),
  release: z.string().max(120).optional(),
});

export const movieCandidatesSchema = z.array(movieCandidateSchema);

export type AuditoriumJson = z.infer<typeof auditoriumSchema>;
export type AuditoriumInput = z.input<typeof auditoriumSchema>;
export type RowJson = AuditoriumJson['rows'][number];
export type SeatCell = number | null;
export type Entrance = (typeof ENTRANCES)[number];
export type TheatreJson = z.infer<typeof theatreSchema>;
export type Movie = z.infer<typeof movieSchema>;
export type MovieCandidate = z.infer<typeof movieCandidateSchema>;

/** `rows[2].seats[5]` style path for error messages. */
export function formatIssuePath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += out ? `.${String(part)}` : String(part);
  }
  return out;
}

/** One readable line per problem, e.g. `rows[2].seats[5]: seat 7 appears twice in row C`. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where = formatIssuePath(issue.path);
    return where ? `${where}: ${issue.message}` : issue.message;
  });
}
