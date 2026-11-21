import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AuditoriumSchema, type Auditorium } from '../src/data/schema';
import { formatCompact, parseCompact } from '../src/editor/compact';
import { formatAuditoriumJson } from '../src/editor/json';

const range = (from: number, to: number) =>
  Array.from({ length: Math.abs(to - from) + 1 }, (_, index) =>
    from <= to ? from + index : from - index,
  );

const AISLE = [null, null];

describe('parseCompact', () => {
  it('reads the example from the brief, with aisles two seats wide', () => {
    const { rows, errors } = parseCompact('A: 1-4 | 5-10 | 11-14\nB: 1-4 | 5-12 | 13-16');
    expect(errors).toEqual([]);
    // Row A's middle block (6 seats) is centred against row B's (8), so the aisles line up.
    expect(rows).toEqual([
      {
        label: 'A',
        seats: [...range(1, 4), ...AISLE, null, ...range(5, 10), null, ...AISLE, ...range(11, 14)],
      },
      {
        label: 'B',
        seats: [...range(1, 4), ...AISLE, ...range(5, 12), ...AISLE, ...range(13, 16)],
      },
    ]);
  });

  it('turns "_" into a single missing seat and ignores a "|" at either end of a row', () => {
    expect(parseCompact('A: | _ 1 2 _ 3 |').rows[0]!.seats).toEqual([null, 1, 2, null, 3]);
  });

  it('does not need spaces around aisles and accepts commas', () => {
    expect(parseCompact('A: 1-3|4,5').rows[0]!.seats).toEqual([1, 2, 3, ...AISLE, 4, 5]);
  });

  it('counts down for seats numbered right to left', () => {
    expect(parseCompact('A: 14-11 | 3-1').rows[0]!.seats).toEqual([
      14,
      13,
      12,
      11,
      ...AISLE,
      3,
      2,
      1,
    ]);
  });

  it('makes aisles as wide as asked, and wider for "| |"', () => {
    expect(parseCompact('A: 1-2 | 3-4', { aisleWidth: 1 }).rows[0]!.seats).toEqual([
      1,
      2,
      null,
      3,
      4,
    ]);
    expect(parseCompact('A: 1-2 | 3-4', { aisleWidth: 3 }).rows[0]!.seats).toEqual([
      1,
      2,
      null,
      null,
      null,
      3,
      4,
    ]);
    expect(parseCompact('A: 1-2 | | 3-4').rows[0]!.seats).toEqual([1, 2, ...AISLE, ...AISLE, 3, 4]);
  });

  it('lines the aisles up: outer blocks hug the aisle, middle blocks are centred', () => {
    const { rows } = parseCompact('A: 1-3 | 4-13 | 14-16\nB: 1-4 | 5-14 | 15-18');
    expect(rows[0]!.seats).toEqual([
      null,
      ...range(1, 3),
      ...AISLE,
      ...range(4, 13),
      ...AISLE,
      ...range(14, 16),
      null,
    ]);
    expect(rows[0]!.seats).toHaveLength(rows[1]!.seats.length);
  });

  it('leaves rows with a different number of blocks alone', () => {
    const { rows } = parseCompact('A: 1-4 | 5-14 | 15-18\nB: 1-4 | 5-14 | 15-18\nL: 1-20');
    expect(rows[2]!.seats).toEqual(range(1, 20));
  });

  it('can skip lining the aisles up', () => {
    const { rows } = parseCompact('A: 1-3 | 4-13 | 14-16\nB: 1-4 | 5-14 | 15-18', {
      align: false,
    });
    expect(rows[0]!.seats).toEqual([
      ...range(1, 3),
      ...AISLE,
      ...range(4, 13),
      ...AISLE,
      14,
      15,
      16,
    ]);
  });

  it('reads full-width characters typed on Korean and Chinese keyboards', () => {
    const { rows, errors } = parseCompact('Ａ：１－４｜５－８\nＢ：１，２，＿，３');
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { label: 'A', seats: [...range(1, 4), ...AISLE, ...range(5, 8)] },
      { label: 'B', seats: [1, 2, null, 3] },
    ]);
  });

  it('ignores comments at the end of a line', () => {
    expect(parseCompact('A: 1-4 # front row').rows).toEqual([{ label: 'A', seats: range(1, 4) }]);
  });

  it('ignores blank lines, comments and extra spaces', () => {
    const { rows, errors } = parseCompact('# screen is at the top\n\n  AA :  1-2  \n\n# done\n');
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ label: 'AA', seats: [1, 2] }]);
  });

  it('reports a missing colon with its line number', () => {
    expect(parseCompact('A: 1-4\nB 1-4').errors).toEqual([{ line: 2, code: 'missingColon' }]);
  });

  it('reports labels that are not 1 to 3 letters or digits', () => {
    expect(parseCompact('ROWA: 1-4').errors).toEqual([
      { line: 1, code: 'badLabel', label: 'ROWA' },
    ]);
  });

  it.each(['1-x', '0', '3-', 'seat', '1--4'])(
    'reports "%s" as something it cannot read',
    (token) => {
      expect(parseCompact(`A: ${token}`).errors).toEqual([{ line: 1, code: 'badToken', token }]);
    },
  );

  it('reports a row label used twice', () => {
    expect(parseCompact('A: 1-4\nA: 1-4').errors).toEqual([
      { line: 2, code: 'duplicateLabel', label: 'A' },
    ]);
  });

  it('reports a seat number used twice in a row', () => {
    expect(parseCompact('A: 1-4 | 4-6').errors).toEqual([
      { line: 1, code: 'duplicateSeat', label: 'A', seat: 4 },
    ]);
  });

  it('reports rows with no seats and rows that are far too long', () => {
    expect(parseCompact('A: | _').errors).toEqual([{ line: 1, code: 'noSeats', label: 'A' }]);
    expect(parseCompact('A: 1-200').errors).toEqual([
      { line: 1, code: 'tooManySeats', label: 'A' },
    ]);
  });

  it('keeps the rows it could read when another line is wrong', () => {
    const { rows, errors } = parseCompact('A: 1-4\nB: oops\nC: 1-2');
    expect(rows.map((row) => row.label)).toEqual(['A', 'C']);
    expect(errors).toHaveLength(1);
  });

  it('reports an empty map', () => {
    expect(parseCompact('  \n# nothing\n').errors).toEqual([{ line: 0, code: 'empty' }]);
  });
});

describe('formatCompact', () => {
  it('writes ranges, and every gap as "_" so nothing is padded or widened on the way back', () => {
    expect(
      formatCompact([
        { label: 'A', seats: [null, 1, 2, 3, null, null, 4, null, 9, 8, 7] },
        { label: 'B', seats: [5] },
      ]),
    ).toBe('A: _ 1-3 _ _ 4 _ 9-7\nB: 5');
  });

  it('round-trips every auditorium in data/', () => {
    const root = fileURLToPath(new URL('../data/theatres', import.meta.url));
    for (const theatre of readdirSync(root)) {
      const folder = join(root, theatre, 'auditoriums');
      for (const file of readdirSync(folder)) {
        const auditorium = JSON.parse(readFileSync(join(folder, file), 'utf8')) as Auditorium;
        const parsed = parseCompact(formatCompact(auditorium.rows));
        expect(parsed.errors).toEqual([]);
        expect(parsed.rows).toEqual(auditorium.rows);
      }
    }
  });
});

describe('formatAuditoriumJson', () => {
  const auditorium: Auditorium = {
    id: 'riverport-07',
    theatreId: 'silvercity-riverport',
    name: 'Auditorium 7',
    type: 'standard',
    screen: { width_m: 14, aspect: 2.39 },
    rowSpacing_m: 1.05,
    rows: [
      { label: 'A', seats: [1, 2, null, 3] },
      { label: 'B', seats: [1, 2, 3, 4] },
    ],
    entrance: 'front-left',
    verified: false,
    source: 'seat map screenshot 2026-11-19',
    notes: '',
  };

  it('produces JSON that reads back to the same auditorium and passes the schema', () => {
    const text = formatAuditoriumJson(auditorium);
    expect(JSON.parse(text)).toEqual(auditorium);
    expect(AuditoriumSchema.safeParse(JSON.parse(text)).success).toBe(true);
  });

  it('keeps each row on one line so files stay easy to read and diff', () => {
    const lines = formatAuditoriumJson(auditorium).split('\n');
    expect(lines).toContain('    { "label": "A", "seats": [1, 2, null, 3] },');
    expect(lines).toContain('    { "label": "B", "seats": [1, 2, 3, 4] }');
  });

  it('puts the identifying fields first', () => {
    const keys = Object.keys(JSON.parse(formatAuditoriumJson({ ...auditorium })));
    expect(keys.slice(0, 4)).toEqual(['id', 'theatreId', 'name', 'type']);
  });
});
