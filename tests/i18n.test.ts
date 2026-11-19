import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { matchLocale, pickInitialLocale } from '../src/i18n/detect';
import { formatDegrees, formatMeters } from '../src/i18n/format';
import { createTranslator, interpolate, placeholdersOf } from '../src/i18n/translate';

const localesDir = fileURLToPath(new URL('../src/i18n/locales', import.meta.url));
const dictionaries: Record<string, Record<string, string>> = {};
for (const file of readdirSync(localesDir).filter((name) => name.endsWith('.json'))) {
  dictionaries[file.replace(/\.json$/, '')] = JSON.parse(
    readFileSync(join(localesDir, file), 'utf8'),
  ) as Record<string, string>;
}
const en = dictionaries.en ?? {};
const otherLocales = Object.keys(dictionaries).filter((code) => code !== 'en');

describe('locale files', () => {
  it('ships English, Korean and Simplified Chinese', () => {
    expect(Object.keys(dictionaries).sort()).toEqual(
      expect.arrayContaining(['en', 'ko', 'zh-Hans']),
    );
  });

  it.each(otherLocales)('%s has every key that English has', (code) => {
    const missing = Object.keys(en).filter((key) => !(key in dictionaries[code]!));
    expect(missing).toEqual([]);
  });

  it.each(otherLocales)('%s has no keys that English lacks', (code) => {
    const extra = Object.keys(dictionaries[code]!).filter((key) => !(key in en));
    expect(extra).toEqual([]);
  });

  it.each(otherLocales)('%s uses the same placeholders as English', (code) => {
    const mismatched = Object.keys(en).filter((key) => {
      const translated = dictionaries[code]![key];
      return (
        translated !== undefined &&
        placeholdersOf(translated).join() !== placeholdersOf(en[key]!).join()
      );
    });
    expect(mismatched).toEqual([]);
  });

  it.each(Object.keys(dictionaries))('%s has no empty strings', (code) => {
    const empty = Object.entries(dictionaries[code]!)
      .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('labels the language switcher EN / 한국어 / 中文', () => {
    expect(dictionaries.en!['meta.short']).toBe('EN');
    expect(dictionaries.ko!['meta.short']).toBe('한국어');
    expect(dictionaries['zh-Hans']!['meta.short']).toBe('中文');
  });
});

describe('matchLocale', () => {
  const available = ['en', 'ko', 'zh-Hans'];

  it('matches an exact code regardless of case', () => {
    expect(matchLocale('KO', available)).toBe('ko');
    expect(matchLocale('zh-hans', available)).toBe('zh-Hans');
  });

  it('matches a regional variant to its base language', () => {
    expect(matchLocale('ko-KR', available)).toBe('ko');
    expect(matchLocale('en-CA', available)).toBe('en');
  });

  it('maps mainland and generic Chinese to Simplified', () => {
    expect(matchLocale('zh', available)).toBe('zh-Hans');
    expect(matchLocale('zh-CN', available)).toBe('zh-Hans');
    expect(matchLocale('zh-Hans-CN', available)).toBe('zh-Hans');
  });

  it('gives Traditional Chinese readers Simplified until zh-Hant exists', () => {
    expect(matchLocale('zh-TW', available)).toBe('zh-Hans');
  });

  it('prefers zh-Hant for Taiwan and Hong Kong once that locale file is added', () => {
    const withTraditional = [...available, 'zh-Hant'];
    expect(matchLocale('zh-TW', withTraditional)).toBe('zh-Hant');
    expect(matchLocale('zh-HK', withTraditional)).toBe('zh-Hant');
    expect(matchLocale('zh-CN', withTraditional)).toBe('zh-Hans');
  });

  it('returns null for unsupported or missing tags', () => {
    expect(matchLocale('fr-CA', available)).toBeNull();
    expect(matchLocale('', available)).toBeNull();
    expect(matchLocale(null, available)).toBeNull();
  });
});

describe('pickInitialLocale', () => {
  const available = ['en', 'ko', 'zh-Hans'];

  it('prefers the ?lang= parameter over the saved choice and the browser', () => {
    expect(
      pickInitialLocale(
        { urlParam: 'ko', stored: 'zh-Hans', browserLanguages: ['en-CA'] },
        available,
        'en',
      ),
    ).toBe('ko');
  });

  it('uses the saved choice when the URL parameter is absent or unsupported', () => {
    expect(
      pickInitialLocale(
        { urlParam: 'xx', stored: 'zh-Hans', browserLanguages: ['ko'] },
        available,
        'en',
      ),
    ).toBe('zh-Hans');
    expect(pickInitialLocale({ stored: 'ko', browserLanguages: ['en'] }, available, 'en')).toBe(
      'ko',
    );
  });

  it('uses the first supported browser language when nothing is saved', () => {
    expect(pickInitialLocale({ browserLanguages: ['fr-CA', 'ko-KR', 'en'] }, available, 'en')).toBe(
      'ko',
    );
  });

  it('falls back to English when nothing matches', () => {
    expect(pickInitialLocale({ browserLanguages: ['fr', 'de'] }, available, 'en')).toBe('en');
    expect(pickInitialLocale({}, available, 'en')).toBe('en');
  });
});

describe('createTranslator', () => {
  const translate = createTranslator(
    {
      en: { greeting: 'Hello {name}', only: 'English only' },
      ko: { greeting: '안녕하세요 {name}' },
    },
    'en',
  );

  it('uses the active locale when the key exists there', () => {
    expect(translate('ko', 'greeting', { name: 'Owen' })).toBe('안녕하세요 Owen');
  });

  it('falls back to English when a key is missing in the active locale', () => {
    expect(translate('ko', 'only')).toBe('English only');
  });

  it('falls back to English for a locale that does not exist', () => {
    expect(translate('fr', 'greeting', { name: 'Owen' })).toBe('Hello Owen');
  });

  it('returns the key itself when no locale knows it', () => {
    expect(translate('en', 'nope')).toBe('nope');
  });
});

describe('interpolate', () => {
  it('replaces every named placeholder', () => {
    expect(interpolate('Row {row}, Seat {seat}', { row: 'K', seat: 23 })).toBe('Row K, Seat 23');
  });

  it('leaves placeholders without a value untouched', () => {
    expect(interpolate('Row {row}', {})).toBe('Row {row}');
  });
});

describe('number formatting', () => {
  // Intl may put a no-break space between the number and the unit. \s matches those too.
  const plainSpaces = (text: string) => text.replace(/\s/g, ' ');

  it('formats distances with one decimal and a metre unit', () => {
    expect(plainSpaces(formatMeters(21.84, 'en'))).toBe('21.8 m');
    expect(plainSpaces(formatMeters(9, 'en'))).toBe('9.0 m');
  });

  it('formats angles as whole degrees', () => {
    expect(formatDegrees(76.2, 'en')).toBe('76°');
    expect(formatDegrees(44.5, 'ko')).toContain('°');
  });

  it('formats for Korean and Chinese without throwing', () => {
    expect(formatMeters(21.84, 'ko')).toContain('21.8');
    expect(formatMeters(21.84, 'zh-Hans')).toContain('21.8');
  });
});
