import { describe, expect, it } from 'vitest';
import { buildCatalog, findAuditorium, findTheatre, type RawData } from './catalog';

const theatre = {
  id: 'test-theatre',
  name: 'Test Theatre',
  area: 'Testville',
  auditoriums: ['aud-1'],
};

const auditorium = {
  id: 'aud-1',
  theatreId: 'test-theatre',
  name: 'Auditorium 1',
  rows: [
    { label: 'A', seats: [1, 2, 3] },
    { label: 'B', seats: [1, 2, 3] },
  ],
};

function raw(patch: Partial<RawData> = {}): RawData {
  return {
    theatreIndex: ['test-theatre'],
    theatres: { 'data/theatres/test-theatre/theatre.json': theatre },
    auditoriums: { 'data/theatres/test-theatre/auditoriums/aud-1.json': auditorium },
    movies: [],
    ...patch,
  };
}

describe('buildCatalog', () => {
  it('loads a valid data set without issues', () => {
    const catalog = buildCatalog(raw());
    expect(catalog.issues).toEqual([]);
    expect(catalog.theatres).toHaveLength(1);
    const entry = catalog.theatres[0].auditoriums[0];
    expect(entry.ok).toBe(true);
    if (entry.ok) {
      expect(entry.auditorium.seatCount).toBe(6);
      expect(entry.auditorium.rowSpacing_m).toBeGreaterThan(0);
    }
  });

  it('reports a broken index and shows no theatres', () => {
    const catalog = buildCatalog(raw({ theatreIndex: { nope: true } }));
    expect(catalog.theatres).toEqual([]);
    expect(catalog.issues[0].file).toBe('data/theatres.json');
  });

  it('reports a theatre that is listed but has no file', () => {
    const catalog = buildCatalog(raw({ theatres: {} }));
    expect(catalog.theatres).toEqual([]);
    expect(catalog.issues).toEqual([
      {
        file: 'data/theatres/test-theatre/theatre.json',
        messages: ['the file is missing, but "test-theatre" is listed in data/theatres.json'],
      },
    ]);
  });

  it('reports an invalid theatre file and keeps the others', () => {
    const catalog = buildCatalog(
      raw({
        theatreIndex: ['test-theatre', 'other'],
        theatres: {
          'data/theatres/test-theatre/theatre.json': { ...theatre, area: undefined },
          'data/theatres/other/theatre.json': { ...theatre, id: 'other', auditoriums: [] },
        },
      }),
    );
    expect(catalog.theatres.map((t) => t.id)).toEqual(['other']);
    expect(catalog.issues).toHaveLength(1);
    expect(catalog.issues[0].messages[0]).toContain('area');
  });

  it('reports a theatre whose id does not match its folder', () => {
    const catalog = buildCatalog(
      raw({ theatres: { 'data/theatres/test-theatre/theatre.json': { ...theatre, id: 'wrong' } } }),
    );
    expect(catalog.theatres).toEqual([]);
    expect(catalog.issues[0].messages[0]).toContain('"wrong"');
  });

  it('turns an invalid auditorium into a readable issue instead of throwing', () => {
    const broken = { ...auditorium, rows: [{ label: 'A', seats: [1, 1] }] };
    const catalog = buildCatalog(
      raw({ auditoriums: { 'data/theatres/test-theatre/auditoriums/aud-1.json': broken } }),
    );
    const entry = catalog.theatres[0].auditoriums[0];
    expect(entry.ok).toBe(false);
    if (!entry.ok) {
      expect(entry.issue.file).toBe('data/theatres/test-theatre/auditoriums/aud-1.json');
      expect(entry.issue.messages).toEqual(['rows[0].seats[1]: seat 1 appears twice in row A']);
    }
  });

  it('reports an auditorium that is listed but missing', () => {
    const catalog = buildCatalog(raw({ auditoriums: {} }));
    const entry = catalog.theatres[0].auditoriums[0];
    expect(entry.ok).toBe(false);
    if (!entry.ok) expect(entry.issue.messages[0]).toContain('missing');
  });

  it('reports an auditorium whose ids do not match its path', () => {
    const catalog = buildCatalog(
      raw({
        auditoriums: {
          'data/theatres/test-theatre/auditoriums/aud-1.json': {
            ...auditorium,
            id: 'aud-2',
            theatreId: 'elsewhere',
          },
        },
      }),
    );
    const entry = catalog.theatres[0].auditoriums[0];
    expect(entry.ok).toBe(false);
    if (!entry.ok) expect(entry.issue.messages).toHaveLength(2);
  });

  it('shows auditorium files that were not added to theatre.json, after the listed ones', () => {
    const catalog = buildCatalog(
      raw({
        auditoriums: {
          'data/theatres/test-theatre/auditoriums/aud-1.json': auditorium,
          'data/theatres/test-theatre/auditoriums/aud-0.json': { ...auditorium, id: 'aud-0' },
          'data/theatres/elsewhere/auditoriums/aud-9.json': auditorium,
        },
      }),
    );
    expect(catalog.theatres[0].auditoriums.map((a) => a.id)).toEqual(['aud-1', 'aud-0']);
  });

  it('keeps working with an invalid trailer list', () => {
    const catalog = buildCatalog(raw({ movies: [{ title: 'No id' }] }));
    expect(catalog.movies).toEqual([]);
    expect(catalog.issues[0].file).toBe('data/movies.json');
    expect(catalog.theatres).toHaveLength(1);
  });

  it('finds theatres and auditoriums by id', () => {
    const catalog = buildCatalog(raw());
    const found = findTheatre(catalog, 'test-theatre');
    expect(found?.name).toBe('Test Theatre');
    expect(findTheatre(catalog, 'nope')).toBeUndefined();
    expect(findAuditorium(found!, 'aud-1')?.ok).toBe(true);
    expect(findAuditorium(found!, 'nope')).toBeUndefined();
  });
});
