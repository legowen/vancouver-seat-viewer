import { describe, expect, it } from 'vitest';
import { AuditoriumSchema } from '../src/data/schema';
import { importCompact } from '../src/editor/import';

const meta = {
  id: 'riverport-07',
  theatreId: 'silvercity-riverport',
  name: 'Auditorium 7',
  type: 'standard' as const,
};

describe('importCompact', () => {
  it('turns compact rows into an auditorium that passes the schema', () => {
    const result = importCompact('A: 1-4 | 5-12 | 13-16\nB: 1-4 | 5-12 | 13-16', {
      ...meta,
      entrance: 'back-right',
      source: 'seat map screenshot 2026-11-20',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(AuditoriumSchema.safeParse(result.auditorium).success).toBe(true);
    expect(result.auditorium).toMatchObject({
      id: 'riverport-07',
      entrance: 'back-right',
      verified: false,
      source: 'seat map screenshot 2026-11-20',
    });
    expect(result.auditorium.rows.map((row) => row.label)).toEqual(['A', 'B']);
  });

  it('passes the aisle options on to the parser', () => {
    const result = importCompact('A: 1-2 | 3-4', meta, { aisleWidth: 1 });
    expect(result.ok && result.auditorium.rows[0]!.seats).toEqual([1, 2, null, 3, 4]);
  });

  it('explains problems in the seat text with line numbers', () => {
    const result = importCompact('A: 1-4\nB 1-4', meta);
    expect(result).toEqual({
      ok: false,
      problems: ['Line 2: put a colon after the row label, like "A: 1-10".'],
    });
  });

  it('explains problems with the other fields', () => {
    const result = importCompact('A: 1-4', { ...meta, id: 'Not An Id' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.join('\n')).toMatch(/^id: /m);
  });
});
