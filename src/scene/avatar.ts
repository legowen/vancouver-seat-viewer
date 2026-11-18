/**
 * A small, round, friendly avatar made only of primitives: beanie, big head, hoodie, swinging
 * arms and legs, and a box of popcorn. Its origin is on the floor between the feet and it faces
 * −z (towards the screen) at zero rotation.
 */
import {
  BoxGeometry,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from 'three';

export interface AvatarPose {
  /** Steps taken so far (fractional): one full leg swing is two steps. */
  step: number;
  /** 0 standing still … 1 full stride. */
  stride: number;
  /** 0 upright … 1 leaning into a run. */
  run: number;
  /** 0 standing … 1 seated. */
  sit: number;
}

export interface Avatar {
  group: Group;
  pose(pose: AvatarPose): void;
  /** Height of the hips above the floor when seated on a cushion this high. */
  setSeatHeight(height: number): void;
  dispose(): void;
}

const HIP = 0.42;

export function createAvatar(): Avatar {
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const material = (color: number, glow = 0.28) => {
    // A little self-light keeps the avatar readable in a dark room.
    const m = new MeshLambertMaterial({ color, emissive: color, emissiveIntensity: glow });
    materials.push(m);
    return m;
  };
  const geometry = <T extends BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  const hoodie = material(0xffb866);
  const skin = material(0xf6e3cf, 0.35);
  const beanie = material(0xe0506a);
  const dark = material(0x231d3a, 0.1);
  const trousers = material(0x4c4699);
  const popcornBox = material(0xf8f1e4, 0.3);
  const popcorn = material(0xffe29a, 0.45);

  const group = new Group();
  group.name = 'avatar';
  const body = new Group();
  group.add(body);

  // Legs hang from the hips and swing from there.
  const legShape = geometry(new CapsuleGeometry(0.058, 0.24, 4, 8));
  const shoeShape = geometry(new SphereGeometry(0.07, 10, 6));
  const legs = [-1, 1].map((side) => {
    const pivot = new Group();
    pivot.position.set(side * 0.075, HIP, 0);
    const leg = new Mesh(legShape, trousers);
    leg.position.y = -0.2;
    const shoe = new Mesh(shoeShape, dark);
    shoe.scale.set(0.9, 0.6, 1.3);
    shoe.position.set(0, -0.39, -0.03);
    pivot.add(leg, shoe);
    body.add(pivot);
    return pivot;
  });

  const torso = new Mesh(geometry(new CapsuleGeometry(0.155, 0.16, 4, 12)), hoodie);
  torso.position.y = HIP + 0.2;
  body.add(torso);

  const armShape = geometry(new CapsuleGeometry(0.046, 0.2, 4, 8));
  const handShape = geometry(new SphereGeometry(0.05, 8, 6));
  const arms = [-1, 1].map((side) => {
    const pivot = new Group();
    pivot.position.set(side * 0.175, HIP + 0.31, 0);
    pivot.rotation.z = side * 0.18;
    const arm = new Mesh(armShape, hoodie);
    arm.position.y = -0.13;
    const hand = new Mesh(handShape, skin);
    hand.position.y = -0.27;
    pivot.add(arm, hand);
    body.add(pivot);
    return pivot;
  });

  // Popcorn in the right hand.
  const box = new Mesh(geometry(new BoxGeometry(0.1, 0.12, 0.09)), popcornBox);
  box.position.set(0, -0.31, -0.05);
  const pop = new Mesh(geometry(new SphereGeometry(0.06, 8, 6)), popcorn);
  pop.scale.set(1, 0.6, 0.9);
  pop.position.set(0, -0.24, -0.05);
  arms[1].add(box, pop);

  const head = new Group();
  head.position.y = HIP + 0.55;
  const skull = new Mesh(geometry(new SphereGeometry(0.17, 18, 12)), skin);
  const hat = new Mesh(
    geometry(new SphereGeometry(0.178, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
    beanie,
  );
  hat.position.y = 0.025;
  hat.scale.set(1, 0.92, 1);
  const pompom = new Mesh(geometry(new SphereGeometry(0.045, 8, 6)), popcornBox);
  pompom.position.y = 0.2;
  const eyeShape = geometry(new SphereGeometry(0.024, 8, 6));
  const eyes = [-1, 1].map((side) => {
    const eye = new Mesh(eyeShape, dark);
    eye.position.set(side * 0.058, -0.01, -0.155);
    eye.scale.set(1, 1.25, 0.6);
    return eye;
  });
  head.add(skull, hat, pompom, ...eyes);
  body.add(head);

  let seatHeight = 0.48;

  return {
    group,
    setSeatHeight(height) {
      seatHeight = height;
    },
    pose({ step, stride, run, sit }) {
      const swing = Math.sin(step * Math.PI) * (0.6 + run * 0.25) * stride * (1 - sit);
      legs[0].rotation.x = swing + sit * 1.4;
      legs[1].rotation.x = -swing + sit * 1.4;
      arms[0].rotation.x = -swing * 0.8 + sit * 0.45;
      arms[1].rotation.x = swing * 0.8 + sit * 0.9;
      const bob = Math.abs(Math.sin(step * Math.PI)) * 0.035 * stride * (1 - sit);
      // Seated, the hips rest on the cushion a little behind the knees.
      body.position.y = bob + sit * (seatHeight + 0.06 - HIP);
      body.position.z = sit * 0.06;
      body.rotation.x = -0.2 * run * (1 - sit);
      head.rotation.x = sit * -0.08;
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
