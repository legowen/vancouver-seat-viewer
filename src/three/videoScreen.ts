import { Scene, type PerspectiveCamera } from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { loadYouTubeApi, postPlayerCommand, type YouTubePlayer } from '../youtube/api';
import { embedUrl } from '../youtube/embed';
import type { VideoRect } from './auditoriumModel';

/**
 * idle: nothing mounted · loading: the player is starting · muted: playing without sound
 * · playing: playing with sound · failed: cannot play here, use the fallback.
 */
export type VideoState = 'idle' | 'loading' | 'muted' | 'playing' | 'failed';

/** The screen is laid out this many CSS pixels wide and scaled down onto the 3D screen. */
const HOST_WIDTH = 1280;
const VIDEO_ASPECT = 16 / 9;
const READY_TIMEOUT_MS = 15_000;

/** Whether the browser can place an element in 3D space at all. */
export function css3dSupported(): boolean {
  try {
    return (
      typeof CSS !== 'undefined' &&
      CSS.supports('transform-style', 'preserve-3d') &&
      CSS.supports('transform', 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)')
    );
  } catch {
    return false;
  }
}

/**
 * A YouTube iframe placed exactly on the screen plane with CSS3DRenderer. Its layer sits
 * under the transparent WebGL canvas, which cuts a hole where the picture is and draws the
 * heads in front on top, so the audience hides the bottom of the picture as in a real room.
 */
export class VideoScreen {
  private readonly renderer = new CSS3DRenderer();
  private readonly scene = new Scene();
  private object: CSS3DObject | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private fill = false;
  private player: YouTubePlayer | null = null;
  private timeout = 0;
  private current: VideoState = 'idle';

  constructor(
    stage: HTMLElement,
    /** The whole screen. The player sits in a box this shape, clipped to it. */
    private readonly screenRect: VideoRect,
    /** The 16:9 area a trailer covers when shown whole. */
    private readonly videoRect: VideoRect,
    private readonly videoId: string,
    private readonly title: string,
    private readonly onState: (state: VideoState) => void,
  ) {
    this.renderer.domElement.classList.add('view__css3d');
    stage.prepend(this.renderer.domElement);
  }

  get state(): VideoState {
    return this.current;
  }

  get mounted(): boolean {
    return this.object !== null;
  }

  /** Adds the player to the screen. Call once the camera is seated and still. */
  mount(): void {
    if (this.object || this.current === 'failed') return;
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl(this.videoId, window.location.origin);
    iframe.title = this.title;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    // YouTube refuses to play embeds that send no referrer.
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.className = 'view__video';

    // A box the shape of the whole screen, clipping the player when it is cropped to fill it.
    const host = document.createElement('div');
    host.className = 'view__video-host';
    host.style.width = `${HOST_WIDTH}px`;
    host.style.height = `${this.hostHeight()}px`;
    host.append(iframe);

    const object = new CSS3DObject(host);
    object.position.copy(this.screenRect.center);
    object.scale.setScalar(this.screenRect.width / HOST_WIDTH);
    this.scene.add(object);
    this.object = object;
    this.iframe = iframe;
    this.sizePlayer();
    this.setState('loading');

    iframe.addEventListener(
      'load',
      () => {
        if (this.iframe === iframe && this.current === 'loading') this.setState('muted');
      },
      { once: true },
    );
    this.timeout = window.setTimeout(() => {
      if (this.iframe === iframe && this.current === 'loading') this.fail();
    }, READY_TIMEOUT_MS);
    void this.attachApi(iframe);
  }

  /** Removes the player (and stops the video). */
  unmount(): void {
    window.clearTimeout(this.timeout);
    try {
      this.player?.destroy();
    } catch {
      // The player may already be gone with its iframe.
    }
    this.player = null;
    if (this.object) {
      this.scene.remove(this.object);
      this.object.element.remove();
    }
    this.object = null;
    this.iframe = null;
    if (this.current !== 'failed') this.setState('idle');
  }

  /** Turns the sound on. Must run inside a click handler so browsers allow it. */
  unmute(): void {
    if (this.player) {
      this.player.unMute();
      this.player.playVideo();
    } else if (this.iframe) {
      postPlayerCommand(this.iframe, 'unMute');
      postPlayerCommand(this.iframe, 'playVideo');
    }
    if (this.current === 'muted') this.setState('playing');
  }

  /** Shows the 16:9 player whole (false) or cropped to cover the whole screen (true). */
  setFill(fill: boolean): void {
    this.fill = fill;
    this.sizePlayer();
  }

  /** Gives up on the player by hand ("Video not showing?"): the still frame comes back. */
  giveUp(): void {
    if (this.current !== 'failed') this.fail();
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height);
  }

  /** Re-places the iframe for the current camera. Called whenever the WebGL view renders. */
  render(camera: PerspectiveCamera): void {
    if (this.object) this.renderer.render(this.scene, camera);
  }

  dispose(): void {
    this.unmount();
    this.renderer.domElement.remove();
  }

  private hostHeight(): number {
    return Math.round((HOST_WIDTH * this.screenRect.height) / this.screenRect.width);
  }

  private sizePlayer(): void {
    if (!this.iframe) return;
    const width = this.fill
      ? Math.max(HOST_WIDTH, this.hostHeight() * VIDEO_ASPECT)
      : (HOST_WIDTH * this.videoRect.width) / this.screenRect.width;
    this.iframe.style.width = `${width}px`;
    this.iframe.style.height = `${width / VIDEO_ASPECT}px`;
  }

  private fail(): void {
    this.setState('failed');
    this.unmount();
  }

  private setState(state: VideoState): void {
    if (state === this.current) return;
    this.current = state;
    this.onState(state);
  }

  private async attachApi(iframe: HTMLIFrameElement): Promise<void> {
    try {
      const api = await loadYouTubeApi();
      if (this.iframe !== iframe) return;
      this.player = new api.Player(iframe, {
        events: {
          onReady: () => {
            if (this.iframe === iframe && this.current === 'loading') this.setState('muted');
          },
          // Removed, private or not embeddable: fall back to the still frame.
          onError: () => {
            if (this.iframe === iframe) this.fail();
          },
        },
      });
    } catch {
      // The API is optional: the video still plays muted with YouTube's own controls,
      // and "Tap for sound" falls back to messaging the player directly.
    }
  }
}
