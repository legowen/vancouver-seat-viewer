/**
 * Builds the app's catalogue (theatres → auditoriums, plus the trailer list) from raw JSON and
 * validates every piece with zod. Nothing here throws: a broken file becomes a `DataIssue` that
 * the UI shows next to the theatre or auditorium it belongs to, and the rest keeps working.
 *
 * This module has no access to the file system or the bundler, so tests can feed it anything.
 */
import { resolveAuditorium, type Auditorium } from './resolve';
import {
  auditoriumSchema,
  formatIssues,
  moviesSchema,
  theatreIndexSchema,
  theatreSchema,
  type Movie,
} from './schema';

/** A problem with one data file, ready to show to the person who edits the data. */
export interface DataIssue {
  /** Path relative to the repo root, e.g. `data/theatres/x/theatre.json`. */
  file: string;
  messages: string[];
}

export type AuditoriumEntry =
  | { id: string; file: string; ok: true; auditorium: Auditorium }
  | { id: string; file: string; ok: false; issue: DataIssue };

export interface TheatreEntry {
  id: string;
  name: string;
  area: string;
  localizedNames?: Record<string, string>;
  auditoriums: AuditoriumEntry[];
}

export interface Catalog {
  theatres: TheatreEntry[];
  movies: Movie[];
  /** Problems that are not tied to a single auditorium (index, theatre files, trailer list). */
  issues: DataIssue[];
}

/** Raw file contents keyed by repo-relative path. */
export interface RawData {
  theatreIndex: unknown;
  /** `data/theatres/<id>/theatre.json` → parsed JSON */
  theatres: Record<string, unknown>;
  /** `data/theatres/<id>/auditoriums/<aud>.json` → parsed JSON */
  auditoriums: Record<string, unknown>;
  movies: unknown;
}

export const THEATRE_INDEX_FILE = 'data/theatres.json';
export const MOVIES_FILE = 'data/movies.json';

export function theatreFile(theatreId: string): string {
  return `data/theatres/${theatreId}/theatre.json`;
}

export function auditoriumFile(theatreId: string, auditoriumId: string): string {
  return `data/theatres/${theatreId}/auditoriums/${auditoriumId}.json`;
}

function loadAuditorium(theatreId: string, id: string, raw: RawData): AuditoriumEntry {
  const file = auditoriumFile(theatreId, id);
  const fail = (messages: string[]): AuditoriumEntry => ({
    id,
    file,
    ok: false,
    issue: { file, messages },
  });

  if (!(file in raw.auditoriums)) {
    return fail([`the file is missing, but "${id}" is listed in ${theatreFile(theatreId)}`]);
  }
  const parsed = auditoriumSchema.safeParse(raw.auditoriums[file]);
  if (!parsed.success) return fail(formatIssues(parsed.error));

  const messages: string[] = [];
  if (parsed.data.id !== id) {
    messages.push(`id: is "${parsed.data.id}" but the file name says "${id}"`);
  }
  if (parsed.data.theatreId !== theatreId) {
    messages.push(`theatreId: is "${parsed.data.theatreId}" but the folder says "${theatreId}"`);
  }
  if (messages.length > 0) return fail(messages);

  return { id, file, ok: true, auditorium: resolveAuditorium(parsed.data) };
}

export function buildCatalog(raw: RawData): Catalog {
  const issues: DataIssue[] = [];
  const theatres: TheatreEntry[] = [];

  const index = theatreIndexSchema.safeParse(raw.theatreIndex);
  if (!index.success) {
    issues.push({ file: THEATRE_INDEX_FILE, messages: formatIssues(index.error) });
  }

  for (const theatreId of index.success ? index.data : []) {
    const file = theatreFile(theatreId);
    if (!(file in raw.theatres)) {
      issues.push({
        file,
        messages: [`the file is missing, but "${theatreId}" is listed in ${THEATRE_INDEX_FILE}`],
      });
      continue;
    }
    const parsed = theatreSchema.safeParse(raw.theatres[file]);
    if (!parsed.success) {
      issues.push({ file, messages: formatIssues(parsed.error) });
      continue;
    }
    if (parsed.data.id !== theatreId) {
      issues.push({
        file,
        messages: [`id: is "${parsed.data.id}" but the folder says "${theatreId}"`],
      });
      continue;
    }

    const listed = new Set(parsed.data.auditoriums);
    const prefix = `data/theatres/${theatreId}/auditoriums/`;
    // Files that exist but were not added to theatre.json still show up, after the listed ones.
    const unlisted = Object.keys(raw.auditoriums)
      .filter((path) => path.startsWith(prefix))
      .map((path) => path.slice(prefix.length).replace(/\.json$/, ''))
      .filter((id) => !listed.has(id))
      .sort();

    theatres.push({
      id: theatreId,
      name: parsed.data.name,
      area: parsed.data.area,
      localizedNames: parsed.data.localizedNames,
      auditoriums: [...parsed.data.auditoriums, ...unlisted].map((id) =>
        loadAuditorium(theatreId, id, raw),
      ),
    });
  }

  let movies: Movie[] = [];
  const parsedMovies = moviesSchema.safeParse(raw.movies);
  if (parsedMovies.success) movies = parsedMovies.data;
  else issues.push({ file: MOVIES_FILE, messages: formatIssues(parsedMovies.error) });

  return { theatres, movies, issues };
}

export function findTheatre(catalog: Catalog, theatreId: string): TheatreEntry | undefined {
  return catalog.theatres.find((theatre) => theatre.id === theatreId);
}

export function findAuditorium(
  theatre: TheatreEntry,
  auditoriumId: string,
): AuditoriumEntry | undefined {
  return theatre.auditoriums.find((entry) => entry.id === auditoriumId);
}
