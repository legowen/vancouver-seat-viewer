/**
 * Re-checks every trailer in data/movies.json through YouTube's oEmbed endpoint and reports
 * the ones that are gone, no longer embeddable or now come from a different channel.
 *
 *   npm run verify:trailers              report only (exit code 1 if any trailer is dead)
 *   npm run verify:trailers -- --write   also set verifiedOn to today for trailers that pass
 *
 * To refresh the list, replace dead entries with official uploads (studio or distributor
 * channels only), set "channel" to the uploader's exact name, and run this again.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { MoviesSchema } from '../src/data/schema';
import { fetchOembed } from './oembed';

const moviesFile = new URL('../data/movies.json', import.meta.url);
const shouldWrite = process.argv.includes('--write');

const parsed = MoviesSchema.safeParse(JSON.parse(await readFile(moviesFile, 'utf8')));
if (!parsed.success) {
  console.error('data/movies.json does not match the schema:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const movies = parsed.data;
if (movies.length === 0) {
  console.log('data/movies.json is empty, so there is nothing to check.');
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
const dead: string[] = [];
for (const movie of movies) {
  const verdict = await fetchOembed(movie.youtubeId, movie.channel);
  if (verdict.ok) {
    console.log(`  ok    ${movie.title}  [${movie.channel}, ${movie.youtubeId}]`);
    if (shouldWrite) movie.verifiedOn = today;
  } else {
    console.log(`  DEAD  ${movie.title}  [${movie.youtubeId}]  ${verdict.reason}`);
    dead.push(movie.id);
  }
}

if (shouldWrite) {
  await writeFile(moviesFile, `${JSON.stringify(movies, null, 2)}\n`);
  console.log(`\nSet verifiedOn to ${today} for the trailers that passed.`);
}
console.log(
  dead.length === 0
    ? `\nAll ${movies.length} trailers are online and embeddable.`
    : `\n${dead.length} of ${movies.length} trailers need replacing: ${dead.join(', ')}`,
);
process.exitCode = dead.length > 0 ? 1 : 0;
