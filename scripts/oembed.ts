/** Checks YouTube videos through the public oEmbed endpoint (no API key needed). */

export type OembedVerdict = { ok: true; title: string } | { ok: false; reason: string };

export interface OembedBody {
  author_name?: unknown;
  title?: unknown;
}

/**
 * Decides whether a trailer is still usable from an oEmbed response: it must exist, allow
 * embedding (oEmbed answers 401 or 403 when it does not) and still come from the channel
 * recorded in data/movies.json.
 */
export function judgeOembed(
  status: number,
  body: OembedBody | null,
  expectedChannel: string,
): OembedVerdict {
  if (status === 401 || status === 403) {
    return { ok: false, reason: 'embedding is disabled, or the video is private' };
  }
  if (status === 404) {
    return { ok: false, reason: 'video not found (removed, private or a wrong id)' };
  }
  if (status !== 200) return { ok: false, reason: `unexpected HTTP ${status}` };
  const author = typeof body?.author_name === 'string' ? body.author_name : '';
  if (author !== expectedChannel) {
    return {
      ok: false,
      reason: `uploaded by "${author || 'unknown'}", expected "${expectedChannel}"`,
    };
  }
  return { ok: true, title: typeof body?.title === 'string' ? body.title : '' };
}

export function oembedUrl(videoId: string): string {
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  return `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
}

export async function fetchOembed(
  videoId: string,
  expectedChannel: string,
): Promise<OembedVerdict> {
  try {
    const response = await fetch(oembedUrl(videoId), {
      headers: { 'user-agent': 'vancouver-seat-viewer trailer check' },
    });
    const body = response.ok ? ((await response.json()) as OembedBody) : null;
    return judgeOembed(response.status, body, expectedChannel);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, reason: `request failed: ${message}` };
  }
}
