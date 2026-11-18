import { describe, expect, it } from 'vitest';
import {
  auditoriumSchema,
  formatIssuePath,
  formatIssues,
  movieCandidatesSchema,
  moviesSchema,
  theatreIndexSchema,
  theatreSchema,
} from './schema';

const minimal = {
  id: 'riverport-07',
  theatreId: 'silvercity-riverport',
  name: 'Auditorium 7',
  rows: [{ label: 'A', seats: [1, 2, null, 3, 4] }],
};

function issuesOf(input: unknown): string[] {
  const result = auditoriumSchema.safeParse(input);
  return result.success ? [] : formatIssues(result.error);
}

describe('auditoriumSchema', () => {
  it('accepts the example from the spec', () => {
    const parsed = auditoriumSchema.parse({
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
      source: 'seatmap screenshot 2026-11-17',
      notes: '',
    });
    expect(parsed.screen?.width_m).toBe(14);
    expect(parsed.rows[0].seats).toHaveLength(14);
  });

  it('makes every dimension optional and fills in the non-dimension defaults', () => {
    const parsed = auditoriumSchema.parse(minimal);
    expect(parsed.type).toBe('standard');
    expect(parsed.entrance).toBe('front-left');
    expect(parsed.verified).toBe(false);
    expect(parsed.screen).toBeUndefined();
    expect(parsed.rowSpacing_m).toBeUndefined();
  });

  it('accepts a partly specified screen', () => {
    expect(auditoriumSchema.parse({ ...minimal, screen: { width_m: 12 } }).screen).toEqual({
      width_m: 12,
    });
  });

  it('rejects a seat number used twice in a row and says where', () => {
    const issues = issuesOf({ ...minimal, rows: [{ label: 'C', seats: [1, 2, 2] }] });
    expect(issues).toEqual(['rows[0].seats[2]: seat 2 appears twice in row C']);
  });

  it('rejects a row label used twice', () => {
    const issues = issuesOf({
      ...minimal,
      rows: [
        { label: 'A', seats: [1] },
        { label: 'A', seats: [1] },
      ],
    });
    expect(issues).toEqual(['rows[1].label: row label "A" is used twice']);
  });

  it('rejects a row with only gaps', () => {
    expect(issuesOf({ ...minimal, rows: [{ label: 'A', seats: [null, null] }] })).toEqual([
      'rows[0].seats: a row needs at least one seat',
    ]);
  });

  it('rejects unknown keys, so typos do not pass silently', () => {
    const issues = issuesOf({ ...minimal, rowSpacing: 1.0 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('rowSpacing');
  });

  it.each([
    ['an uppercase id', { id: 'Riverport-07' }],
    ['an unknown type', { type: 'imax' }],
    ['an unknown entrance', { entrance: 'side' }],
    ['a non-integer seat', { rows: [{ label: 'A', seats: [1.5] }] }],
    ['a zero seat number', { rows: [{ label: 'A', seats: [0] }] }],
    ['a text seat', { rows: [{ label: 'A', seats: ['1'] }] }],
    ['no rows', { rows: [] }],
    ['a five-character row label', { rows: [{ label: 'ABCDE', seats: [1] }] }],
    ['a negative row spacing', { rowSpacing_m: -1 }],
    ['an absurd screen width', { screen: { width_m: 300 } }],
    ['an empty name', { name: '  ' }],
  ])('rejects %s', (_label, patch) => {
    expect(auditoriumSchema.safeParse({ ...minimal, ...patch }).success).toBe(false);
  });
});

describe('theatre schemas', () => {
  it('accepts a theatre with optional localized names', () => {
    const theatre = theatreSchema.parse({
      id: 'silvercity-riverport',
      name: 'SilverCity Riverport',
      area: 'Richmond',
      localizedNames: { ko: '실버시티 리버포트' },
      auditoriums: ['riverport-07'],
    });
    expect(theatre.localizedNames?.ko).toBe('실버시티 리버포트');
  });

  it('rejects a theatre without an area', () => {
    expect(theatreSchema.safeParse({ id: 'x', name: 'X', auditoriums: [] }).success).toBe(false);
  });

  it('rejects an index with a duplicate or no entries', () => {
    expect(theatreIndexSchema.safeParse(['a', 'b', 'a']).success).toBe(false);
    expect(theatreIndexSchema.safeParse([]).success).toBe(false);
    expect(theatreIndexSchema.safeParse(['a', 'b']).success).toBe(true);
  });
});

describe('movie schemas', () => {
  const movie = {
    id: 'some-movie',
    title: 'Some Movie',
    youtubeId: 'dQw4w9WgXcQ',
    channel: 'Some Studio',
    verifiedOn: '2026-11-17',
  };

  it('accepts an empty list and a complete entry', () => {
    expect(moviesSchema.parse([])).toEqual([]);
    expect(moviesSchema.parse([movie])).toHaveLength(1);
  });

  it.each([
    ['a short id', { youtubeId: 'abc' }],
    ['an id with a bad character', { youtubeId: 'dQw4w9WgXc!' }],
    ['a loose date', { verifiedOn: '17/11/2026' }],
    ['a missing channel', { channel: '' }],
    ['an extra key', { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }],
  ])('rejects %s', (_label, patch) => {
    expect(moviesSchema.safeParse([{ ...movie, ...patch }]).success).toBe(false);
  });

  it('validates candidates waiting for verification', () => {
    const candidate = {
      id: 'some-movie',
      title: 'Some Movie',
      youtubeId: 'dQw4w9WgXcQ',
      expectedChannel: 'Some Studio',
      foundAt: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    };
    expect(movieCandidatesSchema.parse([candidate])).toHaveLength(1);
    expect(movieCandidatesSchema.safeParse([{ ...candidate, youtubeId: 'nope' }]).success).toBe(
      false,
    );
  });
});

describe('formatIssuePath', () => {
  it('writes array indexes in brackets', () => {
    expect(formatIssuePath(['rows', 2, 'seats', 5])).toBe('rows[2].seats[5]');
    expect(formatIssuePath([0])).toBe('[0]');
    expect(formatIssuePath([])).toBe('');
  });
});
