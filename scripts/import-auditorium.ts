/**
 * Turns a seat map typed in the compact format into an auditorium file.
 *
 *   npm run import:auditorium -- --theatre silvercity-riverport --id riverport-07 \
 *     --name "Auditorium 7" [--type vip] [--entrance back-left] [--aisle 2] [--no-align] \
 *     [--source "seatmap screenshot 2026-11-18"] [--dry-run] [--force] seats.txt
 *
 * Reads the text from the file (or from stdin with `-`), writes
 * data/theatres/<theatre>/auditoriums/<id>.json and adds the id to that theatre's theatre.json.
 * See docs/add-auditorium.md.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { CompactError, CompactErrorCode } from '../src/data/compact';
import { formatAuditoriumJson } from '../src/data/format';
import { auditoriumFromCompact } from '../src/data/importer';
import { AUDITORIUM_TYPES, ENTRANCES, theatreSchema } from '../src/data/schema';

/** English messages for the terminal (the app shows translated ones). */
const MESSAGES: Record<CompactErrorCode, (p: CompactError['params']) => string> = {
  missingColon: () => 'put a colon after the row label, like A: 1-10',
  badLabel: () => 'the row label must be 1 to 4 characters without spaces',
  badToken: (p) => `can't read "${p.token}"; use numbers, ranges like 1-10, | or _`,
  badRange: (p) => `${p.token} is not a valid range`,
  emptyRow: () => 'this row has no seats',
  duplicateSeat: (p) => `seat ${p.seat} appears twice in this row`,
  duplicateRow: (p) => `row ${p.row} appears twice`,
  tooManySeats: (p) => `a row can have at most ${p.max} seats`,
  tooWide: (p) =>
    `once the aisles are lined up this row is wider than ${p.max} places; try --no-align`,
  tooManyRows: (p) => `an auditorium can have at most ${p.max} rows`,
};

function fail(message: string): never {
  console.error(`import:auditorium: ${message}`);
  process.exit(1);
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      theatre: { type: 'string' },
      id: { type: 'string' },
      name: { type: 'string' },
      type: { type: 'string', default: 'standard' },
      entrance: { type: 'string', default: 'front-left' },
      aisle: { type: 'string', default: '2' },
      'no-align': { type: 'boolean', default: false },
      source: { type: 'string' },
      notes: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help || positionals.length !== 1) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
    process.exit(values.help ? 0 : 1);
  }
  if (!values.theatre || !values.id || !values.name) {
    fail('--theatre, --id and --name are required (see --help)');
  }
  if (!(AUDITORIUM_TYPES as readonly string[]).includes(values.type)) {
    fail(`--type must be one of ${AUDITORIUM_TYPES.join(', ')}`);
  }
  if (!(ENTRANCES as readonly string[]).includes(values.entrance)) {
    fail(`--entrance must be one of ${ENTRANCES.join(', ')}`);
  }

  const theatreDir = join(process.cwd(), 'data', 'theatres', values.theatre);
  const theatreFile = join(theatreDir, 'theatre.json');
  if (!existsSync(theatreFile)) {
    fail(`data/theatres/${values.theatre}/theatre.json does not exist; add the theatre first`);
  }

  const input =
    positionals[0] === '-' ? readFileSync(0, 'utf8') : readFileSync(positionals[0], 'utf8');
  const result = auditoriumFromCompact(input, {
    id: values.id,
    theatreId: values.theatre,
    name: values.name,
    type: values.type as (typeof AUDITORIUM_TYPES)[number],
    entrance: values.entrance as (typeof ENTRANCES)[number],
    align: !values['no-align'],
    aisleCells: Number(values.aisle),
    source: values.source,
    notes: values.notes,
  });

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`  line ${error.line}: ${MESSAGES[error.code](error.params)}`);
    }
    fail(`${result.errors.length} problem(s) in the seat map; nothing was written`);
  }
  if (!result.auditorium) fail('the seat map has no rows');
  if (result.issues.length > 0) {
    for (const issue of result.issues) console.error(`  ${issue}`);
    fail('the auditorium is not valid; nothing was written');
  }

  const json = formatAuditoriumJson(result.auditorium);
  if (values['dry-run']) {
    process.stdout.write(json);
    return;
  }

  const target = join(theatreDir, 'auditoriums', `${values.id}.json`);
  if (existsSync(target) && !values.force) {
    fail(`${target} exists; pass --force to replace it`);
  }
  writeFileSync(target, json);

  const theatre = theatreSchema.parse(JSON.parse(readFileSync(theatreFile, 'utf8')));
  if (!theatre.auditoriums.includes(values.id)) {
    const raw = JSON.parse(readFileSync(theatreFile, 'utf8')) as { auditoriums: string[] };
    raw.auditoriums.push(values.id);
    writeFileSync(theatreFile, `${JSON.stringify(raw, null, 2)}\n`);
  }

  const seats = result.auditorium.rows.reduce(
    (sum, row) => sum + row.seats.filter((cell) => cell !== null).length,
    0,
  );
  console.log(
    `Wrote data/theatres/${values.theatre}/auditoriums/${values.id}.json ` +
      `(${result.auditorium.rows.length} rows, ${seats} seats). Run npm test to validate it.`,
  );
}

main();
