/**
 * Validates every JSON file under `data/` straight from disk, and checks that folders, file
 * names, ids and lists agree. This is the test that fails when a hand-written seat map is wrong.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import { loadCatalog } from '../src/data/loader';
import { resolveAuditorium } from '../src/data/resolve';
import {
  auditoriumSchema,
  formatIssues,
  movieCandidatesSchema,
  moviesSchema,
  theatreIndexSchema,
  theatreSchema,
} from '../src/data/schema';
import { computeLayout } from '../src/geometry/layout';

const DATA = join(process.cwd(), 'data');

function readJson(...parts: string[]): unknown {
  return JSON.parse(readFileSync(join(DATA, ...parts), 'utf8'));
}

function folders(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort();
}

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

/** Parses with zod and fails the test with the readable issue list. */
function parseOrFail<T>(schema: ZodType<T>, value: unknown, file: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${file} is not valid:\n  ${formatIssues(result.error).join('\n  ')}`);
  }
  return result.data;
}

const theatreIds = parseOrFail(theatreIndexSchema, readJson('theatres.json'), 'data/theatres.json');

describe('data/theatres.json', () => {
  it('lists the seven theatres in scope', () => {
    expect(theatreIds).toEqual([
      'cineplex-coquitlam',
      'cineplex-vip-brentwood',
      'cineplex-metropolis',
      'cineplex-marine-gateway',
      'silvercity-riverport',
      'cineplex-international-village',
      'scotiabank-vancouver',
    ]);
  });

  it('has a folder for every listed theatre and no unlisted folders', () => {
    expect(folders(join(DATA, 'theatres'))).toEqual([...theatreIds].sort());
  });
});

describe.each(theatreIds)('theatre %s', (theatreId) => {
  const theatreFile = `data/theatres/${theatreId}/theatre.json`;
  const theatre = parseOrFail(
    theatreSchema,
    readJson('theatres', theatreId, 'theatre.json'),
    theatreFile,
  );
  const auditoriumDir = join(DATA, 'theatres', theatreId, 'auditoriums');

  it('has an id that matches its folder', () => {
    expect(theatre.id).toBe(theatreId);
  });

  it('only uses locale codes the app has for its localized names', () => {
    const codes = jsonFiles(join(process.cwd(), 'src', 'i18n', 'locales')).map((name) =>
      name.replace(/\.json$/, ''),
    );
    for (const code of Object.keys(theatre.localizedNames ?? {})) expect(codes).toContain(code);
  });

  it('has at least one auditorium', () => {
    expect(theatre.auditoriums.length).toBeGreaterThan(0);
  });

  it('lists exactly the auditorium files that exist', () => {
    const onDisk = jsonFiles(auditoriumDir).map((name) => name.replace(/\.json$/, ''));
    expect([...theatre.auditoriums].sort()).toEqual(onDisk);
    expect(new Set(theatre.auditoriums).size).toBe(theatre.auditoriums.length);
  });

  describe.each(theatre.auditoriums)('auditorium %s', (auditoriumId) => {
    const file = `data/theatres/${theatreId}/auditoriums/${auditoriumId}.json`;
    const json = parseOrFail(
      auditoriumSchema,
      readJson('theatres', theatreId, 'auditoriums', `${auditoriumId}.json`),
      file,
    );

    it('has ids that match its path', () => {
      expect(json.id).toBe(auditoriumId);
      expect(json.theatreId).toBe(theatreId);
    });

    it('resolves to a sane layout', () => {
      const auditorium = resolveAuditorium(json);
      const layout = computeLayout(auditorium);
      expect(layout.seats.length).toBe(auditorium.seatCount);
      expect(layout.seatById.size).toBe(auditorium.seatCount);
      for (const seat of layout.seats) {
        expect(seat.z).toBeGreaterThan(0);
        expect(Math.abs(seat.x)).toBeLessThan(layout.room.halfWidth);
      }
    });

    it('is marked unverified while it relies on default dimensions', () => {
      const auditorium = resolveAuditorium(json);
      if (auditorium.defaulted.length > 0) expect(auditorium.verified).toBe(false);
    });
  });
});

describe('placeholder auditoriums', () => {
  it('are clearly labelled and use VIP seats where the theatre is VIP', () => {
    const catalog = loadCatalog();
    for (const theatre of catalog.theatres) {
      for (const entry of theatre.auditoriums) {
        if (!entry.ok || !entry.auditorium.placeholder) continue;
        expect(entry.auditorium.name).toBe('Sample auditorium — replace with real seat map');
        expect(entry.auditorium.verified).toBe(false);
        expect(entry.auditorium.rows.length).toBeGreaterThanOrEqual(6);
        expect(entry.auditorium.rows.length).toBeLessThanOrEqual(16);
      }
    }
    const typeOf = (theatreId: string) => {
      const entry = catalog.theatres.find((t) => t.id === theatreId)?.auditoriums[0];
      return entry?.ok ? entry.auditorium.type : undefined;
    };
    expect(typeOf('cineplex-vip-brentwood')).toBe('vip');
    expect(typeOf('cineplex-marine-gateway')).toBe('vip');
    expect(typeOf('silvercity-riverport')).toBe('standard');
  });
});

describe('trailer lists', () => {
  it('data/movies.json is valid and has unique ids', () => {
    const movies = parseOrFail(moviesSchema, readJson('movies.json'), 'data/movies.json');
    expect(new Set(movies.map((m) => m.id)).size).toBe(movies.length);
    expect(new Set(movies.map((m) => m.youtubeId)).size).toBe(movies.length);
  });

  it('data/movie-candidates.json is valid when present', () => {
    if (!existsSync(join(DATA, 'movie-candidates.json'))) return;
    const candidates = parseOrFail(
      movieCandidatesSchema,
      readJson('movie-candidates.json'),
      'data/movie-candidates.json',
    );
    expect(new Set(candidates.map((c) => c.id)).size).toBe(candidates.length);
  });
});

describe('the bundled catalogue', () => {
  it('loads every file without a single issue', () => {
    const catalog = loadCatalog();
    expect(catalog.issues).toEqual([]);
    const broken = catalog.theatres.flatMap((theatre) =>
      theatre.auditoriums.filter((entry) => !entry.ok).map((entry) => entry.file),
    );
    expect(broken).toEqual([]);
    expect(catalog.theatres.map((theatre) => theatre.id)).toEqual(theatreIds);
  });
});
