/**
 * Checks YouTube trailers through oEmbed. Used by `npm run verify:trailers`; kept separate from
 * the command so the rules can be unit-tested with a fake `fetch`.
 */
import type { Movie, MovieCandidate } from '../src/data/schema';

/**
 * Channels accepted as official studio or distributor uploads, compared without case and
 * punctuation. A candidate from any other channel is reported, not added: if it really is an
 * official channel, add its name here. Never add fan, re-upload, reaction or aggregator channels.
 */
export const OFFICIAL_CHANNELS = [
  '20th Century Studios',
  'A24',
  'Amazon MGM Studios',
  'Angel Studios',
  'Apple TV',
  'Blumhouse',
  'Crunchyroll',
  'Disney',
  'Disney UK',
  'DreamWorks Animation',
  'Elevation Pictures',
  'Focus Features',
  'Illumination',
  'Legendary',
  'Lionsgate Movies',
  'LIONSGATE',
  'Lionsgate UK',
  'Marvel Entertainment',
  'Mongrel Media',
  'NEON',
  'Netflix',
  'Paramount Pictures',
  'Paramount Pictures UK',
  'Pixar',
  'Searchlight Pictures',
  'Sony Pictures Entertainment',
  'Sony Pictures UK',
  'Universal Pictures',
  'Universal Pictures Canada',
  'Universal Pictures UK',
  'Walt Disney Studios',
  'Warner Bros.',
  'Warner Bros. Pictures',
  'Warner Bros. UK & Ireland',
] as const;

function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

const OFFICIAL = new Set(OFFICIAL_CHANNELS.map(normalise));

export function isOfficialChannel(name: string): boolean {
  return OFFICIAL.has(normalise(name));
}

export function oembedUrl(youtubeId: string): string {
  const watch = `https://www.youtube.com/watch?v=${youtubeId}`;
  return `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
}

export type CheckResult =
  | { status: 'ok'; channel: string; title: string }
  /** 401 or 403: exists but cannot be embedded. 404: removed or private. */
  | { status: 'not-embeddable' | 'missing'; httpStatus: number }
  /** Any other HTTP error, or an answer that is not oEmbed JSON. */
  | { status: 'error'; detail: string }
  /** No answer at all (offline, blocked network). Says nothing about the video. */
  | { status: 'unreachable'; detail: string };

export type FetchLike = (url: string) => Promise<{
  status: number;
  ok: boolean;
  json(): Promise<unknown>;
}>;

export async function checkVideo(youtubeId: string, fetchImpl: FetchLike): Promise<CheckResult> {
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(oembedUrl(youtubeId));
  } catch (error) {
    return {
      status: 'unreachable',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  if (response.status === 401 || response.status === 403) {
    return { status: 'not-embeddable', httpStatus: response.status };
  }
  if (response.status === 404) return { status: 'missing', httpStatus: 404 };
  if (!response.ok) return { status: 'error', detail: `HTTP ${response.status}` };
  try {
    const body = (await response.json()) as { author_name?: unknown; title?: unknown };
    if (typeof body.author_name !== 'string' || body.author_name.trim() === '') {
      return { status: 'error', detail: 'no author_name in the oEmbed answer' };
    }
    return {
      status: 'ok',
      channel: body.author_name.trim(),
      title: typeof body.title === 'string' ? body.title : '',
    };
  } catch {
    return { status: 'error', detail: 'the oEmbed answer is not JSON' };
  }
}

export interface MovieReport {
  movie: Movie;
  result: CheckResult;
  /** Still fine: embeddable and from the same official channel as when it was added. */
  alive: boolean;
  reason?: string;
}

export function judgeMovie(movie: Movie, result: CheckResult): MovieReport {
  if (result.status !== 'ok') {
    return { movie, result, alive: false, reason: describe(result) };
  }
  if (normalise(result.channel) !== normalise(movie.channel)) {
    return {
      movie,
      result,
      alive: false,
      reason: `now uploaded by "${result.channel}", not "${movie.channel}"`,
    };
  }
  return { movie, result, alive: true };
}

export interface CandidateReport {
  candidate: MovieCandidate;
  result: CheckResult;
  /** The entry to add to movies.json, when the candidate passed. */
  movie?: Movie;
  reason?: string;
}

export function judgeCandidate(
  candidate: MovieCandidate,
  result: CheckResult,
  today: string,
): CandidateReport {
  if (result.status !== 'ok') return { candidate, result, reason: describe(result) };
  if (!isOfficialChannel(result.channel)) {
    return {
      candidate,
      result,
      reason: `uploaded by "${result.channel}", which is not on the official-channel list in scripts/trailers.ts`,
    };
  }
  return {
    candidate,
    result,
    movie: {
      id: candidate.id,
      title: candidate.title,
      youtubeId: candidate.youtubeId,
      channel: result.channel,
      verifiedOn: today,
    },
  };
}

export function describe(result: CheckResult): string {
  switch (result.status) {
    case 'ok':
      return `ok (${result.channel})`;
    case 'not-embeddable':
      return `cannot be embedded (HTTP ${result.httpStatus})`;
    case 'missing':
      return 'removed or private (HTTP 404)';
    case 'error':
      return result.detail;
    case 'unreachable':
      return `YouTube could not be reached: ${result.detail}`;
  }
}

/** Local date as YYYY-MM-DD. */
export function isoDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
