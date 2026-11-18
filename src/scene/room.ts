/**
 * Builds the whole auditorium procedurally from its layout: stepped floor, walls, ceiling,
 * screen, wall sconces, entrance, and one InstancedMesh for all the seats.
 * World coordinates are the layout's: the screen is the plane z = 0 and faces +z.
 */
import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  Color,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Vector3,
  type Material,
  type Texture,
  type BufferGeometry,
} from 'three';
import { ROOM } from '../config/defaults';
import type { Auditorium } from '../data/resolve';
import { floorHeightAt, type AuditoriumLayout } from '../geometry/layout';
import { seatGeometry } from './models';
import { PALETTE } from './palette';
import { css, glowTexture, haloTexture, panelTexture } from './textures';

export interface Room {
  group: Group;
  /** The projection surface. Its material can be swapped for a poster or a video hole. */
  screen: Mesh<PlaneGeometry, Material>;
  seats: InstancedMesh;
  /** Instance index of each seat id in `seats`. */
  seatIndex: Map<string, number>;
  /** Where the entrance door is: x of the wall, z along it, floor height there. */
  door: { x: number; z: number; floorY: number; side: -1 | 1 };
  dispose(): void;
}

const UP = new Vector3(0, 1, 0);
const _matrix = new Matrix4();
const _quaternion = new Quaternion();
const _position = new Vector3();
const _scale = new Vector3();

function compose(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, yaw = 0): Matrix4 {
  return _matrix.compose(
    _position.set(x, y, z),
    _quaternion.setFromAxisAngle(UP, yaw),
    _scale.set(sx, sy, sz),
  );
}

export function buildRoom(auditorium: Auditorium, layout: AuditoriumLayout): Room {
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const textures: Texture[] = [];
  const track = <T extends BufferGeometry | Material | Texture>(item: T): T => {
    if ('isBufferGeometry' in item) geometries.push(item as BufferGeometry);
    else if ('isMaterial' in item) materials.push(item as Material);
    else textures.push(item as Texture);
    return item;
  };

  const group = new Group();
  group.name = 'auditorium';
  const { rows, room, screen: screenLayout } = layout;
  const halfWidth = room.halfWidth;
  const backZ = room.backZ;
  const ceiling = room.ceilingY;
  const unitBox = track(new BoxGeometry(1, 1, 1));
  const unitPlane = track(new PlaneGeometry(1, 1));

  // --- Stepped floor: one block per row, plus the flat area in front of the first row. ---
  const carpet = track(new MeshLambertMaterial({ color: PALETTE.carpet }));
  const floor = new InstancedMesh(unitBox, carpet, Math.max(1, rows.length));
  rows.forEach((row, index) => {
    const start = index === 0 ? 0 : room.stepFrontZ[index];
    const end = room.stepFrontZ[index + 1] ?? backZ;
    const top = row.floorY;
    const bottom = -0.2;
    floor.setMatrixAt(
      index,
      compose(0, (top + bottom) / 2, (start + end) / 2, halfWidth * 2, top - bottom, end - start),
    );
  });
  floor.name = 'floor';
  group.add(floor);

  // --- Little lights on the edge of every step in the two side aisles. ---
  const aisleX = layout.blockHalfWidth + room.sideAisle / 2;
  const stepCount = Math.max(0, rows.length - 1) * 2;
  if (stepCount > 0) {
    const stepLight = track(new MeshBasicMaterial({ color: PALETTE.stepLight, toneMapped: false }));
    const steps = new InstancedMesh(unitBox, stepLight, stepCount);
    let i = 0;
    for (let index = 1; index < rows.length; index += 1) {
      for (const side of [-1, 1]) {
        steps.setMatrixAt(
          i,
          compose(
            side * aisleX,
            rows[index].floorY + 0.006,
            room.stepFrontZ[index] + 0.025,
            room.sideAisle * 0.7,
            0.012,
            0.03,
          ),
        );
        i += 1;
      }
    }
    steps.name = 'step-lights';
    group.add(steps);
  }

  // --- Walls and ceiling. ---
  const sideTexture = track(panelTexture(css(PALETTE.wallLight), css(PALETTE.wallDark)));
  sideTexture.repeat.set(backZ / 1.4, 1);
  const sideWall = track(new MeshLambertMaterial({ map: sideTexture }));
  const backTexture = track(sideTexture.clone());
  backTexture.repeat.set((halfWidth * 2) / 1.4, 1);
  const backWall = track(new MeshLambertMaterial({ map: backTexture }));
  const wallHeight = ceiling + 0.2;

  for (const side of [-1, 1] as const) {
    const wall = new Mesh(unitPlane, sideWall);
    wall.scale.set(backZ, wallHeight, 1);
    wall.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
    wall.position.set(side * halfWidth, wallHeight / 2 - 0.2, backZ / 2);
    group.add(wall);
  }
  const back = new Mesh(unitPlane, backWall);
  back.scale.set(halfWidth * 2, wallHeight, 1);
  back.rotation.y = Math.PI;
  back.position.set(0, wallHeight / 2 - 0.2, backZ);
  group.add(back);

  const frontWall = new Mesh(
    unitPlane,
    track(new MeshLambertMaterial({ color: PALETTE.screenWall })),
  );
  frontWall.scale.set(halfWidth * 2, wallHeight, 1);
  frontWall.position.set(0, wallHeight / 2 - 0.2, -0.05);
  group.add(frontWall);

  const ceilingMesh = new Mesh(
    unitPlane,
    track(new MeshLambertMaterial({ color: PALETTE.ceiling })),
  );
  ceilingMesh.scale.set(halfWidth * 2, backZ + 0.1, 1);
  ceilingMesh.rotation.x = Math.PI / 2;
  ceilingMesh.position.set(0, ceiling, backZ / 2 - 0.05);
  group.add(ceilingMesh);

  // --- Screen, and the soft light it throws on the wall around it. ---
  const screenGeometry = track(new PlaneGeometry(screenLayout.width, screenLayout.height));
  const screenMaterial = track(
    new MeshBasicMaterial({ color: PALETTE.screen, toneMapped: false }),
  ) as Material;
  const screen = new Mesh<PlaneGeometry, Material>(screenGeometry, screenMaterial);
  screen.name = 'screen';
  screen.position.set(0, screenLayout.centre.y, 0);
  group.add(screen);

  const halo = new Mesh(
    unitPlane,
    track(
      new MeshBasicMaterial({
        color: PALETTE.screenGlow,
        map: track(haloTexture()),
        transparent: true,
        opacity: 0.32,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    ),
  );
  halo.scale.set(screenLayout.width * 1.38, screenLayout.height * 1.6, 1);
  halo.position.set(0, screenLayout.centre.y, -0.03);
  group.add(halo);

  // --- Wall sconces: a warm fixture and the pool of light it makes on the wall. ---
  const sconceZ: number[] = [];
  const firstSconce = Math.min(3, backZ / 3);
  const spacing = 4.5;
  for (let z = firstSconce; z <= backZ - 1.5; z += spacing) sconceZ.push(z);
  if (sconceZ.length === 0) sconceZ.push(backZ / 2);
  const sconceCount = sconceZ.length * 2;
  const glow = track(glowTexture());
  const fixtures = new InstancedMesh(
    unitBox,
    track(new MeshBasicMaterial({ color: PALETTE.sconce, toneMapped: false })),
    sconceCount,
  );
  const pools = new InstancedMesh(
    unitPlane,
    track(
      new MeshBasicMaterial({
        color: PALETTE.sconce,
        map: glow,
        transparent: true,
        opacity: 0.5,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    ),
    sconceCount,
  );
  let s = 0;
  for (const z of sconceZ) {
    const y = Math.min(floorHeightAt(layout, z) + 2.3, ceiling - 0.45);
    for (const side of [-1, 1] as const) {
      const yaw = side === -1 ? Math.PI / 2 : -Math.PI / 2;
      fixtures.setMatrixAt(s, compose(side * (halfWidth - 0.04), y, z, 0.22, 0.3, 0.08, yaw));
      pools.setMatrixAt(s, compose(side * (halfWidth - 0.012), y + 0.25, z, 1.6, 2.6, 1, yaw));
      s += 1;
    }
  }
  fixtures.name = 'sconces';
  pools.name = 'sconce-light';
  group.add(fixtures, pools);

  // --- Entrance: a dark doorway with a green exit sign above it. ---
  const side: -1 | 1 = auditorium.entrance.endsWith('left') ? -1 : 1;
  const frontEdge = room.stepFrontZ[0] ?? auditorium.firstRowDistance_m;
  const doorZ = auditorium.entrance.startsWith('front')
    ? Math.min(3, Math.max(1.2, frontEdge * 0.5))
    : backZ - ROOM.backWalkway_m / 2;
  const doorFloor = floorHeightAt(layout, doorZ);
  const doorYaw = side === -1 ? Math.PI / 2 : -Math.PI / 2;
  const doorMesh = new Mesh(unitBox, track(new MeshBasicMaterial({ color: PALETTE.door })));
  doorMesh.scale.set(1.3, 2.25, 0.06);
  doorMesh.rotation.y = doorYaw;
  doorMesh.position.set(side * (halfWidth - 0.02), doorFloor + 1.125, doorZ);
  const exitSign = new Mesh(
    unitBox,
    track(new MeshBasicMaterial({ color: PALETTE.exit, toneMapped: false })),
  );
  exitSign.scale.set(0.42, 0.16, 0.05);
  exitSign.rotation.y = doorYaw;
  exitSign.position.set(side * (halfWidth - 0.05), doorFloor + 2.55, doorZ);
  const exitGlow = new Mesh(
    unitPlane,
    track(
      new MeshBasicMaterial({
        color: PALETTE.exit,
        map: glow,
        transparent: true,
        opacity: 0.35,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    ),
  );
  exitGlow.scale.set(1.1, 0.7, 1);
  exitGlow.rotation.y = doorYaw;
  exitGlow.position.set(side * (halfWidth - 0.015), doorFloor + 2.55, doorZ);
  group.add(doorMesh, exitSign, exitGlow);

  // --- Seats: one instanced mesh for the whole room. ---
  const seatMaterial = track(new MeshLambertMaterial({ vertexColors: true }));
  const seatShape = track(seatGeometry(auditorium.type, layout.seatWidth));
  const seats = new InstancedMesh(seatShape, seatMaterial, Math.max(1, layout.seats.length));
  const seatIndex = new Map<string, number>();
  layout.seats.forEach((seat, index) => {
    seats.setMatrixAt(index, compose(seat.x, seat.floorY, seat.z));
    seatIndex.set(seat.id, index);
  });
  seats.count = layout.seats.length;
  seats.name = 'seats';
  group.add(seats);

  // --- Light: dim fill, plus the screen lighting the room from the front. ---
  group.add(
    new HemisphereLight(new Color(PALETTE.ambientSky), new Color(PALETTE.ambientGround), 1.1),
  );
  group.add(new AmbientLight(PALETTE.sconce, 0.12));
  const screenLight = new PointLight(PALETTE.screenLight, 18 * screenLayout.width, 0, 2);
  screenLight.position.set(0, screenLayout.centre.y, Math.min(4, auditorium.firstRowDistance_m));
  group.add(screenLight);

  return {
    group,
    screen,
    seats,
    seatIndex,
    door: { x: side * halfWidth, z: doorZ, floorY: doorFloor, side },
    dispose() {
      group.traverse((child) => {
        if (child instanceof InstancedMesh) child.dispose();
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
