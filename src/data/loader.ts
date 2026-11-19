import type { z } from 'zod';
import {
  AuditoriumSchema,
  MoviesSchema,
  TheatreIndexSchema,
  TheatreSchema,
  type Auditorium,
  type Movie,
  type Theatre,
} from './schema';

/** Everything wrong with one data file, in words a person can act on. */
export interface DataError {
  file: string;
  messages: string[];
}

export interface TheatreEntry {
  theatre: Theatre;
  auditoriums: Auditorium[];
}

export interface AppData {
  theatres: TheatreEntry[];
  movies: Movie[];
  errors: DataError[];
}

const INDEX_FILE = 'data/theatres.json';
const MOVIES_FILE = 'data/movies.json';
const THEATRE_FILE = /^data\/theatres\/([^/]+)\/theatre\.json$/;
const AUDITORIUM_FILE = /^data\/theatres\/([^/]+)\/auditoriums\/([^/]+)\.json$/;

function formatIssue(issue: { path: PropertyKey[]; message: string }): string {
  const where = issue.path.reduce<string>((text, part) => {
    if (typeof part === 'number') return `${text}[${part}]`;
    return text ? `${text}.${String(part)}` : String(part);
  }, '');
  return where ? `${where}: ${issue.message}` : issue.message;
}

/**
 * Turns the raw text of every file under data/ into validated app data.
 *
 * A file that fails to parse or validate is skipped and reported, so one broken
 * auditorium never takes the rest of the app down with it.
 *
 * @param rawFiles file path (e.g. "/data/theatres.json") → file text
 */
export function buildData(rawFiles: Readonly<Record<string, string>>): AppData {
  const files = new Map<string, string>();
  for (const [path, text] of Object.entries(rawFiles)) {
    files.set(path.replace(/^\.?\/+/, ''), text);
  }

  const problems = new Map<string, string[]>();
  const report = (file: string, message: string): void => {
    problems.set(file, [...(problems.get(file) ?? []), message]);
  };

  const read = <T>(file: string, schema: z.ZodType<T>): T | undefined => {
    const text = files.get(file);
    if (text === undefined) return undefined;
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      report(file, `This file is not valid JSON: ${detail}`);
      return undefined;
    }
    const result = schema.safeParse(json);
    if (!result.success) {
      for (const issue of result.error.issues) report(file, formatIssue(issue));
      return undefined;
    }
    return result.data;
  };

  // What is actually on disk, independent of what the index files claim.
  const theatreFolders = new Set<string>();
  const auditoriumsOnDisk = new Map<string, string[]>();
  for (const path of files.keys()) {
    const theatreMatch = THEATRE_FILE.exec(path);
    if (theatreMatch?.[1]) {
      theatreFolders.add(theatreMatch[1]);
      continue;
    }
    const auditoriumMatch = AUDITORIUM_FILE.exec(path);
    if (auditoriumMatch?.[1] && auditoriumMatch[2]) {
      const [, theatreId, auditoriumId] = auditoriumMatch;
      auditoriumsOnDisk.set(theatreId, [...(auditoriumsOnDisk.get(theatreId) ?? []), auditoriumId]);
    }
  }

  let index: string[] = [];
  if (files.has(INDEX_FILE)) {
    index = read(INDEX_FILE, TheatreIndexSchema) ?? [];
  } else {
    report(INDEX_FILE, 'This file is missing. It lists the theatre ids in display order.');
  }
  for (const id of index) {
    if (!theatreFolders.has(id)) {
      report(
        INDEX_FILE,
        `Theatre "${id}" is listed here but data/theatres/${id}/theatre.json was not found.`,
      );
    }
  }
  for (const id of auditoriumsOnDisk.keys()) {
    if (!theatreFolders.has(id)) {
      report(
        `data/theatres/${id}/theatre.json`,
        'This file is missing, so the auditoriums in this folder were skipped.',
      );
    }
  }

  // Listed theatres first, in the listed order. Unlisted folders follow alphabetically,
  // so dropping in a new folder is enough to make it show up.
  const theatreOrder = [
    ...index.filter((id) => theatreFolders.has(id)),
    ...[...theatreFolders].filter((id) => !index.includes(id)).sort(),
  ];

  const theatres: TheatreEntry[] = [];
  for (const theatreId of theatreOrder) {
    const theatreFile = `data/theatres/${theatreId}/theatre.json`;
    const theatre = read(theatreFile, TheatreSchema);
    if (!theatre) continue;
    if (theatre.id !== theatreId) {
      report(
        theatreFile,
        `"id" is "${theatre.id}" but the folder is named "${theatreId}". They must match.`,
      );
      continue;
    }

    const onDisk = auditoriumsOnDisk.get(theatreId) ?? [];
    const loaded = new Map<string, Auditorium>();
    for (const auditoriumId of onDisk) {
      const file = `data/theatres/${theatreId}/auditoriums/${auditoriumId}.json`;
      const auditorium = read(file, AuditoriumSchema);
      if (!auditorium) continue;
      if (auditorium.id !== auditoriumId) {
        report(
          file,
          `"id" is "${auditorium.id}" but the file name is "${auditoriumId}.json". They must match.`,
        );
        continue;
      }
      if (auditorium.theatreId !== theatreId) {
        report(
          file,
          `"theatreId" is "${auditorium.theatreId}" but this file is in the "${theatreId}" folder.`,
        );
        continue;
      }
      loaded.set(auditoriumId, auditorium);
    }

    for (const listed of theatre.auditoriums) {
      if (!onDisk.includes(listed)) {
        report(
          theatreFile,
          `Auditorium "${listed}" is listed here but auditoriums/${listed}.json was not found.`,
        );
      }
    }

    const auditoriumOrder = [
      ...theatre.auditoriums.filter((id) => loaded.has(id)),
      ...[...loaded.keys()].filter((id) => !theatre.auditoriums.includes(id)).sort(),
    ];
    theatres.push({
      theatre,
      auditoriums: auditoriumOrder.flatMap((id) => loaded.get(id) ?? []),
    });
  }

  // The movie list is optional: the app works with pasted YouTube links alone.
  const movies = read(MOVIES_FILE, MoviesSchema) ?? [];

  const errors = [...problems.entries()]
    .map(([file, messages]) => ({ file, messages }))
    .sort((a, b) => a.file.localeCompare(b.file));

  return { theatres, movies, errors };
}

export function findTheatre(data: AppData, theatreId: string): TheatreEntry | undefined {
  return data.theatres.find((entry) => entry.theatre.id === theatreId);
}

export function findAuditorium(entry: TheatreEntry, auditoriumId: string): Auditorium | undefined {
  return entry.auditoriums.find((auditorium) => auditorium.id === auditoriumId);
}
