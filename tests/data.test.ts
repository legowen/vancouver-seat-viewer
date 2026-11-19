import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildData } from '../src/data/loader';
import { AuditoriumSchema } from '../src/data/schema';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** Reads every JSON file under data/ the same way the app bundles them. */
function readDataFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.json')) {
        files['/' + relative(repoRoot, path).split(sep).join('/')] = readFileSync(path, 'utf8');
      }
    }
  };
  walk(join(repoRoot, 'data'));
  return files;
}

/** A minimal valid data set. Pass a string for raw text, or undefined to remove a file. */
function fixture(overrides: Record<string, unknown> = {}): Record<string, string> {
  const files: Record<string, unknown> = {
    '/data/theatres.json': ['alpha'],
    '/data/theatres/alpha/theatre.json': {
      id: 'alpha',
      name: 'Alpha Cinema',
      area: 'Testville',
      auditoriums: ['alpha-1'],
    },
    '/data/theatres/alpha/auditoriums/alpha-1.json': {
      id: 'alpha-1',
      theatreId: 'alpha',
      name: 'Auditorium 1',
      type: 'standard',
      rows: [{ label: 'A', seats: [1, 2, null, 3] }],
    },
    '/data/movies.json': [],
    ...overrides,
  };
  const out: Record<string, string> = {};
  for (const [path, value] of Object.entries(files)) {
    if (value === undefined) continue;
    out[path] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

const messagesFor = (errors: { file: string; messages: string[] }[], fileEnding: string) =>
  errors
    .filter((error) => error.file.endsWith(fileEnding))
    .flatMap((error) => error.messages)
    .join('\n');

describe('data/ directory', () => {
  const data = buildData(readDataFiles());

  it('has no invalid JSON files', () => {
    expect(data.errors).toEqual([]);
  });

  it('lists the seven theatres in display order', () => {
    expect(data.theatres.map((entry) => entry.theatre.id)).toEqual([
      'cineplex-coquitlam',
      'cineplex-vip-brentwood',
      'cineplex-metropolis',
      'cineplex-marine-gateway',
      'silvercity-riverport',
      'cineplex-international-village',
      'scotiabank-vancouver',
    ]);
  });

  it('gives every theatre at least one auditorium', () => {
    const empty = data.theatres
      .filter((entry) => entry.auditoriums.length === 0)
      .map((entry) => entry.theatre.id);
    expect(empty).toEqual([]);
  });

  it('uses a VIP sample layout for Brentwood and Marine Gateway', () => {
    const typeOf = (theatreId: string) =>
      data.theatres.find((entry) => entry.theatre.id === theatreId)?.auditoriums[0]?.type;
    expect(typeOf('cineplex-vip-brentwood')).toBe('vip');
    expect(typeOf('cineplex-marine-gateway')).toBe('vip');
    expect(typeOf('cineplex-coquitlam')).toBe('standard');
  });

  it('gives standard sample auditoriums 10 to 16 rows', () => {
    const rowCounts = data.theatres
      .flatMap((entry) => entry.auditoriums)
      .filter((auditorium) => auditorium.placeholder && auditorium.type === 'standard')
      .map((auditorium) => auditorium.rows.length);
    expect(rowCounts.length).toBeGreaterThanOrEqual(5);
    expect(rowCounts.every((count) => count >= 10 && count <= 16)).toBe(true);
  });

  it('labels placeholder auditoriums as samples with unverified dimensions', () => {
    const placeholders = data.theatres
      .flatMap((entry) => entry.auditoriums)
      .filter((auditorium) => auditorium.placeholder);
    expect(placeholders.length).toBeGreaterThanOrEqual(7);
    for (const auditorium of placeholders) {
      expect(auditorium.name).toMatch(/^Sample auditorium/);
      expect(auditorium.verified ?? false).toBe(false);
    }
  });

  it('gives every movie an id, a title, a channel and an 11-character YouTube id', () => {
    for (const movie of data.movies) {
      expect(movie.youtubeId).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(movie.title.length).toBeGreaterThan(0);
      expect(movie.channel.length).toBeGreaterThan(0);
      expect(movie.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const ids = data.movies.map((movie) => movie.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildData', () => {
  it('loads a valid data set without errors', () => {
    const data = buildData(fixture());
    expect(data.errors).toEqual([]);
    expect(data.theatres).toHaveLength(1);
    expect(data.theatres[0]!.auditoriums.map((auditorium) => auditorium.id)).toEqual(['alpha-1']);
  });

  it('reports unreadable JSON with the file name', () => {
    const data = buildData(fixture({ '/data/theatres/alpha/auditoriums/alpha-1.json': '{ oops' }));
    expect(messagesFor(data.errors, 'auditoriums/alpha-1.json')).toMatch(/not valid JSON/i);
    expect(data.theatres[0]!.auditoriums).toEqual([]);
  });

  it('reports schema problems with the path of the offending field', () => {
    const data = buildData(
      fixture({
        '/data/theatres/alpha/auditoriums/alpha-1.json': {
          id: 'alpha-1',
          theatreId: 'alpha',
          name: 'Auditorium 1',
          type: 'imax',
          screen: { width_m: 'wide' },
          rows: [{ label: 'A', seats: [1, 2] }],
        },
      }),
    );
    const messages = messagesFor(data.errors, 'auditoriums/alpha-1.json');
    expect(messages).toMatch(/type/);
    expect(messages).toMatch(/screen\.width_m/);
  });

  it('rejects an auditorium whose id differs from its file name', () => {
    const data = buildData(
      fixture({
        '/data/theatres/alpha/auditoriums/alpha-1.json': {
          id: 'something-else',
          theatreId: 'alpha',
          name: 'Auditorium 1',
          type: 'standard',
          rows: [{ label: 'A', seats: [1] }],
        },
      }),
    );
    expect(messagesFor(data.errors, 'auditoriums/alpha-1.json')).toMatch(/file name/);
    expect(data.theatres[0]!.auditoriums).toEqual([]);
  });

  it('rejects an auditorium filed under the wrong theatre', () => {
    const data = buildData(
      fixture({
        '/data/theatres/alpha/auditoriums/alpha-1.json': {
          id: 'alpha-1',
          theatreId: 'beta',
          name: 'Auditorium 1',
          type: 'standard',
          rows: [{ label: 'A', seats: [1] }],
        },
      }),
    );
    expect(messagesFor(data.errors, 'auditoriums/alpha-1.json')).toMatch(/theatreId/);
  });

  it('keeps valid auditoriums when a sibling file is invalid', () => {
    const data = buildData(
      fixture({
        '/data/theatres/alpha/auditoriums/alpha-2.json': { id: 'alpha-2' },
      }),
    );
    expect(data.theatres[0]!.auditoriums.map((auditorium) => auditorium.id)).toEqual(['alpha-1']);
    expect(data.errors.map((error) => error.file)).toEqual([
      'data/theatres/alpha/auditoriums/alpha-2.json',
    ]);
  });

  it('appends auditoriums that theatre.json does not list, after the listed ones', () => {
    const extra = {
      theatreId: 'alpha',
      name: 'Extra',
      type: 'standard',
      rows: [{ label: 'A', seats: [1] }],
    };
    const data = buildData(
      fixture({
        '/data/theatres/alpha/auditoriums/alpha-0.json': { id: 'alpha-0', ...extra },
        '/data/theatres/alpha/auditoriums/alpha-9.json': { id: 'alpha-9', ...extra },
      }),
    );
    expect(data.errors).toEqual([]);
    expect(data.theatres[0]!.auditoriums.map((auditorium) => auditorium.id)).toEqual([
      'alpha-1',
      'alpha-0',
      'alpha-9',
    ]);
  });

  it('reports auditoriums that theatre.json lists but that have no file', () => {
    const data = buildData(
      fixture({
        '/data/theatres/alpha/theatre.json': {
          id: 'alpha',
          name: 'Alpha Cinema',
          area: 'Testville',
          auditoriums: ['alpha-1', 'ghost'],
        },
      }),
    );
    expect(messagesFor(data.errors, 'alpha/theatre.json')).toMatch(/ghost/);
    expect(data.theatres[0]!.auditoriums).toHaveLength(1);
  });

  it('reports theatres that theatres.json lists but that have no folder', () => {
    const data = buildData(fixture({ '/data/theatres.json': ['alpha', 'missing-theatre'] }));
    expect(messagesFor(data.errors, 'data/theatres.json')).toMatch(/missing-theatre/);
    expect(data.theatres).toHaveLength(1);
  });

  it('rejects a theatre whose id differs from its folder name', () => {
    const data = buildData(
      fixture({
        '/data/theatres/alpha/theatre.json': {
          id: 'beta',
          name: 'Alpha Cinema',
          area: 'Testville',
          auditoriums: [],
        },
      }),
    );
    expect(messagesFor(data.errors, 'alpha/theatre.json')).toMatch(/folder/);
    expect(data.theatres).toEqual([]);
  });

  it('works when movies.json is missing or empty', () => {
    expect(buildData(fixture({ '/data/movies.json': undefined })).movies).toEqual([]);
    expect(buildData(fixture({ '/data/movies.json': undefined })).errors).toEqual([]);
    expect(buildData(fixture()).movies).toEqual([]);
  });

  it('rejects a movie with a malformed YouTube id', () => {
    const data = buildData(
      fixture({
        '/data/movies.json': [
          {
            id: 'bad',
            title: 'Bad',
            youtubeId: 'short',
            channel: 'Studio',
            verifiedOn: '2026-11-13',
          },
        ],
      }),
    );
    expect(messagesFor(data.errors, 'data/movies.json')).toMatch(/youtubeId/);
    expect(data.movies).toEqual([]);
  });
});

describe('AuditoriumSchema', () => {
  const specExample = {
    id: 'riverport-07',
    theatreId: 'silvercity-riverport',
    name: 'Auditorium 7',
    type: 'standard',
    screen: { width_m: 14.0, aspect: 2.39, bottomHeight_m: 1.2 },
    firstRowDistance_m: 5.0,
    rowSpacing_m: 1.0,
    rowRise_m: 0.35,
    seatWidth_m: 0.55,
    eyeHeight_m: 1.15,
    rows: [{ label: 'A', seats: [1, 2, 3, 4, null, 5, 6, 7, 8, 9, 10, null, 11, 12] }],
    entrance: 'front-left',
    verified: false,
    source: 'seatmap screenshot YYYY-MM-DD',
    notes: '',
  };
  const minimal = {
    id: 'a-1',
    theatreId: 'a',
    name: 'Auditorium 1',
    type: 'vip',
    rows: [{ label: 'A', seats: [1, 2] }],
  };

  it('accepts the example file from the project brief', () => {
    expect(AuditoriumSchema.safeParse(specExample).success).toBe(true);
  });

  it('accepts a file with no dimension fields at all', () => {
    expect(AuditoriumSchema.safeParse(minimal).success).toBe(true);
  });

  it('rejects a seat number that appears twice in one row', () => {
    const result = AuditoriumSchema.safeParse({
      ...minimal,
      rows: [{ label: 'A', seats: [1, 2, 2] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects two rows with the same label', () => {
    const result = AuditoriumSchema.safeParse({
      ...minimal,
      rows: [
        { label: 'A', seats: [1] },
        { label: 'A', seats: [1] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a row that is nothing but gaps', () => {
    const result = AuditoriumSchema.safeParse({
      ...minimal,
      rows: [{ label: 'A', seats: [null, null] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects misspelled fields instead of silently ignoring them', () => {
    expect(AuditoriumSchema.safeParse({ ...minimal, rowSpacing: 1.2 }).success).toBe(false);
  });

  it('rejects auditorium types outside standard and vip', () => {
    expect(AuditoriumSchema.safeParse({ ...minimal, type: 'imax' }).success).toBe(false);
  });
});
