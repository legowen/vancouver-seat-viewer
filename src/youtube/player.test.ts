import { describe, expect, it } from 'vitest';
import { isEmbedBlocked, parseEmbedMessage } from './player';

describe('parseEmbedMessage', () => {
  it('reads ready, mute state and errors from the embed', () => {
    expect(parseEmbedMessage('{"event":"onReady","info":null}')).toEqual([{ type: 'ready' }]);
    expect(
      parseEmbedMessage('{"event":"infoDelivery","info":{"muted":false,"volume":100}}'),
    ).toEqual([{ type: 'muted', muted: false }]);
    expect(parseEmbedMessage('{"event":"onError","info":150}')).toEqual([
      { type: 'error', code: 150 },
    ]);
  });

  it('treats the first state report as ready', () => {
    expect(parseEmbedMessage({ event: 'initialDelivery', info: { muted: true } })).toEqual([
      { type: 'muted', muted: true },
      { type: 'ready' },
    ]);
  });

  it('ignores anything else', () => {
    expect(parseEmbedMessage('not json')).toEqual([]);
    expect(parseEmbedMessage(null)).toEqual([]);
    expect(parseEmbedMessage(42)).toEqual([]);
    expect(parseEmbedMessage({ event: 'infoDelivery', info: { currentTime: 3 } })).toEqual([]);
    expect(parseEmbedMessage({ event: 'onStateChange', info: 1 })).toEqual([]);
    expect(parseEmbedMessage({ event: 'onError', info: 'oops' })).toEqual([]);
  });
});

describe('isEmbedBlocked', () => {
  it('recognises the "not allowed on other sites" codes', () => {
    expect(isEmbedBlocked(101)).toBe(true);
    expect(isEmbedBlocked(150)).toBe(true);
    expect(isEmbedBlocked(100)).toBe(false);
    expect(isEmbedBlocked(5)).toBe(false);
  });
});
