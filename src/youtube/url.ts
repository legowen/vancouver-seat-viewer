/**
 * YouTube links: reading a video id out of a pasted URL, and building the URLs the app uses.
 * Only the official embed is ever used to play a video; nothing is downloaded.
 */
import { YOUTUBE_ID_PATTERN } from '../data/schema';

export type YouTubeLinkResult =
  { ok: true; id: string } | { ok: false; reason: 'empty' | 'invalid' };

const WATCH_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const EMBED_HOSTS = new Set([...WATCH_HOSTS, 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be']);

/** Embed paths that look like ids but are a playlist or a channel's live stream. */
const NOT_VIDEOS = new Set(['videoseries', 'live_stream']);

function validId(candidate: string | null | undefined): string | null {
  return candidate && YOUTUBE_ID_PATTERN.test(candidate) && !NOT_VIDEOS.has(candidate)
    ? candidate
    : null;
}

/**
 * Accepts the four link forms people copy from YouTube:
 *   youtube.com/watch?v=<id>   youtu.be/<id>   youtube.com/shorts/<id>   youtube.com/embed/<id>
 * with or without `https://`, `www.` or `m.`, and with extra parameters such as `&t=30s`.
 * Anything else is rejected.
 */
export function parseYouTubeUrl(input: string): YouTubeLinkResult {
  const text = input.trim();
  if (!text) return { ok: false, reason: 'empty' };

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    return { ok: false, reason: 'invalid' };

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);
  let id: string | null = null;

  if (SHORT_HOSTS.has(host)) {
    if (segments.length === 1) id = validId(segments[0]);
  } else if (WATCH_HOSTS.has(host) && segments.length === 1 && segments[0] === 'watch') {
    id = validId(url.searchParams.get('v'));
  } else if (WATCH_HOSTS.has(host) && segments.length === 2 && segments[0] === 'shorts') {
    id = validId(segments[1]);
  } else if (EMBED_HOSTS.has(host) && segments.length === 2 && segments[0] === 'embed') {
    id = validId(segments[1]);
  }

  return id ? { ok: true, id } : { ok: false, reason: 'invalid' };
}

/** 480×360 still frame, used as the screen image before the video plays. */
export function thumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * The privacy-enhanced embed, muted so it may autoplay, with the JS API enabled so the
 * "Tap for sound" button can unmute it.
 */
export function embedUrl(id: string, origin?: string): string {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    controls: '1',
    enablejsapi: '1',
  });
  if (origin) params.set('origin', origin);
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}
