import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAND_COLORS, BANDS, RATING } from '../config/rating';
import en from '../i18n/locales/en.json';
import type { SeatMetrics } from './metrics';
import { bandLabelKey, bandRank, rateSeat, verdictKey, type SeatRating } from './rating';

function m(viewingAngle: number, offAxis = 0, vertical = 10): SeatMetrics {
  return {
    distance_m: 10,
    viewingAngle_deg: viewingAngle,
    offAxis_deg: offAxis,
    verticalAngle_deg: vertical,
  };
}

describe('rateSeat: bands from the viewing angle', () => {
  it.each([
    [60, 'prime'],
    [52, 'prime'],
    [45, 'prime'],
    [44.99, 'recommended'],
    [40, 'recommended'],
    [36, 'recommended'],
    [35.99, 'ok'],
    [33, 'ok'],
    [30, 'ok'],
    [29.99, 'meh'],
    [12, 'meh'],
  ])('%s° is %s', (angle, band) => {
    expect(rateSeat(m(angle))).toEqual({ band, reason: null });
  });
});

describe('rateSeat: avoid', () => {
  it('avoids a viewing angle over 60°', () => {
    expect(rateSeat(m(60.01))).toEqual({ band: 'avoid', reason: 'tooClose' });
    expect(rateSeat(m(95))).toEqual({ band: 'avoid', reason: 'tooClose' });
  });

  it('avoids looking up more than 35° to the top of the screen', () => {
    expect(rateSeat(m(50, 0, 35)).band).toBe('prime');
    expect(rateSeat(m(50, 0, 35.01))).toEqual({ band: 'avoid', reason: 'neck' });
  });

  it('avoids a side angle over 35°', () => {
    expect(rateSeat(m(40, 35)).band).not.toBe('avoid');
    expect(rateSeat(m(40, 35.01))).toEqual({ band: 'avoid', reason: 'side' });
  });

  it('reports the first reason that applies: too close, then neck, then side', () => {
    expect(rateSeat(m(70, 40, 40)).reason).toBe('tooClose');
    expect(rateSeat(m(50, 40, 40)).reason).toBe('neck');
    expect(rateSeat(m(50, 40, 20)).reason).toBe('side');
  });
});

describe('rateSeat: side-angle demotion', () => {
  it('keeps the band up to 25° off-axis', () => {
    expect(rateSeat(m(50, 25))).toEqual({ band: 'prime', reason: null });
  });

  it.each([
    ['prime', 50, 'recommended'],
    ['recommended', 40, 'ok'],
    ['ok', 32, 'meh'],
    ['meh', 20, 'meh'],
  ] as const)('moves %s one band down past 25°', (_from, angle, to) => {
    expect(rateSeat(m(angle, 25.01))).toEqual({ band: to, reason: 'offAxis' });
  });
});

describe('rateSeat: thresholds come from config', () => {
  it('uses the configured numbers', () => {
    expect(RATING).toEqual({
      avoidViewingAngle: 60,
      avoidVerticalAngle: 35,
      avoidOffAxis: 35,
      primeMin: 45,
      recommendedMin: 36,
      okMin: 30,
      demoteOffAxis: 25,
    });
  });

  it('accepts other thresholds', () => {
    const strict = { ...RATING, avoidViewingAngle: 50, primeMin: 40 };
    expect(rateSeat(m(55), strict).band).toBe('avoid');
    expect(rateSeat(m(42), strict).band).toBe('prime');
  });
});

describe('verdictKey', () => {
  const cases: [SeatRating, string][] = [
    [{ band: 'prime', reason: null }, 'verdict.prime'],
    [{ band: 'recommended', reason: null }, 'verdict.recommended'],
    [{ band: 'ok', reason: null }, 'verdict.ok'],
    [{ band: 'meh', reason: null }, 'verdict.meh'],
    [{ band: 'avoid', reason: 'tooClose' }, 'verdict.avoidTooClose'],
    [{ band: 'avoid', reason: 'neck' }, 'verdict.avoidNeck'],
    [{ band: 'avoid', reason: 'side' }, 'verdict.avoidSide'],
    [{ band: 'recommended', reason: 'offAxis' }, 'verdict.offAxis'],
    [{ band: 'ok', reason: 'offAxis' }, 'verdict.offAxis'],
    [{ band: 'meh', reason: 'offAxis' }, 'verdict.mehOffAxis'],
  ];

  it.each(cases)('%o → %s', (rating, key) => {
    expect(verdictKey(rating)).toBe(key);
  });

  it('only returns keys that exist in en.json', () => {
    for (const [rating] of cases) expect(en).toHaveProperty([verdictKey(rating)]);
    for (const band of BANDS) expect(en).toHaveProperty([bandLabelKey(band)]);
  });
});

describe('bands', () => {
  it('are ordered best first', () => {
    expect(BANDS).toEqual(['prime', 'recommended', 'ok', 'meh', 'avoid']);
    expect(bandRank('prime')).toBe(0);
    expect(bandRank('avoid')).toBe(4);
  });

  it('use the same colours as the --band-* CSS variables', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
    for (const band of BANDS) {
      const match = new RegExp(`--band-${band}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
      expect(match?.[1]?.toLowerCase(), band).toBe(BAND_COLORS[band].toLowerCase());
    }
  });
});
