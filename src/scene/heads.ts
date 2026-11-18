/** Silhouettes of the people in the rows in front: one InstancedMesh per head shape. */
import {
  Color,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';
import { headGeometry } from './models';
import { HEAD_STYLES, type Occupant } from './occupancy';
import { PALETTE } from './palette';

export interface Heads {
  group: Group;
  count: number;
  dispose(): void;
}

export function buildHeads(occupants: readonly Occupant[], eyeHeight: number): Heads {
  const group = new Group();
  group.name = 'audience';
  const material = new MeshLambertMaterial({ color: 0xffffff });
  const geometries: BufferGeometry[] = [];
  const meshes: InstancedMesh[] = [];

  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const euler = new Euler();
  const position = new Vector3();
  const scale = new Vector3();
  const dark = new Color(PALETTE.headDark);
  const light = new Color(PALETTE.headLight);
  const color = new Color();

  for (let style = 0; style < HEAD_STYLES; style += 1) {
    const people = occupants.filter((occupant) => occupant.style === style);
    if (people.length === 0) continue;
    const geometry = headGeometry(style);
    geometries.push(geometry);
    const mesh = new InstancedMesh(geometry, material, people.length);
    people.forEach((person, index) => {
      const { seat } = person;
      matrix.compose(
        position.set(seat.x + person.shiftX, seat.floorY + eyeHeight, seat.z),
        quaternion.setFromEuler(euler.set(0, person.turn, person.lean)),
        scale.setScalar(person.scale),
      );
      mesh.setMatrixAt(index, matrix);
      // Mostly near-black silhouettes, the odd lighter one.
      mesh.setColorAt(index, color.copy(dark).lerp(light, person.tone ** 3));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = `heads-${style}`;
    meshes.push(mesh);
    group.add(mesh);
  }

  return {
    group,
    count: occupants.length,
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
    },
  };
}
