import { EMBED_ORIGIN } from './embed';

/** The small part of the YouTube IFrame Player API this app uses. */
export interface YouTubePlayer {
  unMute(): void;
  playVideo(): void;
  destroy(): void;
}

interface YouTubeNamespace {
  Player: new (
    element: HTMLIFrameElement,
    options: {
      events?: {
        onReady?(event: unknown): void;
        /** 2 bad id, 5 HTML5 error, 100 not found, 101/150 embedding not allowed. */
        onError?(event: { data: number }): void;
      };
    },
  ) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_URL = 'https://www.youtube.com/iframe_api';
let loading: Promise<YouTubeNamespace> | null = null;

/** Loads the official IFrame Player API script once. Rejects if it is blocked or slow. */
export function loadYouTubeApi(timeoutMs = 10_000): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  loading ??= new Promise<YouTubeNamespace>((resolve, reject) => {
    let timer = 0;
    const fail = (error: Error) => {
      window.clearTimeout(timer);
      loading = null;
      reject(error);
    };
    timer = window.setTimeout(() => fail(new Error('The YouTube API took too long')), timeoutMs);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      window.clearTimeout(timer);
      if (window.YT?.Player) resolve(window.YT);
      else fail(new Error('The YouTube API did not start'));
    };
    const script = document.createElement('script');
    script.src = API_URL;
    script.async = true;
    script.onerror = () => fail(new Error('The YouTube API could not be loaded'));
    document.head.append(script);
  });
  return loading;
}

/**
 * Sends a command straight to an embedded player. This is the message the API itself
 * sends, used when the API script is blocked (by an extension, say).
 */
export function postPlayerCommand(
  iframe: HTMLIFrameElement,
  command: 'unMute' | 'playVideo',
): void {
  iframe.contentWindow?.postMessage(
    JSON.stringify({ event: 'command', func: command, args: [] }),
    EMBED_ORIGIN,
  );
}
