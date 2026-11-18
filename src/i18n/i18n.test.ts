import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOCALE,
  formatDegrees,
  formatMeters,
  getCatalog,
  localeLabel,
  locales,
  localizedName,
  matchLocale,
  pickInitialLocale,
  readStoredLocale,
  storeLocale,
  translate,
} from './index';

const en = getCatalog('en')!;
const enKeys = Object.keys(en);
const others = locales.filter((code) => code !== DEFAULT_LOCALE);

function placeholders(text: string): string[] {
  return (text.match(/\{\w+\}/g) ?? []).sort();
}

describe('locale files', () => {
  it('ships English, Korean and Simplified Chinese', () => {
    expect(locales).toEqual(expect.arrayContaining(['en', 'ko', 'zh-Hans']));
    expect(locales[0]).toBe('en');
  });

  it.each(others)('%s has every key that en has', (code) => {
    const catalog = getCatalog(code)!;
    const missing = enKeys.filter((key) => !(key in catalog));
    expect(missing).toEqual([]);
  });

  it.each(others)('%s has no keys that en lacks', (code) => {
    const extra = Object.keys(getCatalog(code)!).filter((key) => !(key in en));
    expect(extra).toEqual([]);
  });

  it.each(locales)('%s has no empty strings', (code) => {
    const empty = Object.entries(getCatalog(code)!)
      .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it.each(others)('%s uses the same placeholders as en', (code) => {
    const catalog = getCatalog(code)!;
    const mismatched = enKeys.filter(
      (key) => key in catalog && placeholders(catalog[key]).join() !== placeholders(en[key]).join(),
    );
    expect(mismatched).toEqual([]);
  });

  it('labels the language switcher from the locale files', () => {
    expect(localeLabel('en')).toBe('EN');
    expect(localeLabel('ko')).toBe('한국어');
    expect(localeLabel('zh-Hans')).toBe('中文');
  });

  it('keeps plural keys in pairs', () => {
    const lonely = enKeys.filter(
      (key) =>
        (key.endsWith('.one') && !(`${key.slice(0, -4)}.other` in en)) ||
        (key.endsWith('.other') && !(`${key.slice(0, -6)}.one` in en)),
    );
    expect(lonely).toEqual([]);
  });

  it('keeps the disclaimer recognisable in every language', () => {
    for (const code of locales) {
      expect(getCatalog(code)!['app.disclaimer']).toContain('Cineplex Entertainment');
    }
  });
});

describe('translate', () => {
  it('fills placeholders', () => {
    expect(translate('en', 'seat.name', { row: 'K', seat: 23 })).toBe('Row K, Seat 23');
  });

  it('leaves unknown placeholders visible instead of printing "undefined"', () => {
    expect(translate('en', 'seat.name', { row: 'K' })).toBe('Row K, Seat {seat}');
  });

  it('falls back to English for a locale or key that is missing', () => {
    expect(translate('xx', 'seatmap.take')).toBe(en['seatmap.take']);
  });
});

describe('matchLocale', () => {
  const available = ['en', 'ko', 'zh-Hans'];

  it.each([
    ['en', 'en'],
    ['en-CA', 'en'],
    ['ko', 'ko'],
    ['ko-KR', 'ko'],
    ['KO_kr', 'ko'],
    ['zh-Hans', 'zh-Hans'],
    ['zh-hans-cn', 'zh-Hans'],
    ['zh-CN', 'zh-Hans'],
    ['zh', 'zh-Hans'],
    ['zh-SG', 'zh-Hans'],
  ])('maps %s to %s', (tag, expected) => {
    expect(matchLocale(tag, available)).toBe(expected);
  });

  it('gives Traditional Chinese readers Simplified Chinese until zh-Hant exists', () => {
    expect(matchLocale('zh-TW', available)).toBe('zh-Hans');
    expect(matchLocale('zh-Hant-HK', available)).toBe('zh-Hans');
  });

  it('prefers zh-Hant for Traditional Chinese once the locale file is added', () => {
    const withHant = [...available, 'zh-Hant'];
    expect(matchLocale('zh-TW', withHant)).toBe('zh-Hant');
    expect(matchLocale('zh-Hant', withHant)).toBe('zh-Hant');
    expect(matchLocale('zh-HK', withHant)).toBe('zh-Hant');
    expect(matchLocale('zh-CN', withHant)).toBe('zh-Hans');
  });

  it('returns null for unsupported or empty tags', () => {
    expect(matchLocale('fr-CA', available)).toBeNull();
    expect(matchLocale('', available)).toBeNull();
    expect(matchLocale(null, available)).toBeNull();
    expect(matchLocale(undefined, available)).toBeNull();
  });
});

describe('pickInitialLocale', () => {
  const available = ['en', 'ko', 'zh-Hans'];

  it('prefers ?lang= over everything', () => {
    expect(
      pickInitialLocale(
        { urlLang: 'ko', stored: 'zh-Hans', navigatorLanguages: ['en-CA'] },
        available,
      ),
    ).toBe('ko');
  });

  it('uses the saved choice when there is no usable ?lang=', () => {
    expect(
      pickInitialLocale(
        { urlLang: 'fr', stored: 'zh-Hans', navigatorLanguages: ['ko-KR'] },
        available,
      ),
    ).toBe('zh-Hans');
  });

  it('then the first browser language that is supported', () => {
    expect(
      pickInitialLocale(
        { urlLang: null, stored: null, navigatorLanguages: ['fr-CA', 'ko-KR', 'en'] },
        available,
      ),
    ).toBe('ko');
  });

  it('and finally English', () => {
    expect(pickInitialLocale({ navigatorLanguages: ['fr-CA', 'de'] }, available)).toBe('en');
    expect(pickInitialLocale({}, available)).toBe('en');
  });
});

describe('storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('survives a localStorage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(readStoredLocale()).toBeNull();
    expect(() => storeLocale('ko')).not.toThrow();
  });

  it('survives a missing localStorage', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readStoredLocale()).toBeNull();
    expect(() => storeLocale('ko')).not.toThrow();
  });

  it('reads back what it stored', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    });
    storeLocale('zh-Hans');
    expect(readStoredLocale()).toBe('zh-Hans');
  });
});

describe('formatting', () => {
  it('formats metres and degrees with Intl.NumberFormat', () => {
    expect(formatMeters(21.84, 'en')).toBe('21.8 m');
    expect(formatMeters(5, 'en')).toBe('5.0 m');
    expect(formatMeters(0.55, 'en', 2)).toBe('0.55 m');
    expect(formatMeters(1.15, 'en', 2)).toBe('1.15 m');
    expect(formatDegrees(75.6, 'en')).toBe('76°');
  });

  it('formats for Korean and Chinese without throwing', () => {
    expect(formatMeters(21.84, 'ko')).toContain('21.8');
    expect(formatMeters(21.84, 'zh-Hans')).toContain('21.8');
    expect(formatDegrees(75.6, 'ko')).toContain('76');
    expect(formatDegrees(75.6, 'zh-Hans')).toContain('76');
  });
});

describe('localizedName', () => {
  it('uses the per-locale name when the data has one', () => {
    const names = { ko: '실버시티 리버포트' };
    expect(localizedName('SilverCity Riverport', names, 'ko')).toBe('실버시티 리버포트');
    expect(localizedName('SilverCity Riverport', names, 'zh-Hans')).toBe('SilverCity Riverport');
    expect(localizedName('SilverCity Riverport', undefined, 'ko')).toBe('SilverCity Riverport');
  });
});
