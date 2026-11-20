import { describe, expect, it } from 'vitest';
import { judgeOembed } from '../scripts/oembed';
import { embedUrl, thumbnailUrl, watchUrl } from '../src/youtube/embed';
import { parseYouTubeUrl } from '../src/youtube/parse';

const ID = 'dQw4w9WgXcQ';

describe('parseYouTubeUrl accepts the supported forms', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`http://www.youtube.com/watch?v=${ID}`],
    [`www.youtube.com/watch?v=${ID}`],
    [`youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com/watch?feature=share&v=${ID}&t=42s`],
    [`https://www.youtube.com/watch?v=${ID}&list=PL1234567890`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=AbCdEf123&t=10`],
    [`youtu.be/${ID}`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://youtube.com/shorts/${ID}?feature=share`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube.com/embed/${ID}?start=30`],
    [`https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`],
    [`  https://www.youtube.com/watch?v=${ID}  `],
  ])('%s', (input) => {
    expect(parseYouTubeUrl(input)).toEqual({ ok: true, id: ID });
  });

  it('keeps ids with dashes and underscores intact', () => {
    expect(parseYouTubeUrl('https://youtu.be/-W6qcZ6kbm4')).toEqual({
      ok: true,
      id: '-W6qcZ6kbm4',
    });
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=__HvK3bHLbs')).toEqual({
      ok: true,
      id: '__HvK3bHLbs',
    });
  });
});

describe('parseYouTubeUrl rejects everything else with a reason', () => {
  it('asks for a link when the input is empty', () => {
    expect(parseYouTubeUrl('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseYouTubeUrl('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it.each([
    ['https://vimeo.com/123456789'],
    ['https://example.com/watch?v=dQw4w9WgXcQ'],
    ['https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'],
    ['https://notyoutube.com/watch?v=dQw4w9WgXcQ'],
    ['javascript:alert(1)'],
    ['just some words'],
    [ID],
  ])('rejects %s as not a YouTube link', (input) => {
    expect(parseYouTubeUrl(input)).toEqual({ ok: false, reason: 'notYouTube' });
  });

  it.each([
    ['https://www.youtube.com/'],
    ['https://www.youtube.com/@WarnerBros'],
    ['https://www.youtube.com/playlist?list=PL1234567890'],
    ['https://www.youtube.com/watch?v=tooShort'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQextra'],
    ['https://youtu.be/'],
    ['https://www.youtube.com/shorts/'],
    ['https://www.youtube.com/embed/videoseries?list=PL1234567890'],
    ['https://www.youtube.com/watch?v=dQw4w9WgX!Q'],
  ])('rejects %s as having no single video', (input) => {
    expect(parseYouTubeUrl(input)).toEqual({ ok: false, reason: 'noVideo' });
  });
});

describe('YouTube URLs', () => {
  it('builds the privacy-enhanced embed URL with the required parameters', () => {
    const url = new URL(embedUrl(ID, 'https://example.github.io'));
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe(`/embed/${ID}`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      autoplay: '1',
      mute: '1',
      playsinline: '1',
      rel: '0',
      modestbranding: '1',
      controls: '1',
      enablejsapi: '1',
      origin: 'https://example.github.io',
    });
  });

  it('links to the watch page and the still frame', () => {
    expect(watchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(thumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });
});

describe('judgeOembed', () => {
  it('accepts a 200 from the expected channel', () => {
    expect(
      judgeOembed(200, { author_name: 'Warner Bros.', title: 'Dune' }, 'Warner Bros.'),
    ).toEqual({ ok: true, title: 'Dune' });
  });

  it('flags a video now uploaded by another channel', () => {
    expect(judgeOembed(200, { author_name: 'Some Fan' }, 'Warner Bros.')).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Some Fan'),
    });
  });

  it.each([
    [401, 'embedding'],
    [403, 'embedding'],
    [404, 'not found'],
    [500, 'HTTP 500'],
  ])('reports HTTP %d as dead (%s)', (status, words) => {
    expect(judgeOembed(status, null, 'Warner Bros.')).toMatchObject({
      ok: false,
      reason: expect.stringContaining(words),
    });
  });
});
