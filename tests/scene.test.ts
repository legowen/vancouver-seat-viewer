import { describe, expect, it } from 'vitest';
import { ROOM } from '../src/config/defaults';
import type { Auditorium } from '../src/data/schema';
import { findSeat, resolveAuditorium } from '../src/metrics/layout';
import { audienceInFrontOf } from '../src/scene/audience';
import { hashString, seededRandom } from '../src/scene/random';
import { floorAt, roomShape } from '../src/scene/room';

const auditorium: Auditorium = {
  id: 'scene-test',
  theatreId: 'a',
  name: 'Auditorium 1',
  type: 'standard',
  firstRowDistance_m: 5,
  rowSpacing_m: 1,
  rowRise_m: 0.4,
  rows: Array.from({ length: 12 }, (_, index) => ({
    label: String.fromCharCode(65 + index),
    seats: [1, 2, 3, 4, null, 5, 6, 7, 8, 9, 10, 11, 12, null, 13, 14, 15, 16],
  })),
};
const layout = resolveAuditorium(auditorium);

describe('seeded random numbers', () => {
  it('hashes the same text to the same number', () => {
    expect(hashString('riverport-07:K-23')).toBe(hashString('riverport-07:K-23'));
    expect(hashString('riverport-07:K-23')).not.toBe(hashString('riverport-07:K-24'));
  });

  it('repeats the same sequence for the same seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});

describe('audienceInFrontOf', () => {
  const viewer = findSeat(layout, 'J-8')!;

  it('only seats people in the rows in front of the viewer', () => {
    const audience = audienceInFrontOf(layout, viewer);
    expect(audience.length).toBeGreaterThan(0);
    expect(audience.every((member) => member.seat.rowIndex < viewer.rowIndex)).toBe(true);
  });

  it('shows the same crowd every time', () => {
    const keys = (members: ReturnType<typeof audienceInFrontOf>) =>
      members.map((member) => `${member.seat.key}:${member.offsetX}:${member.scale}`);
    expect(keys(audienceInFrontOf(layout, viewer))).toEqual(
      keys(audienceInFrontOf(layout, viewer)),
    );
  });

  it('keeps the same people in their seats when the viewer moves back', () => {
    const fromJ = audienceInFrontOf(layout, viewer).map((member) => member.seat.key);
    const fromL = audienceInFrontOf(layout, findSeat(layout, 'L-8')!).map(
      (member) => member.seat.key,
    );
    expect(fromL).toEqual(expect.arrayContaining(fromJ));
  });

  it('fills roughly the requested share of seats', () => {
    const inFront = layout.seats.filter((seat) => seat.rowIndex < viewer.rowIndex).length;
    const share = audienceInFrontOf(layout, viewer, 0.6).length / inFront;
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.75);
  });

  it('leaves the room empty in front of the first row', () => {
    expect(audienceInFrontOf(layout, findSeat(layout, 'A-8')!)).toEqual([]);
    expect(audienceInFrontOf(layout, null)).toEqual([]);
  });
});

describe('roomShape', () => {
  const room = roomShape(layout);

  it('leaves a side aisle beyond the outermost seats', () => {
    expect(room.halfWidth).toBeGreaterThanOrEqual(
      layout.seatingHalfWidth + ROOM.sideAisle_m - 1e-9,
    );
    expect(room.halfWidth).toBeGreaterThan(layout.screen.width / 2);
  });

  it('puts the back wall behind the last row and the ceiling above the screen', () => {
    const lastRow = layout.rows.at(-1)!;
    expect(room.back).toBeGreaterThan(lastRow.z + layout.dims.rowSpacing / 2);
    expect(room.ceiling).toBeGreaterThan(layout.screen.top);
    expect(room.ceiling).toBeGreaterThan(lastRow.floorY + 2.5);
  });
});

describe('floorAt', () => {
  it('is flat in front of the first row', () => {
    expect(floorAt(layout, 0)).toBe(0);
    expect(floorAt(layout, 4)).toBe(0);
  });

  it('matches the floor of the row at that depth', () => {
    for (const row of layout.rows) {
      expect(floorAt(layout, row.z)).toBeCloseTo(row.floorY);
    }
  });

  it('stays at the last row height in the back aisle', () => {
    expect(floorAt(layout, 100)).toBeCloseTo(layout.rows.at(-1)!.floorY);
  });
});
