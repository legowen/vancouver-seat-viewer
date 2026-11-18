import { describe, expect, it } from 'vitest';
import { MAX_SEATS_PER_ROW, parseCompactSeatMap, toCompactText } from './compact';
import { auditoriumSchema } from './schema';

const _ = null;

function seatsOf(text: string, options = {}) {
  const result = parseCompactSeatMap(text, options);
  expect(result.errors).toEqual([]);
  return result.rows.map((row) => row.seats);
}

describe('parseCompactSeatMap', () => {
  it('parses the example from the spec and lines the aisles up', () => {
    const result = parseCompactSeatMap('A: 1-4 | 5-10 | 11-14\nB: 1-4 | 5-12 | 13-16', {
      aisleCells: 1,
    });
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      // The six-seat middle block is centred inside the eight-seat column of row B.
      { label: 'A', seats: [1, 2, 3, 4, _, _, 5, 6, 7, 8, 9, 10, _, _, 11, 12, 13, 14] },
      { label: 'B', seats: [1, 2, 3, 4, _, 5, 6, 7, 8, 9, 10, 11, 12, _, 13, 14, 15, 16] },
    ]);
  });

  it('makes an aisle two seats wide by default', () => {
    expect(seatsOf('A: 1-2 | 3-4')).toEqual([[1, 2, _, _, 3, 4]]);
  });

  it('pushes the outer blocks against their aisles', () => {
    expect(seatsOf('A: 1-2 | 3-6 | 7\nB: 1-4 | 5-8 | 9-11', { aisleCells: 1 })).toEqual([
      [_, _, 1, 2, _, 3, 4, 5, 6, _, 7, _, _],
      [1, 2, 3, 4, _, 5, 6, 7, 8, _, 9, 10, 11],
    ]);
  });

  it('expands descending ranges, single seats and comma-separated lists', () => {
    expect(seatsOf('A: 14-11, 7 5 3-1')).toEqual([[14, 13, 12, 11, 7, 5, 3, 2, 1]]);
  });

  it('accepts spaces and other dashes inside a range', () => {
    expect(seatsOf('A: 1 - 3 | 4–6 | 7~8', { aisleCells: 1 })).toEqual([
      [1, 2, 3, _, 4, 5, 6, _, 7, 8],
    ]);
  });

  it('accepts full-width punctuation and digits from CJK keyboards', () => {
    const result = parseCompactSeatMap('Ａ： １－２ ｜ ３－４ ＿ ６', { aisleCells: 1 });
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ label: 'A', seats: [1, 2, _, 3, 4, _, 6] }]);
  });

  it('treats _ as one missing seat', () => {
    expect(seatsOf('C: 1-2 _ _ 5-6 __ 9')).toEqual([[1, 2, _, _, 5, 6, _, _, 9]]);
  });

  it('ignores comments, blank lines and decorative edge bars', () => {
    const text = ['# Auditorium 7', '', 'A: | 1-2 | 3-4 |   # front row', '   ', 'B: 1-2 | 3-4'];
    expect(seatsOf(text.join('\n'), { aisleCells: 1 })).toEqual([
      [1, 2, _, 3, 4],
      [1, 2, _, 3, 4],
    ]);
  });

  it('keeps row labels as typed', () => {
    const result = parseCompactSeatMap('AA: 1-2\n12: 1-2\nb: 1-2');
    expect(result.rows.map((row) => row.label)).toEqual(['AA', '12', 'b']);
  });

  it('leaves rows with an unusual number of blocks alone (the layout centres them)', () => {
    expect(seatsOf('A: 1-2 | 3-6 | 7-8\nB: 1-2 | 3-6 | 7-8\nC: 1-10', { aisleCells: 1 })).toEqual([
      [1, 2, _, 3, 4, 5, 6, _, 7, 8],
      [1, 2, _, 3, 4, 5, 6, _, 7, 8],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    ]);
  });

  it('does not pad when alignment is off', () => {
    expect(seatsOf('A: 1-2 | 3-4\nB: 1-3 | 4-8', { align: false, aisleCells: 1 })).toEqual([
      [1, 2, _, 3, 4],
      [1, 2, 3, _, 4, 5, 6, 7, 8],
    ]);
  });

  it('produces rows the auditorium schema accepts', () => {
    const { rows } = parseCompactSeatMap('A: 1-4 | 5-10 | 11-14\nB: 1-4 | 5-12 | 13-16');
    const parsed = auditoriumSchema.safeParse({ id: 'a', theatreId: 't', name: 'A', rows });
    expect(parsed.success).toBe(true);
  });

  it('returns no rows and no errors for empty input', () => {
    expect(parseCompactSeatMap('')).toEqual({ rows: [], errors: [] });
    expect(parseCompactSeatMap('\n# nothing\n')).toEqual({ rows: [], errors: [] });
  });

  describe('errors', () => {
    const errorsOf = (text: string) => parseCompactSeatMap(text).errors;

    it('reports a missing colon with the 1-based line number', () => {
      expect(errorsOf('A: 1-4\n\n# note\nB 1-4')).toEqual([
        { line: 4, code: 'missingColon', params: {} },
      ]);
    });

    it('reports a bad row label', () => {
      expect(errorsOf(': 1-4')[0].code).toBe('badLabel');
      expect(errorsOf('ABCDE: 1-4')[0].code).toBe('badLabel');
      expect(errorsOf('A B: 1-4')[0].code).toBe('badLabel');
    });

    it('reports a token it cannot read', () => {
      expect(errorsOf('A: 1-4 x 5')).toEqual([
        { line: 1, code: 'badToken', params: { token: 'x' } },
      ]);
      expect(errorsOf('A: 0')[0].code).toBe('badToken');
      expect(errorsOf('A: 1-')[0].code).toBe('badToken');
    });

    it('reports an out-of-range range', () => {
      expect(errorsOf('A: 0-4')).toEqual([{ line: 1, code: 'badRange', params: { token: '0-4' } }]);
      expect(errorsOf('A: 5-1000')[0].code).toBe('badRange');
    });

    it('reports a seat that appears twice', () => {
      expect(errorsOf('A: 1-4 | 4-8')).toEqual([
        { line: 1, code: 'duplicateSeat', params: { seat: 4 } },
      ]);
    });

    it('reports a row label that appears twice', () => {
      expect(errorsOf('A: 1-4\nA: 1-4')).toEqual([
        { line: 2, code: 'duplicateRow', params: { row: 'A' } },
      ]);
    });

    it('reports a row without seats', () => {
      expect(errorsOf('A:')[0].code).toBe('emptyRow');
      expect(errorsOf('A: _ _ |')[0].code).toBe('emptyRow');
    });

    it('reports a row that is too long', () => {
      expect(errorsOf(`A: 1-${MAX_SEATS_PER_ROW + 1}`)).toEqual([
        { line: 1, code: 'tooManySeats', params: { max: MAX_SEATS_PER_ROW } },
      ]);
      expect(errorsOf('A: 1-60 | 61-90')[0].code).toBe('tooManySeats');
    });

    it('reports a row that only becomes too wide once the aisles are lined up', () => {
      const result = parseCompactSeatMap('A: 1-60 | 61\nB: 1 | 2-61');
      expect(result.errors).toEqual([
        { line: 1, code: 'tooWide', params: { max: 120 } },
        { line: 2, code: 'tooWide', params: { max: 120 } },
      ]);
      expect(parseCompactSeatMap('A: 1-60 | 61\nB: 1 | 2-61', { align: false }).errors).toEqual(
        [],
      );
    });

    it('reports too many rows', () => {
      const text = Array.from({ length: 61 }, (_unused, i) => `R${i}: 1-2`).join('\n');
      const result = parseCompactSeatMap(text);
      expect(result.rows).toHaveLength(60);
      expect(result.errors).toEqual([{ line: 61, code: 'tooManyRows', params: { max: 60 } }]);
    });

    it('still returns the rows that were fine', () => {
      const result = parseCompactSeatMap('A: 1-4\nB: oops\nC: 1-4');
      expect(result.rows.map((row) => row.label)).toEqual(['A', 'C']);
      expect(result.errors).toHaveLength(1);
    });
  });
});

describe('toCompactText', () => {
  it('writes runs as ranges and gaps as _', () => {
    const rows = [
      { label: 'A', seats: [_, 1, 2, 3, _, _, 4, 6, 7, _] },
      { label: 'B', seats: [9, 8, 7, 1] },
    ];
    expect(toCompactText(rows)).toBe('A: _ 1-3 _ _ 4 6-7 _\nB: 9-7 1');
  });

  it('round-trips through the parser when alignment is off', () => {
    const { rows } = parseCompactSeatMap('A: 1-4 | 5-10 | 11-14\nB: 1-4 | 5-12 | 13-16\nC: 20-1');
    const again = parseCompactSeatMap(toCompactText(rows), { align: false });
    expect(again.errors).toEqual([]);
    expect(again.rows).toEqual(rows);
  });
});
