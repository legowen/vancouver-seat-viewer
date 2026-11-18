/**
 * The 3D view of one seat: builds the room and the audience, and puts the camera at the
 * seat's eye position aimed at the screen centre. This module (with three.js) is loaded on
 * demand by the seat view, so the rest of the app stays light.
 */
import type { Auditorium } from '../data/resolve';
import type { AuditoriumLayout, SeatPosition } from '../geometry/layout';
import { aimAngles } from './camera';
import { buildHeads } from './heads';
import { LookControls } from './lookControls';
import { occupantsInFront } from './occupancy';
import { buildRoom } from './room';
import { Stage } from './stage';

export { WebGLUnavailableError } from './stage';

export interface SeatSceneOptions {
  /** Element the canvas goes into. It receives drags and arrow keys, so make it focusable. */
  container: HTMLElement;
  auditorium: Auditorium;
  layout: AuditoriumLayout;
  seatId: string;
  /** CSS pixels at the bottom covered by the info card. */
  bottomInset?: number;
  /** The look moved away from, or back to, the screen centre. */
  onTurnedChange?: (turned: boolean) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

export interface SeatScene {
  readonly seat: SeatPosition;
  recentre(): void;
  setBottomInset(pixels: number): void;
  dispose(): void;
}

const RAD = Math.PI / 180;

export function createSeatScene(options: SeatSceneOptions): SeatScene {
  const { auditorium, layout, seatId, container } = options;
  const seat = layout.seatById.get(seatId);
  if (!seat) throw new Error(`Unknown seat ${seatId}`);

  const stage = new Stage(container);
  stage.onContextLost = () => options.onContextLost?.();
  stage.onContextRestored = () => options.onContextRestored?.();
  let room: ReturnType<typeof buildRoom>;
  let heads: ReturnType<typeof buildHeads>;
  try {
    room = buildRoom(auditorium, layout);
    stage.scene.add(room.group);
    heads = buildHeads(occupantsInFront(auditorium.id, layout, seatId), auditorium.eyeHeight_m);
    stage.scene.add(heads.group);
  } catch (error) {
    stage.dispose();
    throw error;
  }

  // Seated: the camera sits at the eye and looks at the screen centre, plus the head turn.
  const { camera } = stage;
  const base = aimAngles(seat.eye, layout.screen.centre);
  camera.position.set(seat.eye.x, seat.eye.y, seat.eye.z);

  const look = new LookControls({
    element: container,
    viewport: () => ({ width: stage.size.width, horizontalFov: stage.horizontalFov }),
    requestFrames: () => stage.requestRender(),
  });
  look.enabled = true;

  let turned = false;
  const applyCamera = () => {
    camera.rotation.set(
      base.pitch + look.current.pitch * RAD,
      base.yaw + look.current.yaw * RAD,
      0,
      'YXZ',
    );
    if (look.isTurned !== turned) {
      turned = look.isTurned;
      options.onTurnedChange?.(turned);
    }
  };
  applyCamera();
  stage.addUpdater((dt) => {
    const busy = look.update(dt);
    applyCamera();
    return busy;
  });
  stage.setBottomInset(options.bottomInset ?? 0);

  return {
    seat,
    recentre: () => look.recentre(),
    setBottomInset: (pixels) => stage.setBottomInset(pixels),
    dispose() {
      look.dispose();
      heads.dispose();
      room.dispose();
      stage.dispose();
    },
  };
}
