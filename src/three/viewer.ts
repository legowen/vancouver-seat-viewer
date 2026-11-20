import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { VIEW } from '../config/view';
import type { AuditoriumLayout, SeatPosition } from '../metrics/layout';
import { buildAuditoriumModel, type AuditoriumModel } from './auditoriumModel';
import { loadPosterTexture } from './textures';

const DEG = Math.PI / 180;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export interface SeatViewerOptions {
  /** The element the canvas fills. It also receives drag and keyboard input. */
  stage: HTMLElement;
  layout: AuditoriumLayout;
  seat: SeatPosition;
  /** YouTube id whose still frame is shown on the screen. */
  videoId: string | null;
  /** Skip animations (prefers-reduced-motion). */
  reducedMotion?: boolean;
}

/**
 * Renders an auditorium from one seat. The camera sits at the seat's eye position, aimed
 * at the centre of the screen, and can be turned a little by dragging or with the arrow keys.
 *
 * Frames are only drawn when something changed, which keeps phones cool while the user reads.
 */
export class SeatViewer {
  readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(60, 1, 0.05, 200);
  private readonly model: AuditoriumModel;
  private readonly events = new AbortController();
  private readonly resizeObserver: ResizeObserver;
  private seat: SeatPosition;
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

    // Throws when WebGL is unavailable; the caller shows a message instead.
    this.renderer = new WebGLRenderer({
      antialias: window.devicePixelRatio < 2,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.classList.add('view__canvas');
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    stage.prepend(this.renderer.domElement);

    this.model = buildAuditoriumModel(layout, seat);
    this.scene.add(this.model.group);

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
    this.updateCamera();
    this.frame = requestAnimationFrame(this.tick);
  }

  /** Smoothly turns back to face the screen centre. */
  recentre(): void {
    if (this.yaw === 0 && this.pitch === 0) return;
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
    this.recentring = null;
    this.yaw = clamp(this.yaw + yawDegrees, -VIEW.maxYaw, VIEW.maxYaw);
    this.pitch = clamp(this.pitch + pitchDegrees, -VIEW.maxPitch, VIEW.maxPitch);
    this.updateCamera();
  }

  /** Moves straight to another seat, facing the screen. */
  setSeat(seat: SeatPosition): void {
    this.seat = seat;
    this.yaw = 0;
    this.pitch = 0;
    this.recentring = null;
    this.model.setViewerSeat(seat);
    this.updateCamera();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.events.abort();
    this.resizeObserver.disconnect();
    this.model.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
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
    const aspect = width / height;
    const vertical = (2 * Math.atan(Math.tan((VIEW.horizontalFov * DEG) / 2) / aspect)) / DEG;
    this.camera.aspect = aspect;
    this.camera.fov = Math.min(vertical, VIEW.maxVerticalFov);
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  private updateCamera(): void {
    const { seat } = this;
    const { screen } = this.options.layout;
    // Straight at the screen centre…
    const dx = -seat.x;
    const dy = screen.centerY - seat.eyeY;
    const dz = -seat.z;
    const baseYaw = Math.atan2(dx, -dz) / DEG;
    const basePitch = Math.atan2(dy, Math.hypot(dx, dz)) / DEG;
    // …plus whatever the user dragged.
    this.camera.position.set(seat.x, seat.eyeY, seat.z);
    this.camera.rotation.set((basePitch + this.pitch) * DEG, -(baseYaw + this.yaw) * DEG, 0, 'YXZ');
    this.invalidate();
  }

  private readonly tick = (now: number): void => {
    this.frame = requestAnimationFrame(this.tick);
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
  };

  private bindInput(): void {
    const { stage } = this.options;
    const signal = this.events.signal;

    stage.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button !== 0 || this.drag) return;
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
