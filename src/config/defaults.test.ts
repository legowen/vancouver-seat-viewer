import { describe, expect, it } from 'vitest';
import { countSeats, resolveAuditorium } from '../data/resolve';
import { auditoriumSchema } from '../data/schema';
import { DIMENSION_LIMITS, SIZE_THRESHOLDS, defaultsFor, sizeClassFor } from './defaults';

function rowsWithSeats(total: number, perRow = 20) {
  const rows = [];
  let label = 0;
  for (let left = total; left > 0; left -= perRow) {
    rows.push({
      label: `R${label}`,
      seats: Array.from({ length: Math.min(perRow, left) }, (_unused, i) => i + 1),
    });
    label += 1;
  }
  return rows;
}

function resolve(patch: Record<string, unknown>) {
  return resolveAuditorium(
    auditoriumSchema.parse({
      id: 'test',
      theatreId: 'theatre',
      name: 'Test',
      rows: rowsWithSeats(100),
      ...patch,
    }),
  );
}

describe('size classes', () => {
  it('splits standard rooms at the configured seat counts', () => {
    const { medium, large } = SIZE_THRESHOLDS.standard;
    expect(sizeClassFor('standard', medium - 1)).toBe('small');
    expect(sizeClassFor('standard', medium)).toBe('medium');
    expect(sizeClassFor('standard', large - 1)).toBe('medium');
    expect(sizeClassFor('standard', large)).toBe('large');
  });

  it('uses a smaller scale for VIP rooms', () => {
    expect(sizeClassFor('vip', 40)).toBe('small');
    expect(sizeClassFor('vip', 68)).toBe('medium');
    expect(sizeClassFor('vip', 120)).toBe('large');
    expect(sizeClassFor('standard', 68)).toBe('small');
  });
});

describe('defaultsFor', () => {
  it('matches the starting assumptions for standard seats', () => {
    const defaults = defaultsFor('standard', 200);
    expect(defaults.rowSpacing_m).toBe(1.0);
    expect(defaults.seatWidth_m).toBe(0.55);
    expect(defaults.eyeHeight_m).toBe(1.15);
  });

  it('matches the starting assumptions for VIP recliners', () => {
    const defaults = defaultsFor('vip', 60);
    expect(defaults.rowSpacing_m).toBe(1.5);
    expect(defaults.seatWidth_m).toBe(0.75);
    expect(defaults.eyeHeight_m).toBe(1.15);
  });

  it.each(['standard', 'vip'] as const)(
    'makes the %s screen wider and further away as the room grows',
    (type) => {
      const small = defaultsFor(type, 1);
      const medium = defaultsFor(type, SIZE_THRESHOLDS[type].medium);
      const large = defaultsFor(type, SIZE_THRESHOLDS[type].large);
      expect(small.screenWidth_m).toBeLessThan(medium.screenWidth_m);
      expect(medium.screenWidth_m).toBeLessThan(large.screenWidth_m);
      expect(small.firstRowDistance_m).toBeLessThan(medium.firstRowDistance_m);
      expect(medium.firstRowDistance_m).toBeLessThan(large.firstRowDistance_m);
    },
  );

  it('keeps every default inside the limits the schema accepts', () => {
    for (const type of ['standard', 'vip'] as const) {
      for (const seats of [1, 60, 130, 300]) {
        const defaults = defaultsFor(type, seats);
        for (const [key, { min, max }] of Object.entries(DIMENSION_LIMITS)) {
          const value = defaults[key as keyof typeof defaults];
          expect(value).toBeGreaterThanOrEqual(min);
          expect(value).toBeLessThanOrEqual(max);
        }
      }
    }
  });
});

describe('resolveAuditorium', () => {
  it('fills every missing dimension and remembers which ones were defaults', () => {
    const auditorium = resolve({});
    expect(auditorium.seatCount).toBe(100);
    expect(auditorium.sizeClass).toBe('small');
    expect(auditorium.rowSpacing_m).toBe(1.0);
    expect(auditorium.seatWidth_m).toBe(0.55);
    expect(auditorium.defaulted).toHaveLength(8);
    expect(auditorium.verified).toBe(false);
    expect(auditorium.placeholder).toBe(false);
  });

  it('keeps explicit values and derives the screen height', () => {
    const auditorium = resolve({
      screen: { width_m: 14, aspect: 2 },
      rowSpacing_m: 1.2,
      verified: true,
    });
    expect(auditorium.screen.width_m).toBe(14);
    expect(auditorium.screen.height_m).toBe(7);
    expect(auditorium.rowSpacing_m).toBe(1.2);
    expect(auditorium.defaulted).not.toContain('screenWidth_m');
    expect(auditorium.defaulted).not.toContain('screenAspect');
    expect(auditorium.defaulted).not.toContain('rowSpacing_m');
    expect(auditorium.defaulted).toContain('screenBottomHeight_m');
    expect(auditorium.defaulted).toContain('seatWidth_m');
  });

  it('chooses defaults by type and by seat count', () => {
    expect(resolve({ type: 'vip' }).rowSpacing_m).toBe(1.5);
    expect(resolve({ type: 'vip' }).sizeClass).toBe('large');
    expect(resolve({ rows: rowsWithSeats(300) }).sizeClass).toBe('large');
    expect(resolve({ rows: rowsWithSeats(300) }).screen.width_m).toBeGreaterThan(
      resolve({}).screen.width_m,
    );
  });

  it('counts seats, not gaps', () => {
    expect(countSeats([{ seats: [1, null, 2] }, { seats: [null, 3] }])).toBe(3);
  });
});
