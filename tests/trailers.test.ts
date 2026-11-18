import { describe, expect, it } from 'vitest';
import {
  checkVideo,
  isOfficialChannel,
  isoDate,
  judgeCandidate,
  judgeMovie,
  oembedUrl,
  type FetchLike,
} from '../scripts/trailers';

function answer(status: number, body: unknown = {}): FetchLike {
  return async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
  });
}

const movie = {
  id: 'some-movie',
  title: 'Some Movie',
  youtubeId: 'dQw4w9WgXcQ',
  channel: 'Universal Pictures',
  verifiedOn: '2026-11-01',
};

const candidate = {
  id: 'some-movie',
  title: 'Some Movie',
  youtubeId: 'dQw4w9WgXcQ',
  expectedChannel: 'Universal Pictures',
  foundAt: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
};

describe('oembedUrl', () => {
  it('asks oEmbed about the watch URL', () => {
    expect(oembedUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&format=json',
    );
  });
});

describe('checkVideo', () => {
  it('reads the channel from a 200 answer', async () => {
    expect(
      await checkVideo('x', answer(200, { author_name: ' Universal Pictures ', title: 'T' })),
    ).toEqual({
      status: 'ok',
      channel: 'Universal Pictures',
      title: 'T',
    });
  });

  it.each([
    [401, 'not-embeddable'],
    [403, 'not-embeddable'],
    [404, 'missing'],
    [500, 'error'],
  ])('maps HTTP %i to %s', async (status, expected) => {
    expect((await checkVideo('x', answer(status))).status).toBe(expected);
  });

  it('treats a 200 without author_name or JSON as an error', async () => {
    expect((await checkVideo('x', answer(200, {}))).status).toBe('error');
    expect((await checkVideo('x', answer(200, new Error('bad json')))).status).toBe('error');
  });

  it('reports a network failure as unreachable, not as a dead video', async () => {
    const offline: FetchLike = async () => {
      throw new Error('getaddrinfo ENOTFOUND www.youtube.com');
    };
    expect(await checkVideo('x', offline)).toEqual({
      status: 'unreachable',
      detail: 'getaddrinfo ENOTFOUND www.youtube.com',
    });
  });
});

describe('official channels', () => {
  it('accepts studio channels regardless of case and punctuation', () => {
    expect(isOfficialChannel('Universal Pictures')).toBe(true);
    expect(isOfficialChannel('warner bros. uk and ireland')).toBe(true);
    expect(isOfficialChannel('A24')).toBe(true);
  });

  it('rejects aggregators and fan channels', () => {
    for (const name of ['Rotten Tomatoes Trailers', 'KinoCheck', 'IGN', 'JoBlo Movie Trailers']) {
      expect(isOfficialChannel(name)).toBe(false);
    }
  });
});

describe('judgeMovie', () => {
  it('keeps a trailer that still comes from its channel', () => {
    expect(
      judgeMovie(movie, { status: 'ok', channel: 'Universal Pictures', title: '' }).alive,
    ).toBe(true);
  });

  it('flags a trailer that is gone, blocked or re-uploaded elsewhere', () => {
    expect(judgeMovie(movie, { status: 'missing', httpStatus: 404 }).alive).toBe(false);
    expect(judgeMovie(movie, { status: 'not-embeddable', httpStatus: 401 }).alive).toBe(false);
    const moved = judgeMovie(movie, { status: 'ok', channel: 'Someone Else', title: '' });
    expect(moved.alive).toBe(false);
    expect(moved.reason).toContain('Someone Else');
  });
});

describe('judgeCandidate', () => {
  it('turns an official, embeddable candidate into a movie entry dated today', () => {
    const report = judgeCandidate(
      candidate,
      { status: 'ok', channel: 'Universal Pictures', title: '' },
      '2026-11-18',
    );
    expect(report.movie).toEqual({
      id: 'some-movie',
      title: 'Some Movie',
      youtubeId: 'dQw4w9WgXcQ',
      channel: 'Universal Pictures',
      verifiedOn: '2026-11-18',
    });
  });

  it('keeps a candidate from an unknown channel out of the list', () => {
    const report = judgeCandidate(
      candidate,
      { status: 'ok', channel: 'Trailer Vault', title: '' },
      '2026-11-18',
    );
    expect(report.movie).toBeUndefined();
    expect(report.reason).toContain('Trailer Vault');
  });

  it('keeps a candidate that cannot be embedded out of the list', () => {
    const report = judgeCandidate(
      candidate,
      { status: 'not-embeddable', httpStatus: 403 },
      '2026-11-18',
    );
    expect(report.movie).toBeUndefined();
  });
});

describe('isoDate', () => {
  it('formats a local date', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
