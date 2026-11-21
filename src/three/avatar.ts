import {
  CanvasTexture,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SphereGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
} from 'three';

/** How the avatar should stand this frame. */
export interface AvatarPose {
  /** Walk-cycle phase in radians. */
  phase: number;
  /** 0 standing still … 1 full stride. */
  stride: number;
  /** 0 standing … 1 seated. */
  sit: number;
  /** 0 upright … 1 leaning into a run, on long walks squeezed into a few seconds. */
  lean?: number;
}

export interface Avatar {
  /** Origin on the floor between the feet; the face looks along +z. */
  group: Group;
  pose(pose: AvatarPose): void;
  dispose(): void;
}

/** Height the hips rise by when the (small) avatar climbs onto a full-size seat. */
const SEAT_HOP = 0.12;
const HIP_Y = 0.36;

function stripes(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const context = canvas.getContext('2d');
  if (context) {
    for (let index = 0; index < 8; index++) {
      context.fillStyle = index % 2 === 0 ? '#e23b3b' : '#fff6ea';
      context.fillRect(index * 8, 0, 8, 8);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * A small, round, friendly mascot built only from primitives: capsule body, big head,
 * dot eyes, stubby limbs and a bucket of popcorn.
 */
export function createAvatar(): Avatar {
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(item: T): T => {
    owned.push(item);
    return item;
  };
  const mesh = (geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0): Mesh => {
    const part = new Mesh(own(geometry), material);
    part.position.set(x, y, z);
    return part;
  };

  // A little self-lit so it stays readable in a dark room.
  const body = own(new MeshLambertMaterial({ color: 0xf5b942, emissive: 0x6a4400 }));
  const limbs = own(new MeshLambertMaterial({ color: 0xd9962a, emissive: 0x3a2400 }));
  const white = own(new MeshBasicMaterial({ color: 0xfdfcf7 }));
  const ink = own(new MeshBasicMaterial({ color: 0x15151c }));
  const blush = own(new MeshBasicMaterial({ color: 0xff8f8f }));
  const bucket = own(new MeshLambertMaterial({ map: own(stripes()), emissive: 0x220a0a }));
  const popcorn = own(new MeshLambertMaterial({ color: 0xfff2c4, emissive: 0x4a4020 }));

  const group = new Group();
  group.name = 'avatar';
  const torso = new Group();
  group.add(torso);

  torso.add(mesh(new CapsuleGeometry(0.2, 0.16, 6, 14), body, 0, 0.58, 0));
  const head = new Group();
  head.position.set(0, 1.0, 0);
  torso.add(head);
  head.add(mesh(new SphereGeometry(0.22, 20, 16), body));
  for (const side of [-1, 1]) {
    head.add(mesh(new SphereGeometry(0.055, 12, 10), white, side * 0.085, 0.03, 0.18));
    head.add(mesh(new SphereGeometry(0.03, 10, 8), ink, side * 0.085, 0.03, 0.228));
    const cheek = mesh(new SphereGeometry(0.035, 10, 8), blush, side * 0.14, -0.05, 0.165);
    cheek.scale.set(1, 0.6, 0.4);
    head.add(cheek);
  }

  // Limbs hang from pivots so they can swing.
  const limb = (x: number, y: number, radius: number, length: number): Group => {
    const pivot = new Group();
    pivot.position.set(x, y, 0);
    pivot.add(
      mesh(new CapsuleGeometry(radius, length, 4, 10), limbs, 0, -(length / 2 + radius), 0),
    );
    return pivot;
  };
  const legs = [limb(-0.09, HIP_Y, 0.065, 0.2), limb(0.09, HIP_Y, 0.065, 0.2)];
  const arms = [limb(-0.215, 0.78, 0.05, 0.16), limb(0.215, 0.78, 0.05, 0.16)];
  group.add(...legs);
  torso.add(...arms);

  // Popcorn in the right hand.
  const snack = new Group();
  snack.position.set(0, -0.3, 0.06);
  snack.add(mesh(new CylinderGeometry(0.075, 0.055, 0.15, 14), bucket));
  const kernels: [number, number, number][] = [
    [0, 0.09, 0],
    [0.035, 0.085, 0.02],
    [-0.035, 0.085, -0.015],
    [0.015, 0.11, -0.03],
    [-0.02, 0.105, 0.03],
  ];
  for (const [x, y, z] of kernels)
    snack.add(mesh(new SphereGeometry(0.032, 8, 6), popcorn, x, y, z));
  arms[1]!.add(snack);

  return {
    group,
    pose({ phase, stride, sit, lean = 0 }) {
      const swing = Math.sin(phase) * 0.65 * stride * (1 - sit);
      legs[0]!.rotation.x = swing - (Math.PI / 2) * sit;
      legs[1]!.rotation.x = -swing - (Math.PI / 2) * sit;
      arms[0]!.rotation.x = -swing * 0.8;
      // The popcorn arm stays forward, holding the bucket up.
      arms[1]!.rotation.x = swing * 0.3 - 0.55;
      const bob = Math.abs(Math.sin(phase)) * 0.035 * stride * (1 - sit);
      torso.position.y = bob + SEAT_HOP * sit;
      legs.forEach((leg) => (leg.position.y = HIP_Y + SEAT_HOP * sit));
      head.rotation.z = Math.sin(phase * 0.5) * 0.06 * stride;
      // Tips the whole upper body forward from the feet.
      torso.rotation.x = 0.24 * lean * (1 - sit);
    },
    dispose() {
      for (const item of owned) item.dispose();
    },
  };
}
