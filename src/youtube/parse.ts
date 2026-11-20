const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const LONG_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be']);

/**
 * `empty`: nothing was typed. `notYouTube`: not a YouTube link at all.
 * `noVideo`: a YouTube link, but not to a single video (a channel, a playlist…).
 */
export type YouTubeLinkResult =
  { ok: true; id: string } | { ok: false; reason: 'empty' | 'notYouTube' | 'noVideo' };

/**
 * Finds the video id in a YouTube link. Accepts the watch?v=, youtu.be/, shorts/ and
 * embed/ forms, with or without "https://", and rejects everything else.
 */
export function parseYouTubeUrl(input: string): YouTubeLinkResult {
  const text = input.trim();
  if (!text) return { ok: false, reason: 'empty' };

  let url: URL;
  try {
    // Links are often pasted without the protocol ("youtu.be/…").
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, reason: 'notYouTube' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'notYouTube' };
  }

  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  let candidate: string | null = null;
  if (SHORT_HOSTS.has(host)) {
    candidate = parts.length === 1 ? (parts[0] ?? null) : null;
  } else if (LONG_HOSTS.has(host)) {
    if (parts.length === 1 && parts[0] === 'watch') {
      candidate = url.searchParams.get('v');
    } else if (parts.length === 2 && (parts[0] === 'shorts' || parts[0] === 'embed')) {
      candidate = parts[1] ?? null;
    }
  } else {
    return { ok: false, reason: 'notYouTube' };
  }

  // "videoseries" happens to be 11 characters long: it is a playlist embed, not a video.
  if (candidate && VIDEO_ID.test(candidate) && candidate !== 'videoseries') {
    return { ok: true, id: candidate };
  }
  return { ok: false, reason: 'noVideo' };
}
