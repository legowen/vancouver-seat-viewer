import { describe, expect, it } from 'vitest';
import { embedUrl, parseYouTubeUrl, thumbnailUrl, watchUrl } from './url';

const ID = 'dQw4w9WgXcQ';

describe('parseYouTubeUrl: accepted forms', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`http://www.youtube.com/watch?v=${ID}`],
    [`www.youtube.com/watch?v=${ID}`],
    [`youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com/watch?v=${ID}&t=42s`],
    [`https://www.youtube.com/watch?feature=share&v=${ID}`],
    [`https://www.youtube.com/watch/?v=${ID}`],
    [`https://youtu.be/${ID}`],
    [`youtu.be/${ID}?si=abc123&t=10`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://youtube.com/shorts/${ID}?feature=share`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube.com/embed/${ID}?autoplay=1`],
    [`https://www.youtube-nocookie.com/embed/${ID}`],
    [`  https://youtu.be/${ID}  `],
    [`HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`],
  ])('reads the id from %s', (input) => {
    expect(parseYouTubeUrl(input)).toEqual({ ok: true, id: ID });
  });

  it('keeps ids with dashes and underscores', () => {
    expect(parseYouTubeUrl('https://youtu.be/Haw_sznA5aQ')).toEqual({
      ok: true,
      id: 'Haw_sznA5aQ',
    });
    expect(parseYouTubeUrl('https://youtu.be/NEB6j0-ZYDQ')).toEqual({
      ok: true,
      id: 'NEB6j0-ZYDQ',
    });
  });
});

describe('parseYouTubeUrl: rejected input', () => {
  it('says when nothing was pasted', () => {
    expect(parseYouTubeUrl('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseYouTubeUrl('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it.each([
    [ID, 'a bare id'],
    ['not a link', 'plain text'],
    ['https://vimeo.com/123456789', 'another site'],
    [`https://youtube.com.evil.example/watch?v=${ID}`, 'a look-alike host'],
    [`https://evil.example/watch?v=${ID}`, 'another host with the same path'],
    [`https://www.youtube.com/watch?v=${ID.slice(0, 10)}`, 'a short id'],
    [`https://www.youtube.com/watch?v=${ID}x`, 'a long id'],
    ['https://www.youtube.com/watch?v=dQw4w9WgX!Q', 'an id with a bad character'],
    ['https://www.youtube.com/watch', 'a watch link without v'],
    [`https://www.youtube.com/live/${ID}`, 'a live link'],
    [`https://www.youtube.com/v/${ID}`, 'the old /v/ form'],
    ['https://www.youtube.com/playlist?list=PL1234567890', 'a playlist'],
    ['https://www.youtube.com/embed/videoseries?list=PL1234567890', 'an embedded playlist'],
    ['https://www.youtube.com/embed/live_stream?channel=UC1234567890', 'an embedded live stream'],
    ['https://www.youtube.com/@SomeChannel', 'a channel'],
    [`https://youtu.be/${ID}/extra`, 'a youtu.be link with extra path'],
    [`https://youtu.be/`, 'a youtu.be link without id'],
    [`https://www.youtube-nocookie.com/watch?v=${ID}`, 'a nocookie watch link'],
    [`ftp://youtube.com/watch?v=${ID}`, 'another protocol'],
    [`javascript:alert(1)//youtube.com/watch?v=${ID}`, 'a script link'],
  ])('rejects %s (%s)', (input) => {
    expect(parseYouTubeUrl(input)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('YouTube URLs the app builds', () => {
  it('uses the official thumbnail and watch addresses', () => {
    expect(thumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
    expect(watchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });

  it('embeds through youtube-nocookie, muted, inline, with the JS API on', () => {
    const url = new URL(embedUrl(ID, 'https://legowen.github.io'));
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe(`/embed/${ID}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      autoplay: '1',
      mute: '1',
      playsinline: '1',
      rel: '0',
      modestbranding: '1',
      controls: '1',
      enablejsapi: '1',
      origin: 'https://legowen.github.io',
    });
  });
});
