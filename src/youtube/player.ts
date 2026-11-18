/**
 * Plays a YouTube video through the official embed and the YouTube IFrame Player API.
 *
 * The API script (https://www.youtube.com/iframe_api) creates the iframe on the privacy-enhanced
 * youtube-nocookie.com host, muted so it may autoplay. "Tap for sound" calls `unMute()`.
 * If the API script cannot load, the embed is created directly and the same API commands are
 * sent to it as messages (the protocol the API script uses itself, enabled by enablejsapi=1).
 */
import { embedUrl } from './url';

export const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
const API_URL = 'https://www.youtube.com/iframe_api';

export interface PlayerCallbacks {
  onReady?: () => void;
  onMutedChange?: (muted: boolean) => void;
  /** YouTube error code: 2 bad id, 5 HTML5 error, 100 removed or private, 101/150 not embeddable. */
  onError?: (code: number) => void;
}

export interface TrailerPlayer {
  readonly element: HTMLElement;
  readonly muted: boolean;
  unMute(): void;
  mute(): void;
  destroy(): void;
}

/** The parts of the YouTube IFrame API this app uses. */
interface YTPlayer {
  unMute(): void;
  mute(): void;
  isMuted(): boolean;
  playVideo(): void;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      host?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onError?: (event: { data: number }) => void;
        onStateChange?: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace | null> | null = null;

/** Loads the IFrame Player API once; resolves null if it does not arrive in time. */
export function loadYouTubeApi(timeoutMs = 6000): Promise<YTNamespace | null> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  const loading = new Promise<YTNamespace | null>((resolve) => {
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      window.clearTimeout(timer);
      resolve(window.YT?.Player ? window.YT : null);
    };
    const script = document.createElement('script');
    script.src = API_URL;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    document.head.appendChild(script);
  }).then((api) => {
    // Allow another try later (for example after coming back online).
    if (!api) apiPromise = null;
    return api;
  });
  apiPromise = loading;
  return loading;
}

const PLAYER_VARS = {
  autoplay: 1,
  mute: 1,
  playsinline: 1,
  rel: 0,
  modestbranding: 1,
  controls: 1,
} as const;

function viaApi(
  api: YTNamespace,
  videoId: string,
  host: HTMLElement,
  callbacks: PlayerCallbacks,
): TrailerPlayer {
  const mountPoint = document.createElement('div');
  host.appendChild(mountPoint);
  let muted = true;
  const player = new api.Player(mountPoint, {
    videoId,
    host: EMBED_ORIGIN,
    width: '100%',
    height: '100%',
    playerVars: { ...PLAYER_VARS, origin: location.origin },
    events: {
      onReady: () => callbacks.onReady?.(),
      onError: (event) => callbacks.onError?.(event.data),
    },
  });
  const element = (() => {
    try {
      return player.getIframe() ?? mountPoint;
    } catch {
      return mountPoint;
    }
  })();
  return {
    element,
    get muted() {
      return muted;
    },
    unMute() {
      player.unMute();
      player.playVideo();
      muted = false;
      callbacks.onMutedChange?.(false);
    },
    mute() {
      player.mute();
      muted = true;
      callbacks.onMutedChange?.(true);
    },
    destroy() {
      try {
        player.destroy();
      } catch {
        // The iframe may already be gone with its container.
      }
      host.replaceChildren();
    },
  };
}

/** One message from the embed, as far as this app cares. */
export type EmbedMessage =
  { type: 'ready' } | { type: 'muted'; muted: boolean } | { type: 'error'; code: number };

/** Reads a message posted by the YouTube embed; anything else gives an empty list. */
export function parseEmbedMessage(data: unknown): EmbedMessage[] {
  let message: unknown = data;
  if (typeof data === 'string') {
    try {
      message = JSON.parse(data);
    } catch {
      return [];
    }
  }
  if (!message || typeof message !== 'object') return [];
  const { event, info } = message as { event?: unknown; info?: unknown };
  const out: EmbedMessage[] = [];
  if (event === 'onReady') out.push({ type: 'ready' });
  if (event === 'onError' && typeof info === 'number') out.push({ type: 'error', code: info });
  if (
    (event === 'initialDelivery' || event === 'infoDelivery') &&
    info &&
    typeof info === 'object'
  ) {
    const muted = (info as { muted?: unknown }).muted;
    if (typeof muted === 'boolean') out.push({ type: 'muted', muted });
    if (event === 'initialDelivery') out.push({ type: 'ready' });
  }
  return out;
}

function viaMessages(
  videoId: string,
  host: HTMLElement,
  callbacks: PlayerCallbacks,
): TrailerPlayer {
  const iframe = document.createElement('iframe');
  iframe.src = embedUrl(videoId, location.origin);
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.title = 'YouTube video player';
  iframe.setAttribute('allowfullscreen', '');
  host.appendChild(iframe);

  let muted = true;
  let ready = false;
  const channel = { id: 1, channel: 'widget' };
  const post = (payload: Record<string, unknown>) =>
    iframe.contentWindow?.postMessage(JSON.stringify({ ...payload, ...channel }), EMBED_ORIGIN);
  const command = (func: string, args: unknown[] = []) => post({ event: 'command', func, args });

  const onMessage = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow || event.origin !== EMBED_ORIGIN) return;
    for (const message of parseEmbedMessage(event.data)) {
      if (message.type === 'ready' && !ready) {
        ready = true;
        callbacks.onReady?.();
      } else if (message.type === 'muted' && message.muted !== muted) {
        muted = message.muted;
        callbacks.onMutedChange?.(muted);
      } else if (message.type === 'error') {
        callbacks.onError?.(message.code);
      }
    }
  };
  window.addEventListener('message', onMessage);

  // Ask the embed to report its state until it answers.
  let attempts = 0;
  const listen = window.setInterval(() => {
    if (ready || attempts > 40) {
      window.clearInterval(listen);
      return;
    }
    attempts += 1;
    post({ event: 'listening' });
  }, 250);

  return {
    element: iframe,
    get muted() {
      return muted;
    },
    unMute() {
      command('unMute');
      command('playVideo');
      muted = false;
      callbacks.onMutedChange?.(false);
    },
    mute() {
      command('mute');
      muted = true;
      callbacks.onMutedChange?.(true);
    },
    destroy() {
      window.clearInterval(listen);
      window.removeEventListener('message', onMessage);
      iframe.remove();
    },
  };
}

/** Creates the player inside `host` (an element sized like the screen). */
export async function createTrailerPlayer(
  videoId: string,
  host: HTMLElement,
  callbacks: PlayerCallbacks = {},
): Promise<TrailerPlayer> {
  const api = await loadYouTubeApi();
  return api ? viaApi(api, videoId, host, callbacks) : viaMessages(videoId, host, callbacks);
}

/** Error codes that mean the uploader does not allow the video on other sites. */
export function isEmbedBlocked(code: number): boolean {
  return code === 101 || code === 150 || code === 153;
}
