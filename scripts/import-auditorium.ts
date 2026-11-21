/**
 * Turns a seat map typed in the compact format into an auditorium file under data/.
 *
 *   npm run import:auditorium -- seats.txt --theatre silvercity-riverport --id riverport-07 \
 *     --name "Auditorium 7" [--type standard|vip] [--entrance front-left] [--aisle 2] \
 *     [--no-align] [--source "seat map screenshot 2026-11-20"] [--notes "…"] [--verified] [--force]
 *
 * Use "-" instead of a file name to read the rows from standard input. The format is described
 * in docs/add-auditorium.md; the #/editor page does the same job with live previews.
 */
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  AUDITORIUM_TYPES,
  ENTRANCES,
  type AuditoriumType,
  type Entrance,
} from '../src/data/schema';
import { importCompact } from '../src/editor/import';
import { formatAuditoriumJson } from '../src/editor/json';

const USAGE = `Usage: npm run import:auditorium -- <seats.txt | -> --theatre <id> --id <id> --name <name>
  [--type ${AUDITORIUM_TYPES.join('|')}] [--entrance ${ENTRANCES.join('|')}]
  [--aisle <seat widths, default 2>] [--no-align] [--source <text>] [--notes <text>]
  [--verified] [--placeholder] [--force]`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

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
    verified: { type: 'boolean', default: false },
    placeholder: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}
const input = positionals[0];
if (!input || !values.theatre || !values.id || !values.name) fail(USAGE);
if (!(AUDITORIUM_TYPES as readonly string[]).includes(values.type)) {
  fail(`--type must be one of: ${AUDITORIUM_TYPES.join(', ')}`);
}
if (!(ENTRANCES as readonly string[]).includes(values.entrance)) {
  fail(`--entrance must be one of: ${ENTRANCES.join(', ')}`);
}
const aisleWidth = Number(values.aisle);
if (!Number.isInteger(aisleWidth) || aisleWidth < 1 || aisleWidth > 6) {
  fail('--aisle must be a whole number of seat widths from 1 to 6');
}

const dataDir = new URL('../data/', import.meta.url);
const theatreFile = new URL(`theatres/${values.theatre}/theatre.json`, dataDir);
if (!existsSync(theatreFile)) {
  fail(
    `There is no theatre "${values.theatre}" (expected data/theatres/${values.theatre}/theatre.json).`,
  );
}

const text = readFileSync(input === '-' ? 0 : input, 'utf8');
const result = importCompact(
  text,
  {
    id: values.id,
    theatreId: values.theatre,
    name: values.name,
    type: values.type as AuditoriumType,
    entrance: values.entrance as Entrance,
    verified: values.verified,
    placeholder: values.placeholder,
    source: values.source,
    notes: values.notes,
  },
  { aisleWidth, align: !values['no-align'] },
);
if (!result.ok) fail(`Could not import:\n${result.problems.map((p) => `  ${p}`).join('\n')}`);

const relative = `data/theatres/${values.theatre}/auditoriums/${values.id}.json`;
const target = new URL(`theatres/${values.theatre}/auditoriums/${values.id}.json`, dataDir);
if (existsSync(target) && !values.force) {
  fail(`${relative} already exists. Add --force to replace it.`);
}
await writeFile(target, formatAuditoriumJson(result.auditorium));

const { auditorium } = result;
const seats = auditorium.rows.reduce(
  (total, row) => total + row.seats.filter((seat) => seat !== null).length,
  0,
);
console.log(`Wrote ${relative}: ${auditorium.rows.length} rows, ${seats} seats.`);
const listed = (JSON.parse(readFileSync(theatreFile, 'utf8')) as { auditoriums?: string[] })
  .auditoriums;
if (!listed?.includes(auditorium.id)) {
  console.log(
    `It will show after the listed auditoriums. Add "${auditorium.id}" to "auditoriums" in data/theatres/${values.theatre}/theatre.json to choose its place.`,
  );
}
