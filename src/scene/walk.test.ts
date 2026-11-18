import { describe, expect, it } from 'vitest';
import { makeLayout } from '../testing/fixtures';
import { WALK_TIMING, ease, planWalk, sampleWalk } from './walk';

const layout = makeLayout();
const frontLeft = { z: 2, side: -1 as const };
const backRight = { z: layout.room.backZ - 0.9, side: 1 as const };

function seat(id: string) {
  const found = layout.seatById.get(id);
  if (!found) throw new Error(id);
  return found;
}

describe('planWalk', () => {
  it('uses the side aisle on the seat’s side of the room', () => {
    expect(planWalk(layout, 'front-left', frontLeft, seat('H-3')).aisleSide).toBe(-1);
    expect(planWalk(layout, 'front-left', frontLeft, seat('H-16')).aisleSide).toBe(1);
    const plan = planWalk(layout, 'front-left', frontLeft, seat('H-16'));
    expect(plan.aisleX).toBeCloseTo(layout.blockHalfWidth + layout.room.sideAisle / 2, 10);
  });

  it('starts at the door and ends in front of the seat, then sits on it', () => {
    const target = seat('H-9');
    const plan = planWalk(layout, 'front-left', frontLeft, target);
    const first = plan.segments[0];
    expect(first.from.x).toBeCloseTo(-(layout.room.halfWidth - 0.15), 10);
    expect(first.from.z).toBe(2);
    const last = plan.segments[plan.segments.length - 1];
    expect(last.kind).toBe('side');
    expect(last.to.x).toBeCloseTo(target.x, 10);
    expect(last.to.z).toBeCloseTo(plan.rowLineZ, 10);
    const seated = sampleWalk(plan, plan.total);
    expect(seated.phase).toBe('seated');
    expect(seated.x).toBeCloseTo(target.x, 10);
    expect(seated.z).toBeCloseTo(target.z, 10);
  });

  it('walks the row line between the seats and the row in front', () => {
    const target = seat('H-9');
    const plan = planWalk(layout, 'front-left', frontLeft, target);
    const rowInFront = layout.rows[target.rowIndex - 1];
    expect(plan.rowLineZ).toBeLessThan(target.z - 0.3);
    expect(plan.rowLineZ).toBeGreaterThan(rowInFront.z + 0.3);
  });

  it('crosses in front of the first row when entering at the front', () => {
    const plan = planWalk(layout, 'front-left', frontLeft, seat('H-16'));
    const cross = plan.segments.find((s) => Math.abs(s.to.x - s.from.x) > 3 && s.kind === 'walk')!;
    expect(cross.from.z).toBeLessThan(layout.room.stepFrontZ[0]);
  });

  it('comes down from the back cross-aisle when entering at the back', () => {
    const plan = planWalk(layout, 'back-right', backRight, seat('C-3'));
    const climb = plan.segments.find(
      (s) =>
        s.from.x === s.to.x &&
        s.from.z !== s.to.z &&
        s.kind === 'walk' &&
        Math.abs(s.from.x) < layout.room.halfWidth - 1,
    )!;
    expect(climb.from.z).toBeGreaterThan(climb.to.z);
    expect(plan.aisleSide).toBe(-1);
  });

  it('fits the whole walk-in into 4 to 6 seconds', () => {
    for (const id of ['A-1', 'A-9', 'G-9', 'N-1', 'N-18']) {
      for (const [entrance, door] of [
        ['front-left', frontLeft],
        ['back-right', backRight],
      ] as const) {
        const plan = planWalk(layout, entrance, door, seat(id));
        expect(plan.total).toBeGreaterThanOrEqual(4);
        expect(plan.total).toBeLessThanOrEqual(6);
        expect(plan.walkEnd).toBeGreaterThanOrEqual(WALK_TIMING.minWalk);
        expect(plan.walkEnd).toBeLessThanOrEqual(WALK_TIMING.maxWalk);
      }
    }
  });

  it('has back-to-back segments that cover the walking time', () => {
    const plan = planWalk(layout, 'front-left', frontLeft, seat('K-12'));
    expect(plan.segments[0].start).toBe(0);
    for (let i = 1; i < plan.segments.length; i += 1) {
      expect(plan.segments[i].start).toBeCloseTo(plan.segments[i - 1].end, 10);
      expect(plan.segments[i].from).toEqual(plan.segments[i - 1].to);
    }
    expect(plan.segments[plan.segments.length - 1].end).toBeCloseTo(plan.walkEnd, 10);
  });
});

describe('sampleWalk', () => {
  const plan = planWalk(layout, 'front-left', frontLeft, seat('J-14'));

  it('moves continuously and never jumps', () => {
    let previous = sampleWalk(plan, 0);
    for (let time = 0.02; time <= plan.total; time += 0.02) {
      const sample = sampleWalk(plan, time);
      expect(Math.hypot(sample.x - previous.x, sample.z - previous.z)).toBeLessThan(0.2);
      expect(sample.travelled).toBeGreaterThanOrEqual(previous.travelled - 1e-9);
      previous = sample;
    }
  });

  it('faces the way it walks, and the screen while side-stepping and sitting', () => {
    const climb = plan.segments.find((s) => s.to.z > s.from.z + 1)!;
    const up = sampleWalk(plan, (climb.start + climb.end) / 2);
    expect(Math.abs(up.heading)).toBeCloseTo(Math.PI, 6);
    const side = plan.segments.find((s) => s.kind === 'side')!;
    expect(sampleWalk(plan, (side.start + side.end) / 2)).toMatchObject({
      phase: 'side',
      heading: 0,
    });
    expect(sampleWalk(plan, plan.walkEnd + 0.1)).toMatchObject({ phase: 'sit', heading: 0 });
  });

  it('sits down between the end of the walk and the end of sitting', () => {
    expect(sampleWalk(plan, plan.walkEnd).sit).toBe(0);
    expect(sampleWalk(plan, (plan.walkEnd + plan.sitEnd) / 2).sit).toBeCloseTo(0.5, 6);
    expect(sampleWalk(plan, plan.sitEnd + 5).sit).toBe(1);
  });
});

describe('ease', () => {
  it('is 0 at the start, 1 at the end and symmetric', () => {
    expect(ease(-1)).toBe(0);
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(1)).toBe(1);
    expect(ease(2)).toBe(1);
    expect(ease(0.25) + ease(0.75)).toBeCloseTo(1, 10);
  });
});
