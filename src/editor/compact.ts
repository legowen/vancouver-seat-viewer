/**
 * A quick way to type a seat map, one row per line, from the screen to the back:
 *
 *   A: 1-4 | 5-10 | 11-14
 *   B: _ 1-3 | 4-12 | 13-15 _
 *
 * "1-4" is seats 1 to 4 ("14-11" counts down for rows numbered right to left), "|" is an
 * aisle and "_" a single missing seat; both take up one seat's width. Commas or spaces
 * separate seats, blank lines are skipped and lines starting with "#" are comments.
 */

export interface CompactRow {
  label: string;
  seats: (number | null)[];
}

export type CompactErrorCode =
  | 'empty'
  | 'missingColon'
  | 'badLabel'
  | 'badToken'
  | 'duplicateLabel'
  | 'duplicateSeat'
  | 'noSeats'
  | 'tooManySeats';

/** A problem on one line (line 0 means the whole text). Codes map to i18n keys in the editor. */
export interface CompactError {
  line: number;
  code: CompactErrorCode;
  label?: string;
  token?: string;
  seat?: number;
}

/** Matches the schema: at most 80 slots per row, seat numbers 1–999. */
const MAX_SLOTS = 80;
const LABEL = /^[A-Za-z0-9]{1,3}$/;
const SINGLE = /^\d{1,3}$/;
const RANGE = /^(\d{1,3})-(\d{1,3})$/;
const TOKEN = /\||_|[^\s,|_]+/g;

export function parseCompact(text: string): { rows: CompactRow[]; errors: CompactError[] } {
  const rows: CompactRow[] = [];
  const errors: CompactError[] = [];
  const labels = new Set<string>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const content = raw.trim();
    if (content === '' || content.startsWith('#')) return;

    const colon = content.indexOf(':');
    if (colon === -1) {
      errors.push({ line, code: 'missingColon' });
      return;
    }
    const label = content.slice(0, colon).trim();
    if (!LABEL.test(label)) {
      errors.push({ line, code: 'badLabel', label });
      return;
    }

    const seats: (number | null)[] = [];
    for (const token of content.slice(colon + 1).match(TOKEN) ?? []) {
      if (token === '|' || token === '_') {
        seats.push(null);
        continue;
      }
      const range = RANGE.exec(token);
      if (range) {
        const from = Number(range[1]);
        const to = Number(range[2]);
        if (from < 1 || to < 1) {
          errors.push({ line, code: 'badToken', token });
          return;
        }
        if (seats.length + Math.abs(to - from) + 1 > MAX_SLOTS) {
          errors.push({ line, code: 'tooManySeats', label });
          return;
        }
        const step = from <= to ? 1 : -1;
        for (let seat = from; seat !== to + step; seat += step) seats.push(seat);
        continue;
      }
      if (SINGLE.test(token) && Number(token) >= 1) {
        seats.push(Number(token));
        continue;
      }
      errors.push({ line, code: 'badToken', token });
      return;
    }

    if (seats.length > MAX_SLOTS) {
      errors.push({ line, code: 'tooManySeats', label });
      return;
    }
    const numbers = seats.filter((seat) => seat !== null);
    if (numbers.length === 0) {
      errors.push({ line, code: 'noSeats', label });
      return;
    }
    const repeated = numbers.find((seat, position) => numbers.indexOf(seat) !== position);
    if (repeated !== undefined) {
      errors.push({ line, code: 'duplicateSeat', label, seat: repeated });
      return;
    }
    if (labels.has(label)) {
      errors.push({ line, code: 'duplicateLabel', label });
      return;
    }
    labels.add(label);
    rows.push({ label, seats });
  });

  if (rows.length === 0 && errors.length === 0) errors.push({ line: 0, code: 'empty' });
  return { rows, errors };
}

/** Writes rows back in the compact form, with ranges for runs of seats. */
export function formatCompact(rows: readonly CompactRow[]): string {
  return rows
    .map((row) => {
      const { seats } = row;
      const tokens: string[] = [];
      let index = 0;
      while (index < seats.length) {
        const value = seats[index];
        if (value === null || value === undefined) {
          // Gaps that only pad the start or end of a row read better as "_".
          const atEdge =
            seats.slice(0, index).every((seat) => seat === null) ||
            seats.slice(index + 1).every((seat) => seat === null);
          tokens.push(atEdge ? '_' : '|');
          index++;
          continue;
        }
        const next = seats[index + 1];
        const step = typeof next === 'number' && Math.abs(next - value) === 1 ? next - value : 0;
        let end = index;
        if (step !== 0) {
          while (true) {
            const current = seats[end];
            const following = seats[end + 1];
            if (typeof current !== 'number' || typeof following !== 'number') break;
            if (following !== current + step) break;
            end++;
          }
        }
        tokens.push(end > index ? `${value}-${String(seats[end])}` : String(value));
        index = end + 1;
      }
      return `${row.label}: ${tokens.join(' ')}`;
    })
    .join('\n');
}
