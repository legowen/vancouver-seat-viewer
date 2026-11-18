/**
 * The compact seat-map format: a quick way to type in an auditorium by hand.
 *
 *   A: 1-4 | 5-10 | 11-14
 *   B: 1-4 | 5-12 | 13-16
 *   C: 1-4 | 5-6 _ _ 9-12 | 13-16     # two missing seats
 *
 * One row per line, front row first. `a-b` is a run of seats (either direction), `|` is an
 * aisle, `_` is one missing seat, `#` starts a comment.
 */
import { MAX_CELLS_PER_ROW, MAX_ROWS, MAX_SEAT_NUMBER, type RowJson, type SeatCell } from './schema';

export type CompactErrorCode =
  | 'missingColon'
  | 'badLabel'
  | 'badToken'
  | 'badRange'
  | 'emptyRow'
  | 'duplicateSeat'
  | 'duplicateRow'
  | 'tooManySeats'
  | 'tooWide'
  | 'tooManyRows';

export interface CompactError {
  /** 1-based line number in the input text. */
  line: number;
  code: CompactErrorCode;
  /** Values for the placeholders of the matching `compact.*` message. */
  params: Record<string, string | number>;
}

export interface CompactOptions {
  /** Pad rows with gaps so that the aisles line up from row to row. Default `true`. */
  align?: boolean;
  /** How many seat widths an aisle (`|`) takes. Default 2 (about 1.1 m for standard seats). */
  aisleCells?: number;
}

export interface CompactResult {
  /** Rows that parsed cleanly, front row first. */
  rows: RowJson[];
  errors: CompactError[];
}

/** Most seats a single typed row may hold (aisles and padding come on top). */
export const MAX_SEATS_PER_ROW = 80;

interface ParsedRow {
  /** 1-based line in the input. */
  line: number;
  label: string;
  /** Blocks of seats between aisles. */
  sections: SeatCell[][];
}

function parseLine(text: string, line: number, errors: CompactError[]): ParsedRow | null {
  const fail = (code: CompactErrorCode, params: CompactError['params'] = {}) => {
    errors.push({ line, code, params });
    return null;
  };

  const colon = text.indexOf(':');
  if (colon === -1) return fail('missingColon');
  const label = text.slice(0, colon).trim();
  if (label.length < 1 || label.length > 4 || /\s/.test(label)) return fail('badLabel');

  const body = text
    .slice(colon + 1)
    .replace(/[,;]/g, ' ')
    .replace(/[–—~]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\|/g, ' | ');
  const tokens = body.split(/\s+/).filter(Boolean);

  const sections: SeatCell[][] = [[]];
  const seen = new Set<number>();
  let seatCount = 0;
  let ok = true;

  const addSeat = (seat: number): boolean => {
    if (seen.has(seat)) {
      fail('duplicateSeat', { seat });
      return false;
    }
    seen.add(seat);
    seatCount += 1;
    sections[sections.length - 1].push(seat);
    return true;
  };

  for (const token of tokens) {
    if (token === '|') {
      sections.push([]);
      continue;
    }
    if (/^_+$/.test(token)) {
      for (let i = 0; i < token.length; i += 1) sections[sections.length - 1].push(null);
      continue;
    }
    if (/^\d+$/.test(token)) {
      const seat = Number(token);
      if (seat < 1 || seat > MAX_SEAT_NUMBER) {
        fail('badToken', { token });
        ok = false;
        break;
      }
      if (!addSeat(seat)) {
        ok = false;
        break;
      }
      continue;
    }
    const range = /^(\d+)-(\d+)$/.exec(token);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from < 1 || to < 1 || from > MAX_SEAT_NUMBER || to > MAX_SEAT_NUMBER) {
        fail('badRange', { token });
        ok = false;
        break;
      }
      if (Math.abs(to - from) + 1 > MAX_SEATS_PER_ROW) {
        fail('tooManySeats', { max: MAX_SEATS_PER_ROW });
        ok = false;
        break;
      }
      const step = to >= from ? 1 : -1;
      for (let seat = from; seat !== to + step; seat += step) {
        if (!addSeat(seat)) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
      continue;
    }
    fail('badToken', { token });
    ok = false;
    break;
  }

  if (!ok) return null;
  if (seatCount === 0) return fail('emptyRow');
  if (seatCount > MAX_SEATS_PER_ROW) return fail('tooManySeats', { max: MAX_SEATS_PER_ROW });

  // A `|` at either end of the line is decoration, not a block.
  while (sections.length > 1 && sections[0].length === 0) sections.shift();
  while (sections.length > 1 && sections[sections.length - 1].length === 0) sections.pop();

  return { line, label, sections };
}

function gaps(count: number): SeatCell[] {
  return new Array<SeatCell>(Math.max(0, count)).fill(null);
}

/** The number of blocks most rows have (the larger one on a tie). */
function commonSectionCount(rows: ParsedRow[]): number {
  const tally = new Map<number, number>();
  for (const row of rows) tally.set(row.sections.length, (tally.get(row.sections.length) ?? 0) + 1);
  let best = 1;
  let bestRows = 0;
  for (const [count, howMany] of tally) {
    if (howMany > bestRows || (howMany === bestRows && count > best)) {
      best = count;
      bestRows = howMany;
    }
  }
  return best;
}

function flatten(sections: SeatCell[][], aisleCells: number): SeatCell[] {
  const out: SeatCell[] = [];
  sections.forEach((section, index) => {
    if (index > 0) out.push(...gaps(aisleCells));
    out.push(...section);
  });
  return out;
}

/**
 * Lines the aisles up: the left block is pushed against the first aisle, the right block against
 * the last aisle and blocks in between are centred. Rows with an unusual number of blocks (a back
 * row without aisles, say) are left alone; the layout centres them on the screen.
 */
function alignRows(rows: ParsedRow[], aisleCells: number): SeatCell[][] {
  const common = commonSectionCount(rows);
  if (common < 2) return rows.map((row) => flatten(row.sections, aisleCells));

  const widths = new Array<number>(common).fill(0);
  for (const row of rows) {
    if (row.sections.length !== common) continue;
    row.sections.forEach((section, index) => {
      widths[index] = Math.max(widths[index], section.length);
    });
  }

  return rows.map((row) => {
    if (row.sections.length !== common) return flatten(row.sections, aisleCells);
    const padded = row.sections.map((section, index) => {
      const missing = widths[index] - section.length;
      if (index === 0) return [...gaps(missing), ...section];
      if (index === common - 1) return [...section, ...gaps(missing)];
      const left = Math.floor(missing / 2);
      return [...gaps(left), ...section, ...gaps(missing - left)];
    });
    return flatten(padded, aisleCells);
  });
}

export function parseCompactSeatMap(text: string, options: CompactOptions = {}): CompactResult {
  const align = options.align ?? true;
  const aisleCells = Math.min(6, Math.max(1, Math.round(options.aisleCells ?? 2)));

  const errors: CompactError[] = [];
  const parsed: ParsedRow[] = [];
  const labels = new Set<string>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    // NFKC turns the full-width punctuation and digits that Korean and Chinese keyboards
    // produce (： ｜ ＿ － １２３) into the ASCII characters the format uses.
    const content = raw.normalize('NFKC').replace(/#.*$/, '').trim();
    if (!content) return;
    const row = parseLine(content, line, errors);
    if (!row) return;
    if (labels.has(row.label)) {
      errors.push({ line, code: 'duplicateRow', params: { row: row.label } });
      return;
    }
    if (parsed.length >= MAX_ROWS) {
      errors.push({ line, code: 'tooManyRows', params: { max: MAX_ROWS } });
      return;
    }
    labels.add(row.label);
    parsed.push(row);
  });

  const cells = align
    ? alignRows(parsed, aisleCells)
    : parsed.map((row) => flatten(row.sections, aisleCells));

  const rows: RowJson[] = [];
  parsed.forEach((row, index) => {
    const seats = cells[index];
    if (seats.length > MAX_CELLS_PER_ROW) {
      // Fine on its own, but padding to line up the aisles made it wider than a row can be.
      errors.push({ line: row.line, code: 'tooWide', params: { max: MAX_CELLS_PER_ROW } });
      return;
    }
    rows.push({ label: row.label, seats });
  });

  errors.sort((a, b) => a.line - b.line);
  return { rows, errors };
}

/**
 * The reverse of the parser, without alignment: every gap becomes `_`, so parsing the result
 * with `{ align: false }` gives back exactly the same rows.
 */
export function toCompactText(rows: readonly RowJson[]): string {
  return rows
    .map((row) => {
      const parts: string[] = [];
      let index = 0;
      while (index < row.seats.length) {
        const cell = row.seats[index];
        if (cell === null) {
          parts.push('_');
          index += 1;
          continue;
        }
        // Collapse a run of consecutive numbers (up or down) into `a-b`.
        let end = index;
        let step = 0;
        while (end + 1 < row.seats.length) {
          const next = row.seats[end + 1];
          const here = row.seats[end] as number;
          if (next === null) break;
          const diff = next - here;
          if (Math.abs(diff) !== 1 || (step !== 0 && diff !== step)) break;
          step = diff;
          end += 1;
        }
        parts.push(end > index ? `${cell}-${row.seats[end]}` : String(cell));
        index = end + 1;
      }
      return `${row.label}: ${parts.join(' ')}`;
    })
    .join('\n');
}
