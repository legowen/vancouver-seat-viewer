import { describe, expect, it } from 'vitest';
import { RATING } from '../src/config/rating';
import type { Auditorium } from '../src/data/schema';
import { pickDefaultSeat, rateLayout } from '../src/metrics';
import { resolveAuditorium } from '../src/metrics/layout';
import {
  computeSeatMetrics,
  offAxisDeg,
  verticalAngleToTopDeg,
  viewingAngleDeg,
} from '../src/metrics/metrics';
import { rateSeat } from '../src/metrics/rating';
import type { SeatMetrics } from '../src/metrics/metrics';

const DEG = Math.PI / 180;

describe('viewingAngleDeg', () => {
  it('follows 2 · atan((width / 2) / distance)', () => {
    expect(viewingAngleDeg(14, 7)).toBeCloseTo(90);
    expect(viewingAngleDeg(12, 6 / Math.tan(30 * DEG))).toBeCloseTo(60);
  });

  it('shrinks as the seat moves away from the screen', () => {
    expect(viewingAngleDeg(12, 8)).toBeGreaterThan(viewingAngleDeg(12, 9));
  });
});

describe('offAxisDeg', () => {
  it('is zero on the centre line and 45° when the side offset equals the distance', () => {
    expect(offAxisDeg(0, 10)).toBe(0);
    expect(offAxisDeg(10, 10)).toBeCloseTo(45);
  });

  it('is the same on both sides', () => {
    expect(offAxisDeg(-3, 10)).toBeCloseTo(offAxisDeg(3, 10));
  });
});

describe('verticalAngleToTopDeg', () => {
  it('measures how far you look up to the top edge', () => {
    expect(verticalAngleToTopDeg(1.15, 7.15, 6)).toBeCloseTo(45);
  });

  it('is negative when the top edge is below your eyes', () => {
    expect(verticalAngleToTopDeg(8, 7, 20)).toBeLessThan(0);
  });
});

describe('computeSeatMetrics', () => {
  const screen = { width: 12, centerY: 4, top: 6.5 };

  it('measures the straight-line distance from the eyes to the screen centre', () => {
    expect(computeSeatMetrics({ x: 0, y: 4, z: 10 }, screen).distance).toBeCloseTo(10);
    expect(computeSeatMetrics({ x: 3, y: 8, z: 12 }, screen).distance).toBeCloseTo(13);
  });

  it('uses the distance to the screen plane for the viewing angle, not the slant distance', () => {
    const centre = computeSeatMetrics({ x: 0, y: 4, z: 10 }, screen);
    const side = computeSeatMetrics({ x: 5, y: 4, z: 10 }, screen);
    expect(side.viewingAngle).toBeCloseTo(centre.viewingAngle);
    expect(centre.viewingAngle).toBeCloseTo(viewingAngleDeg(12, 10));
  });

  it('reports the side angle and the angle up to the top of the screen', () => {
    const metrics = computeSeatMetrics({ x: 4, y: 2.5, z: 4 }, screen);
    expect(metrics.offAxis).toBeCloseTo(45);
    expect(metrics.verticalToTop).toBeCloseTo(45);
  });
});

function metrics(overrides: Partial<SeatMetrics>): SeatMetrics {
  return { distance: 15, viewingAngle: 50, offAxis: 0, verticalToTop: 10, ...overrides };
}

describe('rateSeat bands by viewing angle', () => {
  it.each([
    [75, 'avoid'],
    [60.1, 'avoid'],
    [60, 'prime'],
    [50, 'prime'],
    [45, 'prime'],
    [44.9, 'recommended'],
    [36, 'recommended'],
    [35.9, 'ok'],
    [30, 'ok'],
    [29.9, 'meh'],
    [12, 'meh'],
  ] as const)('%d° is %s', (viewingAngle, band) => {
    expect(rateSeat(metrics({ viewingAngle })).band).toBe(band);
  });
});

describe('rateSeat reasons and verdicts', () => {
  it('gives each comfortable band its own verdict', () => {
    expect(rateSeat(metrics({ viewingAngle: 50 })).verdict).toBe('verdict.prime');
    expect(rateSeat(metrics({ viewingAngle: 40 })).verdict).toBe('verdict.recommended');
    expect(rateSeat(metrics({ viewingAngle: 32 })).verdict).toBe('verdict.ok');
    expect(rateSeat(metrics({ viewingAngle: 25 })).verdict).toBe('verdict.meh');
  });

  it('avoids seats where you have to turn your head', () => {
    const rating = rateSeat(metrics({ viewingAngle: 70 }));
    expect(rating).toMatchObject({ band: 'avoid', reasons: ['tooClose'] });
    expect(rating.verdict).toBe('verdict.tooClose');
  });

  it('avoids seats where you look up too steeply, whatever the viewing angle', () => {
    const rating = rateSeat(metrics({ viewingAngle: 50, verticalToTop: 36 }));
    expect(rating).toMatchObject({ band: 'avoid', reasons: ['neck'], verdict: 'verdict.neck' });
  });

  it('avoids seats with a strong side angle', () => {
    const rating = rateSeat(metrics({ viewingAngle: 50, offAxis: 36 }));
    expect(rating).toMatchObject({ band: 'avoid', reasons: ['side'], verdict: 'verdict.side' });
  });

  it('lists every reason, with neck strain first', () => {
    const rating = rateSeat(metrics({ viewingAngle: 90, verticalToTop: 50, offAxis: 40 }));
    expect(rating.reasons).toEqual(['neck', 'tooClose', 'side']);
    expect(rating.verdict).toBe('verdict.neck');
  });

  it('moves a seat one band down for a moderate side angle', () => {
    expect(rateSeat(metrics({ viewingAngle: 50, offAxis: 26 }))).toMatchObject({
      band: 'recommended',
      reasons: ['sideMild'],
      verdict: 'verdict.sideMild',
    });
    expect(rateSeat(metrics({ viewingAngle: 40, offAxis: 30 })).band).toBe('ok');
    expect(rateSeat(metrics({ viewingAngle: 50, offAxis: 25 })).band).toBe('prime');
  });

  it('never moves a seat into "avoid" just for a moderate side angle', () => {
    expect(rateSeat(metrics({ viewingAngle: 20, offAxis: 30 })).band).toBe('meh');
  });

  it('accepts tuned thresholds', () => {
    const strict = { ...RATING, maxViewingAngle: 50 };
    expect(rateSeat(metrics({ viewingAngle: 55 }), strict).band).toBe('avoid');
    expect(rateSeat(metrics({ viewingAngle: 55 })).band).toBe('prime');
  });
});

describe('rateLayout and pickDefaultSeat', () => {
  const sample: Auditorium = {
    id: 'a-1',
    theatreId: 'a',
    name: 'Auditorium 1',
    type: 'standard',
    rows: Array.from({ length: 14 }, (_, index) => ({
      label: String.fromCharCode(65 + index),
      seats: [1, 2, 3, 4, null, 5, 6, 7, 8, 9, 10, 11, 12, null, 13, 14, 15, 16],
    })),
  };
  const layout = resolveAuditorium(sample);
  const rated = rateLayout(layout);

  it('rates every seat', () => {
    expect(rated.size).toBe(layout.seatCount);
    for (const seat of layout.seats) {
      expect(rated.get(seat.key)?.rating.band).toBeDefined();
    }
  });

  it('rates front-row seats worse than mid-room seats', () => {
    expect(rated.get('A-8')!.rating.band).toBe('avoid');
    const bandsBehind = layout.seats
      .filter((seat) => seat.rowIndex >= 8 && seat.number === 8)
      .map((seat) => rated.get(seat.key)!.rating.band);
    expect(bandsBehind).not.toContain('avoid');
  });

  it('suggests a seat from the best band, near the centre line', () => {
    const key = pickDefaultSeat(rated)!;
    const best = rated.get(key)!;
    expect(best.rating.band).toBe('prime');
    expect(best.metrics.offAxis).toBeLessThan(3);
  });

  it('suggests nothing for an empty map', () => {
    expect(pickDefaultSeat(new Map())).toBeNull();
  });
});
