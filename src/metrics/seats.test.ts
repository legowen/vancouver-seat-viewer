import { describe, expect, it } from 'vitest';
import { makeLayout } from '../testing/fixtures';
import { bestSeat, evaluateSeats, seatScore } from './seats';

describe('evaluateSeats', () => {
  const layout = makeLayout();
  const evaluations = evaluateSeats(layout);

  it('rates every seat, in seat-map order', () => {
    expect(evaluations.size).toBe(layout.seats.length);
    expect([...evaluations.keys()]).toEqual(layout.seats.map((seat) => seat.id));
  });

  it('marks the front-row centre as too close', () => {
    const front = evaluations.get('A-9')!;
    expect(front.rating).toEqual({ band: 'avoid', reason: 'tooClose' });
    expect(front.metrics.distance_m).toBeGreaterThan(4.9);
  });

  it('gets wider bands further back', () => {
    const ranks = ['A-9', 'D-9', 'H-9', 'N-9'].map((id) => evaluations.get(id)!.rating.band);
    expect(ranks[0]).toBe('avoid');
    expect(ranks).toContain('prime');
    expect(ranks[3]).not.toBe('avoid');
  });

  it('rates mirrored seats the same', () => {
    expect(evaluations.get('F-1')!.rating).toEqual(evaluations.get('F-18')!.rating);
    expect(evaluations.get('F-1')!.metrics.offAxis_deg).toBeCloseTo(
      evaluations.get('F-18')!.metrics.offAxis_deg,
      10,
    );
  });
});

describe('bestSeat', () => {
  it('picks a central prime seat', () => {
    const best = bestSeat(evaluateSeats(makeLayout()).values())!;
    expect(best.rating.band).toBe('prime');
    expect(Math.abs(best.seat.x)).toBeLessThan(0.6);
  });

  it('prefers a better band over a more central seat', () => {
    const evaluations = [...evaluateSeats(makeLayout()).values()];
    const prime = evaluations.filter((e) => e.rating.band === 'prime');
    const others = evaluations.filter((e) => e.rating.band !== 'prime');
    const worstPrime = Math.max(...prime.map(seatScore));
    const bestOther = Math.min(...others.map(seatScore));
    expect(worstPrime).toBeLessThan(bestOther);
  });

  it('returns nothing for no seats', () => {
    expect(bestSeat([])).toBeUndefined();
  });

  it('breaks ties in seat-map order', () => {
    const one = evaluateSeats(makeLayout()).get('F-9')!;
    const twin = { ...one, seat: { ...one.seat, id: 'twin' } };
    expect(bestSeat([one, twin])!.seat.id).toBe('F-9');
  });
});
