import type { Auditorium } from '../data/schema';

/** Field order in written files: identity first, then dimensions, rows, and notes. */
const KEY_ORDER = [
  'id',
  'theatreId',
  'name',
  'names',
  'type',
  'screen',
  'firstRowDistance_m',
  'rowSpacing_m',
  'rowRise_m',
  'seatWidth_m',
  'eyeHeight_m',
  'rowAlign',
  'entrance',
  'rows',
  'verified',
  'placeholder',
  'source',
  'notes',
] as const satisfies readonly (keyof Auditorium)[];

/** Indents every line after the first, for nested values inside the top-level object. */
const indentNested = (json: string): string => json.replace(/\n/g, '\n  ');

/**
 * Formats an auditorium the way the files in data/ are written: two-space JSON with each
 * row of seats on a single line, so a file reads like the seat map and diffs stay small.
 */
export function formatAuditoriumJson(auditorium: Auditorium): string {
  const record = auditorium as Record<string, unknown>;
  const keys = [
    ...KEY_ORDER,
    ...Object.keys(record).filter((key) => !(KEY_ORDER as readonly string[]).includes(key)),
  ].filter((key) => record[key] !== undefined);

  const fields = keys.map((key) => {
    if (key === 'rows') {
      const rows = auditorium.rows.map((row) => {
        const seats = row.seats.map((seat) => (seat === null ? 'null' : String(seat))).join(', ');
        return `    { "label": ${JSON.stringify(row.label)}, "seats": [${seats}] }`;
      });
      return `  "rows": [\n${rows.join(',\n')}\n  ]`;
    }
    return `  ${JSON.stringify(key)}: ${indentNested(JSON.stringify(record[key], null, 2))}`;
  });
  return `{\n${fields.join(',\n')}\n}\n`;
}
