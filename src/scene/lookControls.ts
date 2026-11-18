/**
 * Drag-to-look for the seated view: a small, limited head turn (±40° yaw, ±20° pitch) that eases
 * towards where the finger or mouse puts it, plus arrow keys and a recentre.
 */
import { LOOK_LIMITS, clampLook, dragToLook, type LookAngles } from './camera';

export interface LookControlsOptions {
  /** Element that receives the drag (it also gets `touch-action: none`). */
  element: HTMLElement;
  /** Width in CSS pixels and horizontal field of view of the view, read at drag time. */
  viewport: () => { width: number; horizontalFov: number };
  /** Ask for frames while the look is moving. */
  requestFrames: () => void;
}

const KEY_STEP = 6;

export class LookControls {
  /** Current look offset from straight at the screen centre (°). */
  readonly current: LookAngles = { yaw: 0, pitch: 0 };
  private target: LookAngles = { yaw: 0, pitch: 0 };
  private pointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private enabledFlag = false;
  private readonly options: LookControlsOptions;
  private readonly reducedMotion =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  constructor(options: LookControlsOptions) {
    this.options = options;
    const { element } = options;
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('lostpointercapture', this.onPointerUp);
    element.addEventListener('keydown', this.onKeyDown);
  }

  get enabled(): boolean {
    return this.enabledFlag;
  }

  set enabled(value: boolean) {
    this.enabledFlag = value;
    if (!value) this.pointerId = null;
  }

  /** True when the view is turned away from the screen centre. */
  get isTurned(): boolean {
    return Math.abs(this.target.yaw) > 0.5 || Math.abs(this.target.pitch) > 0.5;
  }

  recentre(): void {
    this.target = { yaw: 0, pitch: 0 };
    this.options.requestFrames();
  }

  /** Jumps to straight ahead without easing (used when the camera is placed from elsewhere). */
  reset(): void {
    this.target = { yaw: 0, pitch: 0 };
    this.current.yaw = 0;
    this.current.pitch = 0;
  }

  nudge(yaw: number, pitch: number): void {
    this.target = clampLook({ yaw: this.target.yaw + yaw, pitch: this.target.pitch + pitch });
    this.options.requestFrames();
  }

  /** Eases the current look towards the target. Returns true while still moving. */
  update(dt: number): boolean {
    const ease = this.reducedMotion?.matches ? 1 : 1 - Math.exp(-14 * dt);
    this.current.yaw += (this.target.yaw - this.current.yaw) * ease;
    this.current.pitch += (this.target.pitch - this.current.pitch) * ease;
    const moving =
      Math.abs(this.target.yaw - this.current.yaw) > 0.02 ||
      Math.abs(this.target.pitch - this.current.pitch) > 0.02;
    if (!moving) {
      this.current.yaw = this.target.yaw;
      this.current.pitch = this.target.pitch;
    }
    // A finger resting on the screen needs no frames: pointermove asks again when it moves.
    return moving;
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.enabledFlag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    this.pointerId = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    try {
      this.options.element.setPointerCapture(event.pointerId);
    } catch {
      // Capture is a nicety; dragging still works inside the element.
    }
    this.options.requestFrames();
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;
    const { width, horizontalFov } = this.options.viewport();
    const delta = dragToLook(
      event.clientX - this.lastX,
      event.clientY - this.lastY,
      width,
      horizontalFov,
    );
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.target = clampLook(
      { yaw: this.target.yaw + delta.yaw, pitch: this.target.pitch + delta.pitch },
      LOOK_LIMITS,
    );
    this.options.requestFrames();
  };

  private readonly onPointerUp = (event: Event) => {
    if (event instanceof PointerEvent && event.pointerId !== this.pointerId) return;
    this.pointerId = null;
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (!this.enabledFlag) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [KEY_STEP, 0],
      ArrowRight: [-KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      this.nudge(move[0], move[1]);
    } else if (event.key === 'Home' || event.key === '0') {
      event.preventDefault();
      this.recentre();
    }
  };

  dispose(): void {
    const { element } = this.options;
    element.removeEventListener('pointerdown', this.onPointerDown);
    element.removeEventListener('pointermove', this.onPointerMove);
    element.removeEventListener('pointerup', this.onPointerUp);
    element.removeEventListener('pointercancel', this.onPointerUp);
    element.removeEventListener('lostpointercapture', this.onPointerUp);
    element.removeEventListener('keydown', this.onKeyDown);
  }
}
