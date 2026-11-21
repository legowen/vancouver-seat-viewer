import {
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type PerspectiveCamera,
  type Quaternion,
} from 'three';
import { WALK } from '../config/walk';
import type { AuditoriumLayout, SeatPosition } from '../metrics/layout';
import { roomShape, type RoomShape } from '../scene/room';
import { planWalk, pointAlong, smoothFloorAt, type WalkPlan } from '../scene/walkPath';
import { createAvatar, type Avatar } from './avatar';

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** Shortest signed difference between two angles. */
function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export interface CameraPose {
  position: Vector3;
  quaternion: Quaternion;
}

/**
 * The walk-in: the avatar comes in through the door, walks along the side aisle, climbs
 * to the row, side-steps to the seat and sits, while a third-person camera follows and then
 * glides into first person at the seat's eye position.
 */
export class WalkIn {
  readonly avatar: Avatar;
  /** The avatar plus the arrow over the target seat: add this to the scene. */
  readonly group = new Group();
  private readonly marker: Mesh<ConeGeometry, MeshBasicMaterial>;
  private readonly markerY: number;
  readonly plan: WalkPlan;
  private readonly room: RoomShape;
  private elapsed = 0;
  private heading: number;
  private readonly cameraPosition = new Vector3();
  private readonly cameraTarget = new Vector3();
  private sitStart: CameraPose | null = null;

  constructor(
    private readonly layout: AuditoriumLayout,
    private readonly seat: SeatPosition,
    /** The seated first-person pose the camera ends in. */
    private readonly seatedPose: () => CameraPose,
  ) {
    this.room = roomShape(layout);
    this.plan = planWalk(layout, seat);
    this.avatar = createAvatar();
    // A soft arrow bobbing over the seat being walked to.
    this.marker = new Mesh(
      new ConeGeometry(0.11, 0.24, 16),
      new MeshBasicMaterial({ color: 0xf5b942, toneMapped: false }),
    );
    this.marker.rotation.x = Math.PI;
    this.markerY = seat.floorY + (layout.auditorium.type === 'vip' ? 1.75 : 1.6);
    this.marker.position.set(seat.x, this.markerY, seat.z + 0.05);
    this.group.add(this.avatar.group, this.marker);
    this.heading = pointAlong(this.plan, 0).heading;
  }

  get done(): boolean {
    return this.elapsed >= this.plan.totalDuration;
  }

  /** Advances the animation by `deltaSeconds` and poses the avatar and the camera. */
  update(deltaSeconds: number, camera: PerspectiveCamera): void {
    const first = this.elapsed === 0;
    this.elapsed = Math.min(this.plan.totalDuration, this.elapsed + deltaSeconds);
    const { plan, avatar } = this;

    // Ease in and out of the walk so the avatar does not start or stop dead.
    const walkT = clamp01(this.elapsed / plan.walkDuration);
    const travelled = plan.length * easeInOut(walkT);
    const point = pointAlong(plan, travelled);
    const sitT = clamp01((this.elapsed - plan.walkDuration) / plan.sitDuration);
    const settle = easeInOut(clamp01((sitT - 0.2) / 0.45));

    // Face the way you walk, except along the row, where you side-step facing the screen.
    const alongRow = point.leg === plan.waypoints.length - 2;
    const wanted = sitT > 0 || alongRow ? Math.PI : point.heading;
    const turn = first ? 1 : 1 - Math.exp(-12 * deltaSeconds);
    this.heading += angleDelta(this.heading, wanted) * turn;

    // Back into the seat while sitting down.
    const z = point.z + (this.seat.z + 0.02 - point.z) * settle;
    avatar.group.position.set(point.x, smoothFloorAt(this.layout, z), z);
    avatar.group.rotation.y = this.heading;
    const speed = plan.length / plan.walkDuration;
    const strideNow = walkT < 1 ? Math.min(1, 4 * walkT * (1 - walkT) + 0.25) : 0;
    avatar.pose({
      lean: Math.min(1, Math.max(0, (speed - 1.8) / 2.5)) * strideNow,
      phase: (travelled / Math.max(0.5, speed * 0.28)) * Math.PI,
      stride: strideNow,
      sit: settle,
    });

    this.marker.position.y = this.markerY + Math.sin(this.elapsed * 4) * 0.05;
    // The arrow goes once the avatar sits, or sooner if the camera comes close to it.
    this.marker.visible = sitT < 0.3 && camera.position.distanceTo(this.marker.position) > 1.4;

    if (sitT <= 0) {
      // Frame-rate independent smoothing; the first frame snaps into place.
      const smoothing = first ? 1 : 1 - Math.exp(-WALK.follow.damping * deltaSeconds);
      this.follow(camera, point.heading, smoothing);
      return;
    }

    // Glide from the follow camera into the seated first-person view.
    this.sitStart ??= {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
    };
    const end = this.seatedPose();
    const blend = easeInOut(sitT);
    camera.position.lerpVectors(this.sitStart.position, end.position, blend);
    camera.quaternion.slerpQuaternions(this.sitStart.quaternion, end.quaternion, blend);
    // Hide the avatar just before the camera reaches its head.
    avatar.group.visible = blend < 0.85;
  }

  /**
   * Third-person camera: behind and above the avatar, looking a little ahead of it. When a
   * wall is in the way (walking away from the door, say), it swings round to the first
   * angle that keeps it inside the room.
   */
  private follow(camera: PerspectiveCamera, travelHeading: number, smoothing: number): void {
    const { back, up, lookAhead, lookUp } = WALK.follow;
    const base = this.avatar.group.position;
    const forwardX = Math.sin(travelHeading);
    const forwardZ = Math.cos(travelHeading);
    const { room } = this;
    const inset = 0.35;
    const inside = (x: number, z: number) =>
      Math.abs(x) <= room.halfWidth - inset && z >= inset && z <= room.back - inset;

    let desired: Vector3 | null = null;
    for (const swing of CAMERA_SWINGS) {
      const angle = travelHeading + Math.PI + swing;
      const x = base.x + Math.sin(angle) * back;
      const z = base.z + Math.cos(angle) * back;
      if (inside(x, z)) {
        desired = new Vector3(x, base.y + up, z);
        break;
      }
    }
    desired ??= new Vector3(
      Math.min(room.halfWidth - inset, Math.max(-room.halfWidth + inset, base.x)),
      base.y + up,
      Math.min(room.back - inset, Math.max(inset, base.z + back)),
    );
    desired.y = Math.min(
      room.ceiling - inset,
      Math.max(smoothFloorAt(this.layout, desired.z) + 0.6, desired.y),
    );
    const target = new Vector3(
      base.x + forwardX * lookAhead,
      base.y + lookUp,
      base.z + forwardZ * lookAhead,
    );

    this.cameraPosition.lerp(desired, smoothing);
    this.cameraTarget.lerp(target, smoothing);
    camera.position.copy(this.cameraPosition);
    camera.lookAt(this.cameraTarget);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.marker.geometry.dispose();
    this.marker.material.dispose();
    this.avatar.dispose();
  }
}

/** Camera angles tried around "directly behind", nearest first (radians). */
const CAMERA_SWINGS = [0, 0.6, -0.6, 1.1, -1.1, 1.6, -1.6, 2.1, -2.1];
