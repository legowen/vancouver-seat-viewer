/**
 * A quick way to type a seat map, one row per line, from the screen to the back:
 *
 *   A: 1-3 | 4-13 | 14-16
 *   B: 1-4 | 5-14 | 15-18
 *
 * "1-4" is seats 1 to 4 ("14-11" counts down for rows numbered right to left). "|" is an
 * aisle between blocks of seats, two seat widths wide by default ("| |" for a double aisle),
 * and "_" is a single missing seat. Rows with the same number of blocks are padded so their
 * aisles line up: the outer blocks hug the aisle and the middle ones are centred, the way
 * cinema aisles run straight from front to back. A "|" at either end of a line is ignored.
 *
 * Commas or spaces separate seats, blank lines are skipped and "#" starts a comment.
 * Full-width characters from Korean and Chinese keyboards (： ｜ ＿ － １２３) work too.
 */

export interface CompactRow {
  label: string;
  seats: (number | null)[];
}

export interface CompactOptions {
  /** Seat widths per aisle. Default 2, about 1.1 m for standard seats. */
  aisleWidth?: number;
  /** Pad blocks so the aisles line up from row to row. Default true. */
  align?: boolean;
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

type Cell = number | null;

interface ParsedRow {
  line: number;
  label: string;
  /** Blocks of seats between aisles, each with its own "_" gaps. */
  blocks: Cell[][];
}

/** Matches the schema: at most 80 slots per row, seat numbers 1–999. */
const MAX_SLOTS = 80;
const LABEL = /^[A-Za-z0-9]{1,3}$/;
const SINGLE = /^\d{1,3}$/;
const RANGE = /^(\d{1,3})-(\d{1,3})$/;
const TOKEN = /\||_|[^\s,|_]+/g;

const gaps = (count: number): Cell[] => new Array<Cell>(Math.max(0, count)).fill(null);

function flatten(blocks: Cell[][], aisleWidth: number): Cell[] {
  return blocks.flatMap((block, index) => (index === 0 ? block : [...gaps(aisleWidth), ...block]));
}

/** The number of blocks most rows have (the larger one on a tie). */
function commonBlockCount(rows: readonly ParsedRow[]): number {
  const tally = new Map<number, number>();
  for (const row of rows) tally.set(row.blocks.length, (tally.get(row.blocks.length) ?? 0) + 1);
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

/**
 * Pads the blocks of rows that share the most common block count to the same widths: the
 * first block against the first aisle, the last block against the last aisle, and blocks in
 * between centred. Other rows (a back row without aisles, say) are left for the layout to centre.
 */
function alignRows(rows: readonly ParsedRow[], aisleWidth: number): Cell[][] {
  const common = commonBlockCount(rows);
  if (common < 2) return rows.map((row) => flatten(row.blocks, aisleWidth));
  const widths = new Array<number>(common).fill(0);
  for (const row of rows) {
    if (row.blocks.length !== common) continue;
    row.blocks.forEach((block, index) => {
      widths[index] = Math.max(widths[index] ?? 0, block.length);
    });
  }
  return rows.map((row) => {
    if (row.blocks.length !== common) return flatten(row.blocks, aisleWidth);
    const padded = row.blocks.map((block, index) => {
      const missing = (widths[index] ?? block.length) - block.length;
      if (index === 0) return [...gaps(missing), ...block];
      if (index === common - 1) return [...block, ...gaps(missing)];
      const left = Math.floor(missing / 2);
      return [...gaps(left), ...block, ...gaps(missing - left)];
    });
    return flatten(padded, aisleWidth);
  });
}

function parseLine(content: string, line: number, errors: CompactError[]): ParsedRow | null {
  const colon = content.indexOf(':');
  if (colon === -1) {
    errors.push({ line, code: 'missingColon' });
    return null;
  }
  const label = content.slice(0, colon).trim();
  if (!LABEL.test(label)) {
    errors.push({ line, code: 'badLabel', label });
    return null;
  }

  const blocks: Cell[][] = [[]];
  let seatCount = 0;
  for (const token of content.slice(colon + 1).match(TOKEN) ?? []) {
    const block = blocks[blocks.length - 1]!;
    if (token === '|') {
      blocks.push([]);
      continue;
    }
    if (token === '_') {
      block.push(null);
      continue;
    }
    const range = RANGE.exec(token);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from < 1 || to < 1) {
        errors.push({ line, code: 'badToken', token });
        return null;
      }
      seatCount += Math.abs(to - from) + 1;
      if (seatCount > MAX_SLOTS) {
        errors.push({ line, code: 'tooManySeats', label });
        return null;
      }
      const step = from <= to ? 1 : -1;
      for (let seat = from; seat !== to + step; seat += step) block.push(seat);
      continue;
    }
    if (SINGLE.test(token) && Number(token) >= 1) {
      block.push(Number(token));
      seatCount++;
      continue;
    }
    errors.push({ line, code: 'badToken', token });
    return null;
  }

  // A "|" at either end of the line is decoration, not an empty block.
  while (blocks.length > 1 && blocks[0]!.length === 0) blocks.shift();
  while (blocks.length > 1 && blocks[blocks.length - 1]!.length === 0) blocks.pop();

  const numbers = blocks.flat().filter((seat) => seat !== null);
  if (numbers.length === 0) {
    errors.push({ line, code: 'noSeats', label });
    return null;
  }
  const repeated = numbers.find((seat, position) => numbers.indexOf(seat) !== position);
  if (repeated !== undefined) {
    errors.push({ line, code: 'duplicateSeat', label, seat: repeated });
    return null;
  }
  return { line, label, blocks };
}

export function parseCompact(
  text: string,
  options: CompactOptions = {},
): { rows: CompactRow[]; errors: CompactError[] } {
  const aisleWidth = Math.min(6, Math.max(1, Math.round(options.aisleWidth ?? 2)));
  const errors: CompactError[] = [];
  const parsed: ParsedRow[] = [];
  const labels = new Set<string>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    // NFKC turns the full-width punctuation and digits that Korean and Chinese keyboards
    // produce (： ｜ ＿ － １２３) into the characters the format uses.
    const content = raw.normalize('NFKC').replace(/#.*$/, '').trim();
    if (content === '') return;
    const row = parseLine(content, line, errors);
    if (!row) return;
    if (labels.has(row.label)) {
      errors.push({ line, code: 'duplicateLabel', label: row.label });
      return;
    }
    labels.add(row.label);
    parsed.push(row);
  });

  const cells =
    options.align === false
      ? parsed.map((row) => flatten(row.blocks, aisleWidth))
      : alignRows(parsed, aisleWidth);

  const rows: CompactRow[] = [];
  parsed.forEach((row, index) => {
    const seats = cells[index] ?? [];
    if (seats.length > MAX_SLOTS) {
      // Fine on its own, but the aisles and padding made it wider than a row can be.
      errors.push({ line: row.line, code: 'tooManySeats', label: row.label });
      return;
    }
    rows.push({ label: row.label, seats });
  });

  if (rows.length === 0 && errors.length === 0) errors.push({ line: 0, code: 'empty' });
  errors.sort((a, b) => a.line - b.line);
  return { rows, errors };
}

/**
 * Writes rows back in the compact form, with ranges for runs of seats. Every gap becomes "_",
 * so parsing the result gives back exactly the same rows (no aisle widening or padding).
 */
export function formatCompact(rows: readonly CompactRow[]): string {
  return rows
    .map((row) => {
      const { seats } = row;
      const tokens: string[] = [];
      let index = 0;
      while (index < seats.length) {
        const value = seats[index];
        if (value === null || value === undefined) {
          tokens.push('_');
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
