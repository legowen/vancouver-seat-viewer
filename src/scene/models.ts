/**
 * Geometry built from primitives: seats and seated people. Every model faces −z (towards the
 * screen) and has its origin on the floor (seats) or at eye level (people), so instances can be
 * placed straight from the seat layout.
 */
import {
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AuditoriumType } from '../config/defaults';
import { PALETTE } from './palette';

interface Placement {
  at: [number, number, number];
  rotate?: [number, number, number];
  scale?: [number, number, number];
  color?: number;
}

const _matrix = new Matrix4();
const _quaternion = new Quaternion();
const _euler = new Euler();
const _position = new Vector3();
const _scale = new Vector3();
const _color = new Color();

/** Moves a part into place, drops its index and paints it with a vertex colour. */
function place(geometry: BufferGeometry, placement: Placement): BufferGeometry {
  const [x, y, z] = placement.at;
  const [rx, ry, rz] = placement.rotate ?? [0, 0, 0];
  const [sx, sy, sz] = placement.scale ?? [1, 1, 1];
  _matrix.compose(
    _position.set(x, y, z),
    _quaternion.setFromEuler(_euler.set(rx, ry, rz)),
    _scale.set(sx, sy, sz),
  );
  const part = geometry.index ? geometry.toNonIndexed() : geometry;
  if (part !== geometry) geometry.dispose();
  part.applyMatrix4(_matrix);
  part.deleteAttribute('uv');

  _color.set(placement.color ?? 0xffffff);
  const count = part.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }
  part.setAttribute('color', new BufferAttribute(colors, 3));
  return part;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('Could not merge model parts');
  merged.computeBoundingSphere();
  return merged;
}

function box(w: number, h: number, d: number, placement: Placement): BufferGeometry {
  return place(new BoxGeometry(w, h, d), placement);
}

/** A cinema seat `width` metres wide, with vertex colours. */
export function seatGeometry(type: AuditoriumType, width: number): BufferGeometry {
  const half = width / 2;
  if (type === 'vip') {
    // A recliner: a deep padded body, wide armrests, a tall back with a headrest.
    const arm = Math.min(0.13, width * 0.18);
    return merge([
      box(width - 0.06, 0.4, 0.66, { at: [0, 0.2, 0.02], color: PALETTE.leatherDark }),
      box(width - arm * 2 - 0.02, 0.13, 0.58, { at: [0, 0.47, -0.02], color: PALETTE.leather }),
      box(width - arm * 2 - 0.02, 0.62, 0.16, {
        at: [0, 0.8, 0.31],
        rotate: [0.2, 0, 0],
        color: PALETTE.leather,
      }),
      box(width - arm * 2 - 0.1, 0.15, 0.13, {
        at: [0, 1.08, 0.4],
        rotate: [0.2, 0, 0],
        color: PALETTE.leather,
      }),
      box(arm, 0.14, 0.62, { at: [-half + arm / 2, 0.62, 0.02], color: PALETTE.leatherDark }),
      box(arm, 0.14, 0.62, { at: [half - arm / 2, 0.62, 0.02], color: PALETTE.leatherDark }),
    ]);
  }
  // A regular stadium seat: pedestal, cushion, slightly reclined back, thin armrests.
  return merge([
    box(width - 0.12, 0.34, 0.3, { at: [0, 0.17, 0.06], color: PALETTE.velvetDark }),
    box(width - 0.07, 0.12, 0.46, { at: [0, 0.42, -0.05], color: PALETTE.velvet }),
    box(width - 0.06, 0.62, 0.09, {
      at: [0, 0.76, 0.25],
      rotate: [0.12, 0, 0],
      color: PALETTE.velvet,
    }),
    box(0.05, 0.05, 0.44, { at: [-half + 0.025, 0.64, -0.01], color: PALETTE.armrest }),
    box(0.05, 0.05, 0.44, { at: [half - 0.025, 0.64, -0.01], color: PALETTE.armrest }),
  ]);
}

/**
 * Head and shoulders of a seated person, origin at eye level. Style 0 is plain, 1 has a hair
 * bun, 2 wears a cap. Coloured white so the instance colour sets the tone.
 */
export function headGeometry(style: number): BufferGeometry {
  const parts = [
    place(new SphereGeometry(0.1, 10, 8), { at: [0, 0.02, 0.04], scale: [0.88, 1.1, 1] }),
    place(new CylinderGeometry(0.045, 0.05, 0.14, 6), { at: [0, -0.12, 0.06] }),
    place(new SphereGeometry(0.22, 10, 5), { at: [0, -0.28, 0.08], scale: [1, 0.42, 0.52] }),
  ];
  if (style === 1) {
    // Hair bun at the back of the head.
    parts.push(place(new SphereGeometry(0.055, 8, 6), { at: [0, 0.1, 0.13] }));
  } else if (style === 2) {
    // A beanie: the top half of a slightly larger sphere.
    parts.push(
      place(new SphereGeometry(0.1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), {
        at: [0, 0.04, 0.04],
        scale: [0.95, 1.15, 1.06],
      }),
    );
  }
  return merge(parts);
}
