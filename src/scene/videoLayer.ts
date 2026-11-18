/**
 * The trailer on the 3D screen. A YouTube video cannot be a WebGL texture, so the official
 * embed is placed with CSS3DRenderer exactly on the screen plane, in a layer *under* the
 * transparent WebGL canvas. The screen mesh then draws fully transparent pixels (a "hole"), so the
 * video shows through, while the heads in front are still drawn on top of it.
 */
import {
  MeshBasicMaterial,
  NoBlending,
  Scene,
  type Material,
  type Mesh,
  type PlaneGeometry,
} from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { createTrailerPlayer, isEmbedBlocked, type TrailerPlayer } from '../youtube/player';
import type { Stage } from './stage';

export type VideoState = 'loading' | 'playing' | 'blocked' | 'failed';

export interface VideoLayerOptions {
  stage: Stage;
  screen: Mesh<PlaneGeometry, Material>;
  /** Screen size and centre height in metres. */
  width: number;
  height: number;
  centreY: number;
  videoId: string;
  /** Crop the 16:9 video to fill a wider screen instead of showing side bars. */
  fill: boolean;
  onState: (state: VideoState) => void;
  onMutedChange: (muted: boolean) => void;
}

/** Giving up on a player that never reports ready (blocked, offline, no CSS 3D). */
const READY_TIMEOUT_MS = 12000;
/** CSS pixels across the screen; the 3D transform scales this to the screen's real width. */
const SCREEN_PX = 1280;
const VIDEO_ASPECT = 16 / 9;

export function supportsCss3d(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports?.('transform-style', 'preserve-3d') === true;
}

export class VideoLayer {
  private readonly options: VideoLayerOptions;
  private readonly renderer = new CSS3DRenderer();
  private readonly cssScene = new Scene();
  private readonly host: HTMLDivElement;
  private readonly hole = new MeshBasicMaterial({
    color: 0x000000,
    opacity: 0,
    // Write the transparent pixel as is instead of blending it over what is behind.
    blending: NoBlending,
    toneMapped: false,
  });
  private readonly previousMaterial: Material;
  private readonly removeHooks: (() => void)[] = [];
  private player: TrailerPlayer | null = null;
  private readyTimer = 0;
  private state: VideoState = 'loading';
  private disposed = false;

  constructor(options: VideoLayerOptions) {
    this.options = options;
    const { stage } = options;
    this.previousMaterial = options.screen.material;

    const heightPx = Math.round((SCREEN_PX * options.height) / options.width);
    this.host = document.createElement('div');
    this.host.className = 'video-host';
    this.host.style.width = `${SCREEN_PX}px`;
    this.host.style.height = `${heightPx}px`;
    this.host.style.setProperty(
      '--fill-width',
      `${Math.max(SCREEN_PX, heightPx * VIDEO_ASPECT)}px`,
    );
    this.host.style.setProperty(
      '--fill-height',
      `${Math.max(SCREEN_PX, heightPx * VIDEO_ASPECT) / VIDEO_ASPECT}px`,
    );
    this.setFill(options.fill);

    const object = new CSS3DObject(this.host);
    object.position.set(0, options.centreY, 0);
    object.scale.setScalar(options.width / SCREEN_PX);
    this.cssScene.add(object);

    const layer = this.renderer.domElement;
    layer.classList.add('stage__video');
    stage.element.insertBefore(layer, stage.renderer.domElement);
    this.renderer.setSize(stage.size.width, stage.size.height);
    stage.element.classList.add('has-video');

    // Re-sync the iframe's 3D transform whenever the WebGL view is drawn (drag-look, resize).
    this.removeHooks.push(
      stage.addRenderHook((_scene, camera) => this.renderer.render(this.cssScene, camera)),
      stage.onResize((width, height) => this.renderer.setSize(width, height)),
    );
    stage.requestRender();

    this.readyTimer = window.setTimeout(() => this.setState('failed'), READY_TIMEOUT_MS);
    void createTrailerPlayer(options.videoId, this.host, {
      onReady: () => {
        window.clearTimeout(this.readyTimer);
        if (this.disposed || this.state !== 'loading') return;
        // Only now cut the hole: until the player is ready the poster stays on the screen.
        options.screen.material = this.hole;
        this.setState('playing');
        stage.requestRender();
      },
      onMutedChange: (muted) => options.onMutedChange(muted),
      onError: (code) => {
        window.clearTimeout(this.readyTimer);
        this.setState(isEmbedBlocked(code) ? 'blocked' : 'failed');
      },
    }).then((player) => {
      if (this.disposed) player.destroy();
      else this.player = player;
    });
  }

  private setState(state: VideoState): void {
    if (this.disposed || this.state === state) return;
    this.state = state;
    if (state === 'blocked' || state === 'failed') {
      // Put the poster back; the view offers "Open trailer" instead.
      this.options.screen.material = this.previousMaterial;
      this.options.stage.requestRender();
    }
    this.options.onState(state);
  }

  get current(): VideoState {
    return this.state;
  }

  setFill(fill: boolean): void {
    this.host.classList.toggle('is-fill', fill);
  }

  unMute(): void {
    this.player?.unMute();
  }

  mute(): void {
    this.player?.mute();
  }

  /** Gives up on the video by hand ("Video not showing?"). */
  giveUp(): void {
    window.clearTimeout(this.readyTimer);
    this.setState('failed');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearTimeout(this.readyTimer);
    for (const remove of this.removeHooks) remove();
    this.player?.destroy();
    this.player = null;
    this.options.screen.material = this.previousMaterial;
    this.options.stage.element.classList.remove('has-video');
    this.renderer.domElement.remove();
    this.hole.dispose();
    this.options.stage.requestRender();
  }
}
