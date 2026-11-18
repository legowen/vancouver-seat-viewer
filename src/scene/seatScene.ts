/**
 * The 3D view of one seat. Builds the room and the audience, plays the walk-in (a small avatar
 * walks from the entrance to the seat while a follow camera watches, then the camera settles at
 * the seat's eye position aimed at the screen centre), and then lets you look around a little.
 * This module (with three.js) is loaded on demand by the seat view.
 */
import {
  ConeGeometry,
  Euler,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Material,
  type PlaneGeometry,
  type Texture,
} from 'three';
import type { Auditorium } from '../data/resolve';
import { floorHeightAt, type AuditoriumLayout, type SeatPosition } from '../geometry/layout';
import { createAvatar } from './avatar';
import { aimAngles } from './camera';
import { buildHeads } from './heads';
import { LookControls } from './lookControls';
import { occupantsInFront } from './occupancy';
import { PALETTE } from './palette';
import { buildRoom } from './room';
import { loadScreenTexture } from './screenImage';
import { Stage } from './stage';
import { WALK_TIMING, ease, planWalk, sampleWalk } from './walk';

export { WebGLUnavailableError } from './stage';

export type ScenePhase = 'walking' | 'seated';

export interface SeatSceneOptions {
  /** Element the canvas goes into. It receives drags and arrow keys, so make it focusable. */
  container: HTMLElement;
  auditorium: Auditorium;
  layout: AuditoriumLayout;
  seatId: string;
  /** Play the walk-in first. Off (the default): start seated. */
  walkIn?: boolean;
  /** YouTube video whose still frame goes on the screen. */
  videoId?: string | null;
  /** CSS pixels at the bottom covered by the info card. */
  bottomInset?: number;
  onPhaseChange?: (phase: ScenePhase) => void;
  /** The look moved away from, or back to, the screen centre. */
  onTurnedChange?: (turned: boolean) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

export interface SeatScene {
  readonly seat: SeatPosition;
  readonly phase: ScenePhase;
  readonly stage: Stage;
  /** The projection surface, for the video layer. */
  readonly screen: Mesh<PlaneGeometry, Material>;
  /** The still frame, once loaded (null without a video or when it could not load). */
  readonly poster: Texture | null;
  recentre(): void;
  skipWalk(): void;
  replayWalk(): void;
  setBottomInset(pixels: number): void;
  dispose(): void;
}

const RAD = Math.PI / 180;
const UP = new Vector3(0, 1, 0);
/** How far the follow camera stays behind (towards the back of the room) and above the avatar. */
const FOLLOW = { back: 4.2, up: 2.8, minAboveFloor: 2.2, towardsCentre: 0.2, lookAtScreen: 0.15 };
/** The walk is squeezed into a few seconds: past this many steps a second the avatar runs. */
const MAX_CADENCE = 3.4;
const STEP_LENGTH = 0.55;
/** Hide the avatar and the seat marker when the camera comes closer than this (m). */
const NEAR = 1.4;

/** Turns `current` towards `target` along the short way round. */
function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-lambda * dt));
}

export function createSeatScene(options: SeatSceneOptions): SeatScene {
  const { auditorium, layout, seatId, container } = options;
  const seat = layout.seatById.get(seatId);
  if (!seat) throw new Error(`Unknown seat ${seatId}`);

  const stage = new Stage(container);
  stage.onContextLost = () => options.onContextLost?.();
  stage.onContextRestored = () => options.onContextRestored?.();
  let room: ReturnType<typeof buildRoom>;
  let heads: ReturnType<typeof buildHeads>;
  let avatar: ReturnType<typeof createAvatar>;
  try {
    room = buildRoom(auditorium, layout);
    stage.scene.add(room.group);
    heads = buildHeads(occupantsInFront(auditorium.id, layout, seatId), auditorium.eyeHeight_m);
    stage.scene.add(heads.group);
    avatar = createAvatar();
    avatar.setSeatHeight(auditorium.type === 'vip' ? 0.54 : 0.48);
    stage.scene.add(avatar.group);
  } catch (error) {
    stage.dispose();
    throw error;
  }

  // A soft arrow over the seat you are walking to.
  const markerShape = new ConeGeometry(0.11, 0.24, 16);
  const markerMaterial = new MeshBasicMaterial({ color: PALETTE.marker, toneMapped: false });
  const marker = new Mesh(markerShape, markerMaterial);
  marker.rotation.x = Math.PI;
  const markerY = seat.floorY + (auditorium.type === 'vip' ? 1.75 : 1.6);
  marker.position.set(seat.x, markerY, seat.z + 0.05);
  stage.scene.add(marker);

  // --- Seated camera ---
  const { camera } = stage;
  const base = aimAngles(seat.eye, layout.screen.centre);
  const eye = new Vector3(seat.eye.x, seat.eye.y, seat.eye.z);
  const seatedQuaternion = new Quaternion().setFromEuler(new Euler(base.pitch, base.yaw, 0, 'YXZ'));

  const look = new LookControls({
    element: container,
    viewport: () => ({ width: stage.size.width, horizontalFov: stage.horizontalFov }),
    requestFrames: () => stage.requestRender(),
  });

  let turned = false;
  const applySeatedCamera = () => {
    camera.position.copy(eye);
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

  // --- Walk-in ---
  const plan = planWalk(
    layout,
    auditorium.entrance,
    { z: room.door.z, side: room.door.side },
    seat,
  );
  const cameraStart = plan.sitEnd - WALK_TIMING.cameraOverlap;
  const screenCentre = new Vector3(0, layout.screen.centre.y, 0);
  const followPosition = new Vector3();
  const followTarget = new Vector3();
  const wantedPosition = new Vector3();
  const wantedTarget = new Vector3();
  const lookMatrix = new Matrix4();
  const followQuaternion = new Quaternion();
  let walkTime = 0;
  let heading = 0;
  let clock = 0;
  let steps = 0;
  const avatarHead = new Vector3();
  let phase: ScenePhase = options.walkIn ? 'walking' : 'seated';

  /** Where the follow camera wants to be for the avatar at (x, floorY, z). */
  function aimFollow(x: number, floorY: number, z: number): void {
    const { room: shell } = layout;
    const cameraZ = Math.min(z + FOLLOW.back, shell.backZ - 0.4);
    const cameraY = Math.min(
      Math.max(floorY + FOLLOW.up, floorHeightAt(layout, cameraZ, 0.35) + FOLLOW.minAboveFloor),
      shell.ceilingY - 0.3,
    );
    const cameraX = Math.max(
      -shell.halfWidth + 0.4,
      Math.min(shell.halfWidth - 0.4, x * (1 - FOLLOW.towardsCentre)),
    );
    wantedPosition.set(cameraX, cameraY, cameraZ);
    wantedTarget.set(x, floorY + 0.85, z).lerp(screenCentre, FOLLOW.lookAtScreen);
  }

  function placeAvatar(time: number, dt: number, snap: boolean): ReturnType<typeof sampleWalk> {
    const sample = sampleWalk(plan, time);
    const floorY = floorHeightAt(layout, sample.z, 0.35);
    avatar.group.position.set(sample.x, floorY, sample.z);
    heading = snap ? sample.heading : dampAngle(heading, sample.heading, 12, dt);
    avatar.group.rotation.y = heading;
    const moving = sample.phase === 'walk' || sample.phase === 'side';
    steps += dt * Math.min(MAX_CADENCE, sample.speed / STEP_LENGTH);
    avatar.pose({
      step: steps,
      stride: moving ? 1 : 0,
      run: moving ? Math.min(1, Math.max(0, (sample.speed - 2) / 4)) : 0,
      sit: ease(sample.sit),
    });
    avatarHead.set(sample.x, floorY + 0.95, sample.z);
    aimFollow(sample.x, floorY, sample.z);
    return sample;
  }

  function startWalk(): void {
    phase = 'walking';
    walkTime = 0;
    steps = 0;
    look.enabled = false;
    look.reset();
    avatar.group.visible = true;
    marker.visible = true;
    placeAvatar(0, 0, true);
    followPosition.copy(wantedPosition);
    followTarget.copy(wantedTarget);
    camera.position.copy(followPosition);
    camera.lookAt(followTarget);
    options.onPhaseChange?.('walking');
    stage.requestRender();
  }

  function finishWalk(): void {
    phase = 'seated';
    avatar.group.visible = false;
    marker.visible = false;
    look.reset();
    look.enabled = true;
    applySeatedCamera();
    options.onPhaseChange?.('seated');
    stage.requestRender();
  }

  function stepWalk(dt: number): boolean {
    walkTime += dt;
    clock += dt;
    if (walkTime >= plan.total) {
      finishWalk();
      return false;
    }
    placeAvatar(walkTime, dt, false);
    const follow = 1 - Math.exp(-7 * dt);
    followPosition.lerp(wantedPosition, follow);
    followTarget.lerp(wantedTarget, Math.min(1, follow * 1.4));
    lookMatrix.lookAt(followPosition, followTarget, UP);
    followQuaternion.setFromRotationMatrix(lookMatrix);
    // Settle into the seat: from the follow camera to the eye, looking at the screen centre.
    const settle = ease((walkTime - cameraStart) / WALK_TIMING.camera);
    camera.position.lerpVectors(followPosition, eye, settle);
    camera.quaternion.slerpQuaternions(followQuaternion, seatedQuaternion, settle);
    // The avatar is you: hide it (and the marker) before the camera gets too close.
    avatar.group.visible = settle < 0.5 && camera.position.distanceTo(avatarHead) > NEAR;
    marker.position.y = markerY + Math.sin(clock * 4) * 0.06;
    marker.rotation.y += dt * 1.5;
    marker.visible = walkTime < plan.walkEnd && camera.position.distanceTo(marker.position) > NEAR;
    return true;
  }

  stage.addUpdater((dt) => {
    if (phase === 'walking') return stepWalk(dt);
    const busy = look.update(dt);
    applySeatedCamera();
    return busy;
  });
  stage.setBottomInset(options.bottomInset ?? 0);
  if (phase === 'walking') {
    startWalk();
  } else {
    avatar.group.visible = false;
    marker.visible = false;
    look.enabled = true;
    applySeatedCamera();
    stage.requestRender();
  }

  // --- The still frame on the screen ---
  let poster: Texture | null = null;
  let posterMaterial: MeshBasicMaterial | null = null;
  let disposed = false;
  if (options.videoId) {
    void loadScreenTexture(options.videoId, layout.screen.width / layout.screen.height).then(
      (texture) => {
        if (!texture) return;
        if (disposed) {
          texture.dispose();
          return;
        }
        poster = texture;
        posterMaterial = new MeshBasicMaterial({ map: texture, toneMapped: false });
        room.screen.material = posterMaterial;
        stage.requestRender();
      },
    );
  }

  return {
    seat,
    get phase() {
      return phase;
    },
    stage,
    screen: room.screen,
    get poster() {
      return poster;
    },
    recentre: () => look.recentre(),
    skipWalk() {
      if (phase === 'walking') finishWalk();
    },
    replayWalk() {
      if (phase === 'seated') startWalk();
    },
    setBottomInset: (pixels) => stage.setBottomInset(pixels),
    dispose() {
      disposed = true;
      look.dispose();
      avatar.dispose();
      heads.dispose();
      markerShape.dispose();
      markerMaterial.dispose();
      posterMaterial?.dispose();
      poster?.dispose();
      room.dispose();
      stage.dispose();
    },
  };
}
