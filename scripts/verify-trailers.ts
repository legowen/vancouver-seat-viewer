/**
 * Re-checks the trailers through YouTube oEmbed.
 *
 *   npm run verify:trailers               report dead entries in data/movies.json (exit 1 if any)
 *   npm run verify:trailers -- --prune    also remove them from data/movies.json
 *   npm run verify:trailers -- --promote  also check data/movie-candidates.json and move every
 *                                         candidate from an official channel into movies.json
 *
 * A video passes when oEmbed answers 200 and `author_name` is an official studio or distributor
 * channel (the list is in scripts/trailers.ts). 401/403 means it can't be embedded, 404 that it is
 * gone. If YouTube cannot be reached at all, nothing is changed.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { movieCandidatesSchema, moviesSchema, type Movie } from '../src/data/schema';
import { checkVideo, describe, isoDate, judgeCandidate, judgeMovie } from './trailers';

const MOVIES = join(process.cwd(), 'data', 'movies.json');
const CANDIDATES = join(process.cwd(), 'data', 'movie-candidates.json');

function write(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      prune: { type: 'boolean', default: false },
      promote: { type: 'boolean', default: false },
    },
  });

  const movies = moviesSchema.parse(JSON.parse(readFileSync(MOVIES, 'utf8')));
  const fetchImpl = (url: string) => fetch(url, { headers: { accept: 'application/json' } });

  console.log(`Checking ${movies.length} trailer(s) in data/movies.json…`);
  const reports = [];
  for (const movie of movies) {
    const report = judgeMovie(movie, await checkVideo(movie.youtubeId, fetchImpl));
    if (report.result.status === 'unreachable') {
      console.error(`  ${describe(report.result)}`);
      console.error('Nothing was changed. Check the network and try again.');
      return 2;
    }
    console.log(
      `  ${report.alive ? 'ok  ' : 'DEAD'}  ${movie.title} (${movie.youtubeId})${report.reason ? ` — ${report.reason}` : ''}`,
    );
    reports.push(report);
  }
  const dead = reports.filter((report) => !report.alive);
  let kept: Movie[] = movies;
  if (values.prune && dead.length > 0) {
    kept = reports.filter((report) => report.alive).map((report) => report.movie);
    console.log(`Removed ${dead.length} dead trailer(s).`);
  }

  if (values.promote && existsSync(CANDIDATES)) {
    const candidates = movieCandidatesSchema.parse(JSON.parse(readFileSync(CANDIDATES, 'utf8')));
    console.log(`Checking ${candidates.length} candidate(s) in data/movie-candidates.json…`);
    const today = isoDate();
    const remaining = [];
    for (const candidate of candidates) {
      const result = await checkVideo(candidate.youtubeId, fetchImpl);
      if (result.status === 'unreachable') {
        console.error(`  ${describe(result)}`);
        console.error('Nothing was changed. Check the network and try again.');
        return 2;
      }
      const report = judgeCandidate(candidate, result, today);
      if (report.movie && !kept.some((movie) => movie.youtubeId === report.movie!.youtubeId)) {
        kept = [...kept, report.movie];
        console.log(`  added ${candidate.title} (${report.movie.channel})`);
      } else if (report.movie) {
        console.log(`  already listed: ${candidate.title}`);
      } else {
        console.log(`  kept as a candidate: ${candidate.title} — ${report.reason}`);
        remaining.push(candidate);
      }
    }
    write(CANDIDATES, remaining);
  }

  if (kept !== movies) write(MOVIES, moviesSchema.parse(kept));
  if (dead.length > 0 && !values.prune) {
    console.log(`${dead.length} dead trailer(s). Run with --prune to remove them.`);
    return 1;
  }
  console.log('Done.');
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
