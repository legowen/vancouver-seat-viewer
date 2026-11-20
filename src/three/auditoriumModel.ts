import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NoBlending,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AuditoriumType } from '../data/schema';
import type { AuditoriumLayout, SeatPosition } from '../metrics/layout';
import { audienceInFrontOf, HAIR_TONES } from '../scene/audience';
import { floorAt, roomShape, rowFrontZ, type RoomShape } from '../scene/room';
import {
  carpetTexture,
  exitSignTexture,
  glowTexture,
  screenIdleTexture,
  wallTexture,
} from './textures';

const COLORS = {
  carpet: 0x3b2d3f,
  riser: 0x261c29,
  treadSide: 0x2a2130,
  wall: 0x4a4558,
  backWall: 0x363242,
  ceiling: 0x1b1a22,
  frontWall: 0x050507,
  screenMatte: 0x1d1f26,
  seat: { standard: 0x80202e, vip: 0x3d2c27 } satisfies Record<AuditoriumType, number>,
  seatHighlight: 0xe8ae45,
  sconce: 0xffdcae,
  sconceGlow: 0xff9d52,
  stepLight: 0xffb867,
  screenSpill: 0x8ea6ff,
  door: 0x17141b,
  hair: [0x0e0c10, 0x1e1612, 0x2d221b, 0x3c3b42, 0x16100e],
};

/** Where a 16:9 trailer sits on the screen, in world units. */
export interface VideoRect {
  width: number;
  height: number;
  center: Vector3;
}

export interface AuditoriumModel {
  group: Group;
  room: RoomShape;
  videoRect: VideoRect;
  /** Shows a still frame in the 16:9 area of the screen, or the plain glow when null. */
  setPoster(texture: Texture | null): void;
  /** Makes the 16:9 area transparent so a video layer under the canvas shows through. */
  setVideoHole(open: boolean): void;
  /** Gives one seat a warm highlight, e.g. the seat being walked to. */
  highlightSeat(seat: SeatPosition | null): void;
  /** Re-seats the crowd for someone sitting in `seat`. */
  setViewerSeat(seat: SeatPosition | null): void;
  dispose(): void;
}

/** Moves (and optionally tilts back) a part before it is merged into a bigger shape. */
function placed(geometry: BufferGeometry, x: number, y: number, z: number, tilt = 0) {
  if (tilt) geometry.rotateX(tilt);
  geometry.translate(x, y, z);
  return geometry;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  // Some three.js shapes are indexed and some (RoundedBoxGeometry) are not, and
  // mergeGeometries needs them all alike, so flatten every part first.
  const flat = parts.map((part) => {
    if (!part.index) return part;
    const copy = part.toNonIndexed();
    part.dispose();
    return copy;
  });
  const merged = mergeGeometries(flat);
  for (const part of flat) part.dispose();
  if (!merged) throw new Error('Could not merge geometry');
  return merged;
}

/** Stretches a geometry's UVs so a repeating texture keeps a fixed size in metres. */
function worldUv(geometry: BufferGeometry, uRepeat: number, vRepeat: number): BufferGeometry {
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < uv.count; index++) {
    uv.setXY(index, uv.getX(index) * uRepeat, uv.getY(index) * vRepeat);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** A cinema seat facing the screen (-z). Origin: on the floor, below the sitter's eyes. */
function standardSeatGeometry(seatWidth: number): BufferGeometry {
  const width = seatWidth * 0.86;
  const half = seatWidth / 2;
  return merge([
    placed(new BoxGeometry(seatWidth * 0.66, 0.36, 0.36), 0, 0.18, 0.04),
    placed(new BoxGeometry(width, 0.12, 0.5), 0, 0.42, -0.02),
    placed(new RoundedBoxGeometry(width, 0.68, 0.12, 1, 0.05), 0, 0.78, 0.25, 0.12),
    placed(new BoxGeometry(0.07, 0.06, 0.46), -half, 0.66, 0),
    placed(new BoxGeometry(0.07, 0.06, 0.46), half, 0.66, 0),
    placed(new BoxGeometry(0.05, 0.62, 0.08), -half, 0.32, 0.12),
    placed(new BoxGeometry(0.05, 0.62, 0.08), half, 0.32, 0.12),
  ]);
}

/** A padded VIP recliner with wide arms. */
function reclinerGeometry(seatWidth: number): BufferGeometry {
  const armX = seatWidth * 0.45 - 0.065;
  return merge([
    placed(new RoundedBoxGeometry(seatWidth * 0.9, 0.44, 0.82, 1, 0.06), 0, 0.22, 0),
    placed(new RoundedBoxGeometry(seatWidth * 0.68, 0.14, 0.62, 1, 0.05), 0, 0.5, -0.04),
    placed(new RoundedBoxGeometry(seatWidth * 0.78, 0.66, 0.22, 1, 0.08), 0, 0.84, 0.36, 0.22),
    placed(new RoundedBoxGeometry(0.13, 0.66, 0.86, 1, 0.05), -armX, 0.33, 0.02),
    placed(new RoundedBoxGeometry(0.13, 0.66, 0.86, 1, 0.05), armX, 0.33, 0.02),
  ]);
}

/** Head, neck and shoulders. Origin: the centre of the head, at about eye height. */
function personGeometry(): BufferGeometry {
  const head = new SphereGeometry(0.105, 14, 10);
  head.scale(0.95, 1.12, 1.05);
  const neck = new CylinderGeometry(0.05, 0.056, 0.16, 10, 1, true);
  neck.translate(0, -0.16, 0.01);
  const shoulders = new SphereGeometry(0.22, 16, 8);
  shoulders.scale(1, 0.46, 0.56);
  shoulders.translate(0, -0.3, 0.03);
  return merge([head, neck, shoulders]);
}

/** Paints risers darker than treads so the steps read clearly in the dark. */
function colourByFacing(geometry: BufferGeometry): BufferGeometry {
  const normals = geometry.getAttribute('normal');
  const colours = new Float32Array(normals.count * 3);
  const top = new Color(COLORS.carpet);
  const riser = new Color(COLORS.riser);
  const side = new Color(COLORS.treadSide);
  for (let index = 0; index < normals.count; index++) {
    const colour = normals.getY(index) > 0.5 ? top : normals.getZ(index) < -0.5 ? riser : side;
    colour.toArray(colours, index * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  return geometry;
}

/**
 * Builds a whole auditorium from its layout: stepped floor, walls, screen, seats, wall
 * sconces, step lights, an entrance door and the people in the rows in front of `viewerSeat`.
 * Seats and heads are instanced so even a 400-seat room stays a handful of draw calls.
 */
export function buildAuditoriumModel(
  layout: AuditoriumLayout,
  viewerSeat: SeatPosition | null,
): AuditoriumModel {
  const room = roomShape(layout);
  const { screen, dims, rows } = layout;
  const group = new Group();
  group.name = 'auditorium';
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(item: T): T => {
    owned.push(item);
    return item;
  };
  const add = (geometry: BufferGeometry, material: Material, name: string): Mesh => {
    const mesh = new Mesh(own(geometry), material);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };

  const glow = own(glowTexture());
  const wallMap = own(wallTexture());
  const carpetMap = own(carpetTexture());
  const idleScreen = own(screenIdleTexture());

  // ---------- Lighting: the screen is the main light, plus a dim fill. ----------
  group.add(new HemisphereLight(0xa4abd0, 0x2e2329, 2.4));
  const screenLight = new DirectionalLight(0xd5ddff, 2.2);
  screenLight.position.set(0, screen.centerY, 0.5);
  screenLight.target.position.set(0, room.lastFloor * 0.5, room.back * 0.7);
  group.add(screenLight, screenLight.target);

  // ---------- Floor, stepped rows, walls and ceiling ----------
  const width = room.halfWidth * 2;
  const carpetMaterial = own(new MeshLambertMaterial({ color: COLORS.carpet, map: carpetMap }));
  const floor = worldUv(new PlaneGeometry(width, room.back), width / 1.5, room.back / 1.5);
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, 0, room.back / 2);
  add(floor, carpetMaterial, 'floor');

  const treads: BufferGeometry[] = [];
  rows.forEach((row, index) => {
    if (row.floorY <= 0) return;
    const front = rowFrontZ(layout, index);
    const end = index === rows.length - 1 ? room.back : front + dims.rowSpacing;
    const tread = worldUv(
      new BoxGeometry(width, row.floorY, end - front),
      width / 1.5,
      (end - front) / 1.5,
    );
    tread.translate(0, row.floorY / 2, (front + end) / 2);
    treads.push(colourByFacing(tread));
  });
  if (treads.length > 0) {
    add(
      merge(treads),
      own(new MeshLambertMaterial({ vertexColors: true, map: carpetMap })),
      'treads',
    );
  }

  const wallMaterial = own(new MeshLambertMaterial({ color: COLORS.wall, map: wallMap }));
  const sideWall = (sign: 1 | -1) => {
    const wall = worldUv(
      new PlaneGeometry(room.back, room.ceiling),
      room.back / 2.4,
      room.ceiling / 2.4,
    );
    wall.rotateY((sign * -Math.PI) / 2);
    wall.translate(sign * room.halfWidth, room.ceiling / 2, room.back / 2);
    return wall;
  };
  add(sideWall(-1), wallMaterial, 'left wall');
  add(sideWall(1), wallMaterial, 'right wall');

  const backWall = worldUv(new PlaneGeometry(width, room.ceiling), width / 2.4, room.ceiling / 2.4);
  backWall.rotateY(Math.PI);
  backWall.translate(0, room.ceiling / 2, room.back);
  add(
    backWall,
    own(new MeshLambertMaterial({ color: COLORS.backWall, map: wallMap })),
    'back wall',
  );

  const frontWall = new PlaneGeometry(width, room.ceiling);
  frontWall.translate(0, room.ceiling / 2, -0.04);
  add(frontWall, own(new MeshBasicMaterial({ color: COLORS.frontWall })), 'screen wall');

  const ceiling = new PlaneGeometry(width, room.back);
  ceiling.rotateX(Math.PI / 2);
  ceiling.translate(0, room.ceiling, room.back / 2);
  add(ceiling, own(new MeshLambertMaterial({ color: COLORS.ceiling })), 'ceiling');

  // ---------- Screen ----------
  const screenMaterial = own(new MeshBasicMaterial({ map: idleScreen, toneMapped: false }));
  const screenGeometry = new PlaneGeometry(screen.width, screen.height);
  screenGeometry.translate(0, screen.centerY, 0);
  add(screenGeometry, screenMaterial, 'screen');

  // A 16:9 picture as tall as the screen allows, centred: how flat content sits on a scope screen.
  const videoHeight = Math.min(screen.height, (screen.width * 9) / 16);
  const videoRect: VideoRect = {
    width: (videoHeight * 16) / 9,
    height: videoHeight,
    center: new Vector3(0, screen.centerY, 0.01),
  };
  const posterMaterial = own(new MeshBasicMaterial({ toneMapped: false }));
  const holeMaterial = own(
    // Writes transparent black: the canvas becomes see-through here and the video below
    // shows, while anything nearer the camera (heads, seats) still draws over it.
    new MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: NoBlending }),
  );
  const pictureGeometry = new PlaneGeometry(videoRect.width, videoRect.height);
  pictureGeometry.translate(videoRect.center.x, videoRect.center.y, videoRect.center.z);
  const picture = add(pictureGeometry, posterMaterial, 'screen picture');
  picture.visible = false;
  let poster: Texture | null = null;
  let holeOpen = false;

  const refreshScreen = () => {
    const showPicture = holeOpen || poster !== null;
    picture.visible = showPicture;
    picture.material = holeOpen ? holeMaterial : posterMaterial;
    screenMaterial.map = showPicture ? null : idleScreen;
    screenMaterial.color.set(showPicture ? COLORS.screenMatte : 0xffffff);
    screenMaterial.needsUpdate = true;
  };

  // Light spilling from the screen onto the floor in front of it.
  const spill = new PlaneGeometry(screen.width * 1.3, 5);
  spill.rotateX(-Math.PI / 2);
  spill.translate(0, 0.012, 2.2);
  add(
    spill,
    own(
      new MeshBasicMaterial({
        map: glow,
        color: COLORS.screenSpill,
        transparent: true,
        opacity: 0.22,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    ),
    'screen spill',
  );

  // ---------- Seats ----------
  const seatGeometry = own(
    layout.auditorium.type === 'vip'
      ? reclinerGeometry(dims.seatWidth)
      : standardSeatGeometry(dims.seatWidth),
  );
  const seatMaterial = own(new MeshLambertMaterial({ color: 0xffffff }));
  const seats = new InstancedMesh(seatGeometry, seatMaterial, Math.max(1, layout.seats.length));
  seats.name = 'seats';
  seats.frustumCulled = false;
  const seatColour = new Color(COLORS.seat[layout.auditorium.type]);
  const placer = new Object3D();
  layout.seats.forEach((seat, index) => {
    placer.position.set(seat.x, seat.floorY, seat.z);
    placer.updateMatrix();
    seats.setMatrixAt(index, placer.matrix);
    seats.setColorAt(index, seatColour);
  });
  seats.count = layout.seats.length;
  group.add(seats);
  own(seats);

  let highlighted = -1;
  const highlightSeat = (seat: SeatPosition | null) => {
    if (highlighted >= 0) seats.setColorAt(highlighted, seatColour);
    highlighted = seat ? layout.seats.indexOf(seat) : -1;
    if (highlighted >= 0) seats.setColorAt(highlighted, new Color(COLORS.seatHighlight));
    if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
  };

  // ---------- People in the rows in front ----------
  const people = new InstancedMesh(
    own(personGeometry()),
    own(new MeshLambertMaterial({ color: 0xffffff })),
    Math.max(1, layout.seats.length),
  );
  people.name = 'audience';
  people.frustumCulled = false;
  group.add(people);
  own(people);
  const hair = COLORS.hair.map((value) => new Color(value));

  const setViewerSeat = (viewer: SeatPosition | null) => {
    const audience = audienceInFrontOf(layout, viewer);
    audience.forEach((member, index) => {
      const { seat } = member;
      // Eyes sit about halfway up the head, so the head's centre is at eye height.
      placer.position.set(seat.x + member.offsetX, seat.eyeY + 0.01, seat.z + 0.02);
      placer.scale.setScalar(member.scale);
      placer.updateMatrix();
      people.setMatrixAt(index, placer.matrix);
      people.setColorAt(index, hair[member.tone % HAIR_TONES] ?? hair[0]!);
    });
    placer.scale.setScalar(1);
    people.count = audience.length;
    people.instanceMatrix.needsUpdate = true;
    if (people.instanceColor) people.instanceColor.needsUpdate = true;
  };
  setViewerSeat(viewerSeat);

  // ---------- Wall sconces with a warm wash of light around each ----------
  const sconceSpacing = 3.4;
  const sconceDepths: number[] = [];
  for (let z = 2.2; z < room.back - 0.8; z += sconceSpacing) sconceDepths.push(z);
  const sconceCount = sconceDepths.length * 2;
  const sconces = new InstancedMesh(
    own(new BoxGeometry(0.1, 0.34, 0.2)),
    own(new MeshBasicMaterial({ color: COLORS.sconce, toneMapped: false })),
    Math.max(1, sconceCount),
  );
  const washes = new InstancedMesh(
    own(new PlaneGeometry(1.5, 2.6)),
    own(
      new MeshBasicMaterial({
        map: glow,
        color: COLORS.sconceGlow,
        transparent: true,
        opacity: 0.5,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    ),
    Math.max(1, sconceCount),
  );
  let sconceIndex = 0;
  for (const z of sconceDepths) {
    const y = Math.min(floorAt(layout, z) + 2.4, room.ceiling - 0.5);
    for (const sign of [-1, 1]) {
      placer.rotation.set(0, (sign * -Math.PI) / 2, 0);
      placer.position.set(sign * (room.halfWidth - 0.05), y, z);
      placer.updateMatrix();
      sconces.setMatrixAt(sconceIndex, placer.matrix);
      placer.position.set(sign * (room.halfWidth - 0.02), y, z);
      placer.updateMatrix();
      washes.setMatrixAt(sconceIndex, placer.matrix);
      sconceIndex++;
    }
  }
  placer.rotation.set(0, 0, 0);
  sconces.count = washes.count = sconceIndex;
  sconces.frustumCulled = washes.frustumCulled = false;
  group.add(sconces, washes);
  own(sconces);
  own(washes);

  // ---------- Step lights on the nose of each step in the side aisles ----------
  const aisleX = room.halfWidth - room.sideAisle / 2;
  const steps = rows.filter((row) => row.floorY > 0);
  const stepLights = new InstancedMesh(
    own(new BoxGeometry(Math.min(0.5, room.sideAisle * 0.45), 0.025, 0.03)),
    own(new MeshBasicMaterial({ color: COLORS.stepLight, toneMapped: false })),
    Math.max(1, steps.length * 2),
  );
  let stepIndex = 0;
  for (const row of steps) {
    for (const sign of [-1, 1]) {
      placer.position.set(sign * aisleX, row.floorY - 0.02, rowFrontZ(layout, row.index) - 0.016);
      placer.updateMatrix();
      stepLights.setMatrixAt(stepIndex++, placer.matrix);
    }
  }
  stepLights.count = stepIndex;
  stepLights.frustumCulled = false;
  group.add(stepLights);
  own(stepLights);

  // ---------- Entrance door with an EXIT sign ----------
  const entranceAtBack = layout.entrance.startsWith('back');
  const entranceSign = layout.entrance.endsWith('left') ? -1 : 1;
  const doorZ = entranceAtBack ? room.back - 0.8 : 1.6;
  const doorFloor = entranceAtBack ? room.lastFloor : 0;
  const door = new PlaneGeometry(1.3, 2.2);
  door.rotateY((entranceSign * -Math.PI) / 2);
  door.translate(entranceSign * (room.halfWidth - 0.015), doorFloor + 1.1, doorZ);
  add(door, own(new MeshLambertMaterial({ color: COLORS.door })), 'door');
  const sign = new PlaneGeometry(0.42, 0.16);
  sign.rotateY((entranceSign * -Math.PI) / 2);
  sign.translate(entranceSign * (room.halfWidth - 0.02), doorFloor + 2.45, doorZ);
  add(
    sign,
    own(new MeshBasicMaterial({ map: own(exitSignTexture()), toneMapped: false })),
    'exit sign',
  );

  return {
    group,
    room,
    videoRect,
    setPoster(texture) {
      poster = texture;
      posterMaterial.map = texture;
      posterMaterial.needsUpdate = true;
      refreshScreen();
    },
    setVideoHole(open) {
      holeOpen = open;
      refreshScreen();
    },
    highlightSeat,
    setViewerSeat,
    dispose() {
      for (const item of owned) item.dispose();
      poster?.dispose();
    },
  };
}
