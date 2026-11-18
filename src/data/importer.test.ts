import { describe, expect, it } from 'vitest';
import { formatAuditoriumJson } from './format';
import { auditoriumFromCompact } from './importer';
import { auditoriumSchema } from './schema';

const base = { id: 'riverport-07', theatreId: 'silvercity-riverport', name: 'Auditorium 7' };

describe('auditoriumFromCompact', () => {
  it('builds a valid auditorium with defaults for everything not measured', () => {
    const result = auditoriumFromCompact('A: 1-4 | 5-10 | 11-14\nB: 1-4 | 5-12 | 13-16', base);
    expect(result.errors).toEqual([]);
    expect(result.issues).toEqual([]);
    const json = result.auditorium!;
    expect(json.type).toBe('standard');
    expect(json.entrance).toBe('front-left');
    expect(json.verified).toBe(false);
    expect(json.screen).toBeUndefined();
    expect(json.rowSpacing_m).toBeUndefined();
    expect(json.rows.map((row) => row.label)).toEqual(['A', 'B']);
    expect(auditoriumSchema.safeParse(json).success).toBe(true);
  });

  it('writes only the dimensions that were given, rounded', () => {
    const json = auditoriumFromCompact('A: 1-10', {
      ...base,
      type: 'vip',
      entrance: 'back-right',
      dimensions: { screenWidth_m: 12.3456, rowSpacing_m: 1.4999 },
      verified: true,
      source: '  seatmap screenshot 2026-11-18 ',
      notes: '',
    }).auditorium!;
    expect(json.screen).toEqual({ width_m: 12.35, aspect: undefined, bottomHeight_m: undefined });
    expect(json.rowSpacing_m).toBe(1.5);
    expect(json.seatWidth_m).toBeUndefined();
    expect(json.type).toBe('vip');
    expect(json.entrance).toBe('back-right');
    expect(json.verified).toBe(true);
    expect(json.source).toBe('seatmap screenshot 2026-11-18');
    expect(json.notes).toBeUndefined();
    const text = formatAuditoriumJson(json);
    expect(JSON.parse(text).screen).toEqual({ width_m: 12.35 });
    expect(text).not.toContain('aspect');
  });

  it('passes the parser options through', () => {
    const json = auditoriumFromCompact('A: 1-2 | 3-4', { ...base, aisleCells: 1 }).auditorium!;
    expect(json.rows[0].seats).toEqual([1, 2, null, 3, 4]);
  });

  it('returns the seat-map errors and no file', () => {
    const result = auditoriumFromCompact('A: 1-4\nB 1-4', base);
    expect(result.auditorium).toBeNull();
    expect(result.errors).toEqual([{ line: 2, code: 'missingColon', params: {} }]);
  });

  it('returns no file for empty text', () => {
    expect(auditoriumFromCompact('  \n# nothing yet\n', base).auditorium).toBeNull();
  });

  it('reports schema problems with the other fields', () => {
    const result = auditoriumFromCompact('A: 1-4', { ...base, id: 'Bad Id', name: ' ' });
    expect(result.auditorium).not.toBeNull();
    expect(result.issues.some((line) => line.startsWith('id:'))).toBe(true);
    expect(result.issues.some((line) => line.startsWith('name:'))).toBe(true);
  });
});
