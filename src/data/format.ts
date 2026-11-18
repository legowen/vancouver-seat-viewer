/**
 * Writes an auditorium as JSON the way the files in `data/` are kept: keys in a fixed order and
 * one seat row per line, so a seat map stays readable and diffs stay small.
 */
import type { AuditoriumInput } from './schema';

const KEY_ORDER: (keyof AuditoriumInput)[] = [
  'id',
  'theatreId',
  'name',
  'type',
  'placeholder',
  'screen',
  'firstRowDistance_m',
  'rowSpacing_m',
  'rowRise_m',
  'seatWidth_m',
  'eyeHeight_m',
  'rows',
  'entrance',
  'verified',
  'source',
  'notes',
];

function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')} }`;
  }
  return JSON.stringify(value);
}

export function formatAuditoriumJson(auditorium: AuditoriumInput): string {
  const lines: string[] = [];
  for (const key of KEY_ORDER) {
    const value = auditorium[key];
    if (value === undefined) continue;
    if (key === 'screen' && Object.values(value as object).every((v) => v === undefined)) continue;
    if (key === 'rows') {
      const rows = auditorium.rows.map((row) => `    ${inline(row)}`).join(',\n');
      lines.push(`  "rows": [\n${rows}\n  ]`);
    } else {
      lines.push(`  ${JSON.stringify(key)}: ${inline(value)}`);
    }
  }
  return `{\n${lines.join(',\n')}\n}\n`;
}
