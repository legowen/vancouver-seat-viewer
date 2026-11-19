import { describe, expect, it } from 'vitest';
import { parseHash, routeToHash, type Route } from '../src/app/routes';

describe('parseHash', () => {
  it('treats an empty hash as the home screen', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#')).toEqual({ name: 'home' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
  });

  it('reads the theatre id', () => {
    expect(parseHash('#/t/cineplex-coquitlam')).toEqual({
      name: 'theatre',
      theatreId: 'cineplex-coquitlam',
    });
  });

  it('sends a bare auditorium link to the trailer step', () => {
    expect(parseHash('#/t/alpha/alpha-1')).toEqual({
      name: 'trailer',
      theatreId: 'alpha',
      auditoriumId: 'alpha-1',
    });
    expect(parseHash('#/t/alpha/alpha-1/trailer')).toEqual({
      name: 'trailer',
      theatreId: 'alpha',
      auditoriumId: 'alpha-1',
    });
  });

  it('reads the trailer and the selected seat on the seat map', () => {
    expect(parseHash('#/t/alpha/alpha-1/seats?v=dQw4w9WgXcQ&seat=K-23')).toEqual({
      name: 'seats',
      theatreId: 'alpha',
      auditoriumId: 'alpha-1',
      videoId: 'dQw4w9WgXcQ',
      seatKey: 'K-23',
    });
    expect(parseHash('#/t/alpha/alpha-1/seats')).toEqual({
      name: 'seats',
      theatreId: 'alpha',
      auditoriumId: 'alpha-1',
      videoId: null,
      seatKey: null,
    });
  });

  it('reads the seat and options of the 3D view', () => {
    expect(parseHash('#/t/alpha/alpha-1/view/K-23?v=dQw4w9WgXcQ&fallback=1')).toEqual({
      name: 'view',
      theatreId: 'alpha',
      auditoriumId: 'alpha-1',
      seatKey: 'K-23',
      videoId: 'dQw4w9WgXcQ',
      forceFallback: true,
    });
  });

  it('drops a malformed video id instead of passing it on', () => {
    const route = parseHash('#/t/alpha/alpha-1/seats?v=<script>');
    expect(route).toMatchObject({ name: 'seats', videoId: null });
  });

  it('recognises the hidden editor page', () => {
    expect(parseHash('#/editor')).toEqual({ name: 'editor' });
  });

  it('returns notFound for anything else', () => {
    expect(parseHash('#/nope')).toEqual({ name: 'notFound' });
    expect(parseHash('#/t')).toEqual({ name: 'notFound' });
    expect(parseHash('#/t/a/b/view')).toEqual({ name: 'notFound' });
    expect(parseHash('#/t/a/b/c/d/e')).toEqual({ name: 'notFound' });
  });
});

describe('routeToHash', () => {
  const routes: Route[] = [
    { name: 'home' },
    { name: 'theatre', theatreId: 'alpha' },
    { name: 'trailer', theatreId: 'alpha', auditoriumId: 'alpha-1' },
    { name: 'seats', theatreId: 'alpha', auditoriumId: 'alpha-1', videoId: null, seatKey: null },
    {
      name: 'seats',
      theatreId: 'alpha',
      auditoriumId: 'alpha-1',
      videoId: 'dQw4w9WgXcQ',
      seatKey: 'K-23',
    },
    {
      name: 'view',
      theatreId: 'alpha',
      auditoriumId: 'alpha-1',
      seatKey: 'AA-7',
      videoId: 'dQw4w9WgXcQ',
      forceFallback: false,
    },
    { name: 'editor' },
  ];

  it.each(routes)('round-trips $name', (route) => {
    expect(parseHash(routeToHash(route))).toEqual(route);
  });

  it('writes readable hashes', () => {
    expect(routeToHash({ name: 'home' })).toBe('#/');
    expect(
      routeToHash({
        name: 'view',
        theatreId: 'alpha',
        auditoriumId: 'alpha-1',
        seatKey: 'K-23',
        videoId: 'dQw4w9WgXcQ',
        forceFallback: false,
      }),
    ).toBe('#/t/alpha/alpha-1/view/K-23?v=dQw4w9WgXcQ');
  });
});
