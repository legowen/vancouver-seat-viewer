/** Privacy-enhanced embed host: no YouTube cookies until the viewer interacts with the player. */
export const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

/**
 * The embed URL for the 3D screen: starts muted (so browsers allow autoplay), plays inline
 * on iPhones, keeps the controls, and enables the IFrame Player API so "Tap for sound" can
 * unmute it.
 */
export function embedUrl(id: string, origin: string): string {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    controls: '1',
    enablejsapi: '1',
    origin,
  });
  return `${EMBED_ORIGIN}/embed/${encodeURIComponent(id)}?${params.toString()}`;
}

/** The video's page on YouTube, for the "Open trailer" fallback. */
export function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}

/** YouTube's 480×360 still frame, which every public video has. */
export function thumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
}
