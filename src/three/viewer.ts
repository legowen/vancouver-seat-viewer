import { Euler, PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer } from 'three';
import { VIEW } from '../config/view';
import type { AuditoriumLayout, SeatPosition } from '../metrics/layout';
import { buildAuditoriumModel, type AuditoriumModel } from './auditoriumModel';
import { loadPosterTexture } from './textures';
import { css3dSupported, VideoScreen, type VideoState } from './videoScreen';
import { WalkIn, type CameraPose } from './walkIn';

const DEG = Math.PI / 180;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export type ViewerMode = 'walking' | 'seated';

export interface SeatViewerOptions {
  /** The element the canvas fills. It also receives drag and keyboard input. */
  stage: HTMLElement;
  layout: AuditoriumLayout;
  seat: SeatPosition;
  /** YouTube id: its still frame shows on the screen, and the video plays once seated. */
  videoId: string | null;
  /** Used as the player's accessible title. */
  videoTitle?: string;
  /** Skip the embedded player and keep the still frame (the "Open trailer" fallback). */
  forceVideoFallback?: boolean;
  /** Start with the walk-in animation. Ignored when `reducedMotion` is set. */
  walkIn?: boolean;
  /** Cut every animation (prefers-reduced-motion). */
  reducedMotion?: boolean;
  onModeChange?(mode: ViewerMode): void;
  onVideoStateChange?(state: VideoState): void;
}

/**
 * Renders an auditorium from one seat. After an optional walk-in, the camera sits at the
 * seat's eye position, aimed at the centre of the screen, and can be turned a little by
 * dragging or with the arrow keys.
 *
 * While seated, frames are only drawn when something changed, which keeps phones cool.
 */
export class SeatViewer {
  readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(60, 1, 0.05, 200);
  private model: AuditoriumModel;
  private layout: AuditoriumLayout;
  private readonly events = new AbortController();
  private readonly resizeObserver: ResizeObserver;
  private seat: SeatPosition;
  private mode: ViewerMode = 'seated';
  private walk: WalkIn | null = null;
  private lastFrame = 0;
  private video: VideoScreen | null = null;
  private videoStatus: VideoState = 'idle';
  private mountTimer = 0;
  /** Look offsets from straight at the screen centre, in degrees. Positive = right / up. */
  private yaw = 0;
  private pitch = 0;
  private recentring: { fromYaw: number; fromPitch: number; start: number } | null = null;
  private drag: { id: number; x: number; y: number } | null = null;
  private dirty = true;
  private frame = 0;
  private disposed = false;

  constructor(private readonly options: SeatViewerOptions) {
    const { stage, layout, seat } = options;
    this.seat = seat;
    this.layout = layout;

    // Throws when WebGL is unavailable; the caller shows a message instead.
    this.renderer = new WebGLRenderer({ antialias: window.devicePixelRatio < 2, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.classList.add('view__canvas');
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    stage.prepend(this.renderer.domElement);

    this.model = buildAuditoriumModel(layout, seat);
    this.scene.add(this.model.group);

    if (options.videoId) {
      if (options.forceVideoFallback || !css3dSupported()) {
        this.videoStatus = 'failed';
      } else {
        this.video = new VideoScreen(
          stage,
          this.model.videoRect,
          options.videoId,
          options.videoTitle ?? 'YouTube',
          (state) => this.handleVideoState(state),
        );
      }
    }

    if (options.videoId) {
      void loadPosterTexture(options.videoId).then((texture) => {
        if (this.disposed) {
          texture?.dispose();
          return;
        }
        if (texture) {
          this.model.setPoster(texture);
          this.invalidate();
        }
      });
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(stage);
    this.bindInput();
    if (options.walkIn !== false && !options.reducedMotion) {
      this.startWalk();
    } else {
      this.updateCamera();
      this.scheduleVideo();
    }
    this.frame = requestAnimationFrame(this.tick);
  }

  get currentMode(): ViewerMode {
    return this.mode;
  }

  get videoState(): VideoState {
    return this.videoStatus;
  }

  /** "Tap for sound". Call from a click handler. */
  unmuteVideo(): void {
    this.video?.unmute();
  }

  /** Plays the walk from the door to the seat again. */
  replayWalk(): void {
    if (this.options.reducedMotion) return;
    this.startWalk();
  }

  /** Jumps straight to the seat. */
  skipWalk(): void {
    if (this.mode === 'walking') this.finishWalk();
  }

  /** Smoothly turns back to face the screen centre. */
  recentre(): void {
    if (this.mode !== 'seated' || (this.yaw === 0 && this.pitch === 0)) return;
    if (this.options.reducedMotion) {
      this.yaw = 0;
      this.pitch = 0;
      this.updateCamera();
      return;
    }
    this.recentring = { fromYaw: this.yaw, fromPitch: this.pitch, start: performance.now() };
    this.invalidate();
  }

  /** Turns the view by the given angles, within the drag-to-look limits. */
  lookBy(yawDegrees: number, pitchDegrees: number): void {
    if (this.mode !== 'seated') return;
    this.recentring = null;
    this.yaw = clamp(this.yaw + yawDegrees, -VIEW.maxYaw, VIEW.maxYaw);
    this.pitch = clamp(this.pitch + pitchDegrees, -VIEW.maxPitch, VIEW.maxPitch);
    this.updateCamera();
  }

  /** Swaps in a different auditorium (the editor's live preview) without a new WebGL context. */
  setLayout(layout: AuditoriumLayout, seat: SeatPosition): void {
    this.endWalk();
    this.scene.remove(this.model.group);
    this.model.dispose();
    this.layout = layout;
    this.model = buildAuditoriumModel(layout, seat);
    this.scene.add(this.model.group);
    this.setSeat(seat);
  }

  /** Moves straight to another seat, facing the screen. */
  setSeat(seat: SeatPosition): void {
    this.endWalk();
    this.seat = seat;
    this.yaw = 0;
    this.pitch = 0;
    this.recentring = null;
    this.model.setViewerSeat(seat);
    this.setMode('seated');
    this.updateCamera();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.events.abort();
    this.resizeObserver.disconnect();
    this.endWalk();
    window.clearTimeout(this.mountTimer);
    this.video?.dispose();
    this.model.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private setMode(mode: ViewerMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'seated') this.scheduleVideo();
    this.options.onModeChange?.(mode);
  }

  /** Mounts the player once the camera has been seated and still for a moment. */
  private scheduleVideo(): void {
    window.clearTimeout(this.mountTimer);
    if (!this.video || this.video.mounted) return;
    this.mountTimer = window.setTimeout(() => {
      if (this.mode !== 'seated') return;
      if (this.recentring || this.drag) this.scheduleVideo();
      else this.video?.mount();
    }, 400);
  }

  private handleVideoState(state: VideoState): void {
    this.videoStatus = state;
    // The picture shows through the canvas only while the player is actually there.
    this.model.setVideoHole(state === 'muted' || state === 'playing');
    this.invalidate();
    this.options.onVideoStateChange?.(state);
  }

  private startWalk(): void {
    this.endWalk();
    window.clearTimeout(this.mountTimer);
    this.video?.unmount();
    this.yaw = 0;
    this.pitch = 0;
    this.recentring = null;
    this.walk = new WalkIn(this.layout, this.seat, () => this.seatedPose());
    this.scene.add(this.walk.avatar.group);
    this.model.highlightSeat(this.seat);
    this.lastFrame = 0;
    this.setMode('walking');
    this.invalidate();
  }

  private finishWalk(): void {
    this.endWalk();
    this.setMode('seated');
    this.updateCamera();
  }

  private endWalk(): void {
    if (!this.walk) return;
    this.walk.dispose();
    this.walk = null;
    this.model.highlightSeat(null);
  }

  private invalidate(): void {
    this.dirty = true;
  }

  /** The horizontal field of view actually shown, which narrows on tall screens. */
  private horizontalFov(): number {
    return (2 * Math.atan(Math.tan((this.camera.fov * DEG) / 2) * this.camera.aspect)) / DEG;
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.options.stage;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.video?.setSize(width, height);
    const aspect = width / height;
    const vertical = (2 * Math.atan(Math.tan((VIEW.horizontalFov * DEG) / 2) / aspect)) / DEG;
    this.camera.aspect = aspect;
    this.camera.fov = Math.min(vertical, VIEW.maxVerticalFov);
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  /** Camera pose for the seat, looking at the screen centre plus the given look offsets. */
  private seatedPose(yawOffset = 0, pitchOffset = 0): CameraPose {
    const { seat } = this;
    const { screen } = this.layout;
    const dx = -seat.x;
    const dy = screen.centerY - seat.eyeY;
    const dz = -seat.z;
    const yaw = Math.atan2(dx, -dz) / DEG + yawOffset;
    const pitch = Math.atan2(dy, Math.hypot(dx, dz)) / DEG + pitchOffset;
    return {
      position: new Vector3(seat.x, seat.eyeY, seat.z),
      quaternion: new Quaternion().setFromEuler(new Euler(pitch * DEG, -yaw * DEG, 0, 'YXZ')),
    };
  }

  private updateCamera(): void {
    if (this.mode !== 'seated') return;
    const pose = this.seatedPose(this.yaw, this.pitch);
    this.camera.position.copy(pose.position);
    this.camera.quaternion.copy(pose.quaternion);
    this.invalidate();
  }

  private readonly tick = (now: number): void => {
    this.frame = requestAnimationFrame(this.tick);

    if (this.walk) {
      // Cap the step so a stalled tab does not jump to the end of the walk.
      const delta = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
      this.lastFrame = now;
      this.walk.update(delta, this.camera);
      this.renderer.render(this.scene, this.camera);
      this.video?.render(this.camera);
      if (this.walk.done) this.finishWalk();
      return;
    }

    if (this.recentring) {
      const progress = Math.min(1, (now - this.recentring.start) / VIEW.recentreMs);
      const remaining = 1 - easeInOut(progress);
      this.yaw = this.recentring.fromYaw * remaining;
      this.pitch = this.recentring.fromPitch * remaining;
      if (progress >= 1) this.recentring = null;
      this.updateCamera();
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    this.video?.render(this.camera);
  };

  private bindInput(): void {
    const { stage } = this.options;
    const signal = this.events.signal;

    stage.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button !== 0 || this.drag || this.mode !== 'seated') return;
        // Capturing the pointer would swallow clicks on the buttons laid over the view.
        if (event.target instanceof Element && event.target.closest('button, a, input, select')) {
          return;
        }
        this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        stage.setPointerCapture(event.pointerId);
        stage.classList.add('is-dragging');
      },
      { signal },
    );
    stage.addEventListener(
      'pointermove',
      (event) => {
        if (!this.drag || event.pointerId !== this.drag.id) return;
        const dx = event.clientX - this.drag.x;
        const dy = event.clientY - this.drag.y;
        this.drag.x = event.clientX;
        this.drag.y = event.clientY;
        // Grab-and-drag: the scene follows the finger, one degree per degree on screen.
        const degreesPerPixel = this.horizontalFov() / Math.max(1, stage.clientWidth);
        this.lookBy(-dx * degreesPerPixel, dy * degreesPerPixel);
      },
      { signal },
    );
    const endDrag = (event: PointerEvent) => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      this.drag = null;
      stage.classList.remove('is-dragging');
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    };
    stage.addEventListener('pointerup', endDrag, { signal });
    stage.addEventListener('pointercancel', endDrag, { signal });

    stage.addEventListener(
      'keydown',
      (event) => {
        if (this.mode === 'walking') {
          if (event.key === 'Escape') {
            event.preventDefault();
            this.skipWalk();
          }
          return;
        }
        const step = VIEW.keyStep;
        const turns: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, step],
          ArrowDown: [0, -step],
        };
        const turn = turns[event.key];
        if (turn) {
          event.preventDefault();
          this.lookBy(turn[0], turn[1]);
        } else if (event.key === 'Home') {
          event.preventDefault();
          this.recentre();
        }
      },
      { signal },
    );

    const canvas = this.renderer.domElement;
    canvas.addEventListener('webglcontextlost', (event) => event.preventDefault(), { signal });
    canvas.addEventListener('webglcontextrestored', () => this.invalidate(), { signal });
  }
}
