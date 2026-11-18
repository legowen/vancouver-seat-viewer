/**
 * Renderer, camera and frame loop. Frames are drawn on demand: the loop runs only while
 * something animates (or a redraw was requested) and then stops, so a still seated view costs
 * no battery.
 */
import { PerspectiveCamera, Scene, Timer, WebGLRenderer } from 'three';
import { horizontalFov, insetProjection, verticalFov } from './camera';

/** Called every frame with the time step in seconds. Returns true while it still animates. */
export type Updater = (dt: number) => boolean;
/** Extra drawing after the WebGL pass (the CSS3D video layer). */
export type RenderHook = (scene: Scene, camera: PerspectiveCamera) => void;

export class WebGLUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('WebGL is not available', { cause });
    this.name = 'WebGLUnavailableError';
  }
}

export const MAX_PIXEL_RATIO = 2;

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(60, 1, 0.05, 250);
  readonly element: HTMLElement;

  /** CSS pixels of the canvas covered by a card at the bottom. */
  private bottomInset = 0;
  private width = 1;
  private height = 1;
  private readonly updaters = new Set<Updater>();
  private readonly renderHooks = new Set<RenderHook>();
  private readonly resizeHooks = new Set<(width: number, height: number) => void>();
  private readonly timer = new Timer();
  private running = false;
  private disposed = false;
  private readonly observer: ResizeObserver;
  onContextLost: (() => void) | null = null;
  onContextRestored: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.element = container;
    try {
      this.renderer = new WebGLRenderer({
        antialias: (window.devicePixelRatio || 1) < 2,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (error) {
      throw new WebGLUnavailableError(error);
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.classList.add('stage__canvas');
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
    container.appendChild(canvas);

    this.timer.connect(document);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  // Phones drop the GL context when memory is short and usually give it back: preventDefault
  // asks for that, three.js re-uploads everything on restore, and drawing simply resumes.
  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    this.stopLoop();
    this.onContextLost?.();
  };

  private readonly handleContextRestored = () => {
    this.onContextRestored?.();
    this.requestRender();
  };

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Field of view across the canvas width, for converting drags into angles. */
  get horizontalFov(): number {
    const aspect = this.width / this.height;
    return horizontalFov(verticalFov(aspect), aspect);
  }

  setBottomInset(pixels: number): void {
    if (Math.abs(pixels - this.bottomInset) < 0.5) return;
    this.bottomInset = pixels;
    this.updateProjection();
    this.requestRender();
  }

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.element.clientWidth);
    const height = Math.max(1, this.element.clientHeight);
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height);
    this.updateProjection();
    for (const hook of this.resizeHooks) hook(width, height);
    this.requestRender();
  }

  private updateProjection(): void {
    const { camera, width, height } = this;
    const vertical = verticalFov(width / height);
    const projection = insetProjection(width, height, this.bottomInset, vertical);
    camera.fov = projection.fov;
    camera.aspect = projection.aspect;
    if (projection.offsetY > 0) {
      camera.setViewOffset(width, projection.fullHeight, 0, projection.offsetY, width, height);
    } else {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
  }

  addUpdater(updater: Updater): () => void {
    this.updaters.add(updater);
    this.requestRender();
    return () => this.updaters.delete(updater);
  }

  addRenderHook(hook: RenderHook): () => void {
    this.renderHooks.add(hook);
    return () => this.renderHooks.delete(hook);
  }

  onResize(hook: (width: number, height: number) => void): () => void {
    this.resizeHooks.add(hook);
    return () => this.resizeHooks.delete(hook);
  }

  /** Draws a frame soon, and keeps drawing while any updater is busy. */
  requestRender(): void {
    if (this.disposed || this.running) return;
    this.running = true;
    this.timer.update(); // start the next delta from now, not from the last frame drawn
    this.renderer.setAnimationLoop(this.frame);
  }

  private stopLoop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private readonly frame = (timestamp?: number) => {
    this.timer.update(timestamp);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    let busy = false;
    for (const updater of [...this.updaters]) {
      if (updater(dt)) busy = true;
    }
    this.renderer.render(this.scene, this.camera);
    for (const hook of this.renderHooks) hook(this.scene, this.camera);
    if (!busy) this.stopLoop();
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    this.observer.disconnect();
    this.timer.dispose();
    this.updaters.clear();
    this.renderHooks.clear();
    this.resizeHooks.clear();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    const lost = this.renderer.getContext().isContextLost();
    this.renderer.dispose();
    // Releases the context right away instead of waiting for garbage collection.
    if (!lost) this.renderer.forceContextLoss();
    canvas.remove();
  }
}
