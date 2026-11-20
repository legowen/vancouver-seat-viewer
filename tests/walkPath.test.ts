import { describe, expect, it } from 'vitest';
import { WALK } from '../src/config/walk';
import type { Auditorium } from '../src/data/schema';
import { findSeat, resolveAuditorium, type AuditoriumLayout } from '../src/metrics/layout';
import { floorAt, roomShape, rowFrontZ } from '../src/scene/room';
import { planWalk, pointAlong, smoothFloorAt } from '../src/scene/walkPath';

function room(overrides: Partial<Auditorium> = {}, rows = 12, perSide = 4): AuditoriumLayout {
  const middle = Array.from({ length: 10 }, (_, index) => index + perSide + 1);
  const left = Array.from({ length: perSide }, (_, index) => index + 1);
  const right = Array.from({ length: perSide }, (_, index) => index + perSide + 11);
  return resolveAuditorium({
    id: 'walk-test',
    theatreId: 't',
    name: 'Walk',
    type: 'standard',
    rows: Array.from({ length: rows }, (_, index) => ({
      label: String.fromCharCode(65 + index),
      seats: [...left, null, ...middle, null, ...right],
    })),
    ...overrides,
  });
}

describe('smoothFloorAt', () => {
  const layout = room();

  it('matches the stepped floor away from the risers', () => {
    for (const row of layout.rows) {
      expect(smoothFloorAt(layout, row.z)).toBeCloseTo(floorAt(layout, row.z));
    }
  });

  it('climbs each step without jumping', () => {
    let previous = smoothFloorAt(layout, 0);
    for (let z = 0; z <= roomShape(layout).back; z += 0.01) {
      const height = smoothFloorAt(layout, z);
      expect(height).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(height - previous).toBeLessThan(layout.dims.rowRise / 4);
      previous = height;
    }
  });

  it('is halfway up the step right at a riser', () => {
    const z = rowFrontZ(layout, 3);
    const below = layout.rows[2]!.floorY;
    const above = layout.rows[3]!.floorY;
    expect(smoothFloorAt(layout, z)).toBeCloseTo((below + above) / 2);
  });
});

describe('planWalk', () => {
  const layout = room();
  const shape = roomShape(layout);

  it('starts at the entrance door', () => {
    const plan = planWalk(layout, findSeat(layout, 'F-8')!);
    const start = plan.waypoints[0]!;
    expect(start.x).toBeLessThan(-shape.halfWidth + 1); // front-left
    expect(start.z).toBeLessThan(layout.dims.firstRowDistance);
  });

  it('starts at the back for a back entrance', () => {
    const backRoom = room({ entrance: 'back-right' });
    const plan = planWalk(backRoom, findSeat(backRoom, 'F-8')!);
    const start = plan.waypoints[0]!;
    expect(start.x).toBeGreaterThan(roomShape(backRoom).halfWidth - 1);
    expect(start.z).toBeGreaterThan(backRoom.rows.at(-1)!.z);
  });

  it('ends in the row, right in front of the seat', () => {
    const seat = findSeat(layout, 'F-8')!;
    const plan = planWalk(layout, seat);
    const end = plan.waypoints.at(-1)!;
    expect(end.x).toBeCloseTo(seat.x);
    expect(end.z).toBeLessThan(seat.z);
    expect(end.z).toBeGreaterThan(rowFrontZ(layout, seat.rowIndex));
    expect(floorAt(layout, end.z)).toBeCloseTo(seat.floorY);
  });

  it('takes the side aisle nearer the seat', () => {
    const leftPlan = planWalk(layout, findSeat(layout, 'F-2')!);
    const rightPlan = planWalk(layout, findSeat(layout, 'F-17')!);
    expect(leftPlan.aisleX).toBeLessThan(0);
    expect(rightPlan.aisleX).toBeGreaterThan(0);
    expect(Math.abs(rightPlan.aisleX)).toBeGreaterThan(layout.seatingHalfWidth);
    expect(Math.abs(rightPlan.aisleX)).toBeLessThan(shape.halfWidth);
  });

  it('walks up the side aisle, not through the seats', () => {
    const seat = findSeat(layout, 'K-17')!;
    const plan = planWalk(layout, seat);
    const [, , aisleEnd] = plan.waypoints;
    expect(aisleEnd!.x).toBeCloseTo(plan.aisleX);
    expect(aisleEnd!.z).toBeCloseTo(plan.waypoints.at(-1)!.z);
  });

  it.each([
    ['a small room', room({}, 8, 2), 'D-5'],
    ['a large room', room({}, 16, 6), 'P-1'],
    ['a VIP room', room({ type: 'vip' }, 6, 2), 'F-3'],
  ])('takes 4 to 6 seconds in %s', (_, layoutUnderTest, key) => {
    const plan = planWalk(layoutUnderTest, findSeat(layoutUnderTest, key)!);
    expect(plan.totalDuration).toBeGreaterThanOrEqual(4);
    expect(plan.totalDuration).toBeLessThanOrEqual(6);
    expect(plan.totalDuration).toBeCloseTo(plan.walkDuration + WALK.sitSeconds);
  });
});

describe('pointAlong', () => {
  const layout = room();
  const plan = planWalk(layout, findSeat(layout, 'H-12')!);

  it('starts at the first waypoint and ends at the last', () => {
    expect(pointAlong(plan, 0)).toMatchObject(plan.waypoints[0]!);
    expect(pointAlong(plan, plan.length)).toMatchObject(plan.waypoints.at(-1)!);
    expect(pointAlong(plan, plan.length + 5)).toMatchObject(plan.waypoints.at(-1)!);
  });

  it('reports the direction of travel along each leg', () => {
    const [first, second] = plan.waypoints;
    const point = pointAlong(plan, 0.01);
    expect(point.heading).toBeCloseTo(Math.atan2(second!.x - first!.x, second!.z - first!.z));
    expect(point.leg).toBe(0);
  });

  it('marks the last leg, where the avatar side-steps along the row', () => {
    expect(pointAlong(plan, plan.length - 0.01).leg).toBe(plan.waypoints.length - 2);
  });
});
