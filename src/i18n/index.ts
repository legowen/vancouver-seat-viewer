/**
 * Tiny i18n layer.
 *
 * - `en.json` is the source of truth and gives the message keys their type.
 * - Every other file in `./locales` is picked up automatically: adding `zh-Hant.json`
 *   (with its own `meta.languageName`) is all it takes to add Traditional Chinese.
 * - A key missing from a locale falls back to English.
 */
import en from './locales/en.json';

export type MessageKey = keyof typeof en;
export type MessageParams = Record<string, string | number>;

/** Keys that come as a `.one` / `.other` pair, without the suffix. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}.other` ? Base : never;
}[MessageKey];

export const DEFAULT_LOCALE = 'en';
export const STORAGE_KEY = 'vsv.lang';

/** Order of the language switcher. Locales not listed here follow alphabetically. */
const PREFERRED_ORDER = ['en', 'ko', 'zh-Hans', 'zh-Hant'];

type Catalog = Record<string, string>;

const modules = import.meta.glob<Catalog>('./locales/*.json', { eager: true, import: 'default' });

const catalogs = new Map<string, Catalog>();
for (const [path, messages] of Object.entries(modules)) {
  const code = /\/([^/]+)\.json$/.exec(path)?.[1];
  if (code) catalogs.set(code, messages);
}
catalogs.set(DEFAULT_LOCALE, en);

function orderOf(code: string): number {
  const index = PREFERRED_ORDER.indexOf(code);
  return index === -1 ? PREFERRED_ORDER.length : index;
}

/** All available locale codes, in switcher order. */
export const locales: readonly string[] = [...catalogs.keys()].sort(
  (a, b) => orderOf(a) - orderOf(b) || a.localeCompare(b),
);

/** The raw messages of one locale (used by tests and tooling). */
export function getCatalog(code: string): Readonly<Catalog> | undefined {
  return catalogs.get(code);
}

const TRADITIONAL_REGIONS = new Set(['tw', 'hk', 'mo']);

/**
 * Maps a BCP 47 tag such as `ko-KR`, `zh-CN` or `zh-Hant-TW` to one of the available locales,
 * or `null` when nothing fits.
 */
export function matchLocale(
  tag: string | null | undefined,
  available: readonly string[] = locales,
): string | null {
  if (!tag) return null;
  const wanted = tag.trim().replace(/_/g, '-').toLowerCase();
  if (!wanted) return null;

  const exact = available.find((code) => code.toLowerCase() === wanted);
  if (exact) return exact;

  const parts = wanted.split('-');
  const language = parts[0];

  if (language === 'zh') {
    const traditional =
      parts.includes('hant') ||
      (!parts.includes('hans') && parts.some((p) => TRADITIONAL_REGIONS.has(p)));
    const preferred = traditional ? 'zh-Hant' : 'zh-Hans';
    if (available.includes(preferred)) return preferred;
    // Any Chinese is better than English for a Chinese reader.
    return (
      available.find((code) => code === 'zh-Hans') ??
      available.find((code) => code.toLowerCase().startsWith('zh')) ??
      null
    );
  }

  return available.find((code) => code.toLowerCase().split('-')[0] === language) ?? null;
}

export interface LocaleSources {
  /** Value of the `?lang=` URL parameter. */
  urlLang?: string | null;
  /** Choice saved earlier by the language switcher. */
  stored?: string | null;
  /** `navigator.languages`, most preferred first. */
  navigatorLanguages?: readonly string[];
}

/** Initial language: `?lang=`, then the saved choice, then the browser language, then English. */
export function pickInitialLocale(
  sources: LocaleSources,
  available: readonly string[] = locales,
): string {
  const fromUrl = matchLocale(sources.urlLang, available);
  if (fromUrl) return fromUrl;
  const fromStorage = matchLocale(sources.stored, available);
  if (fromStorage) return fromStorage;
  for (const tag of sources.navigatorLanguages ?? []) {
    const match = matchLocale(tag, available);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/** localStorage can be missing or throw (private mode, blocked cookies), so both helpers swallow errors. */
export function readStoredLocale(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function storeLocale(code: string): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, code);
  } catch {
    // Not being able to remember the language is not worth an error.
  }
}

let current = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

export function getLocale(): string {
  return current;
}

function applyToDocument(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

/** Reads the URL, storage and browser settings once at start-up. */
export function initI18n(): string {
  let urlLang: string | null = null;
  let navigatorLanguages: readonly string[] = [];
  if (typeof location !== 'undefined') {
    urlLang = new URLSearchParams(location.search).get('lang');
  }
  if (typeof navigator !== 'undefined') {
    navigatorLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  }
  current = pickInitialLocale({ urlLang, stored: readStoredLocale(), navigatorLanguages });
  applyToDocument();
  return current;
}

export interface SetLocaleOptions {
  /** Save the choice for the next visit (default true). */
  persist?: boolean;
}

/** Switches language, remembers the choice and notifies every subscriber. */
export function setLocale(code: string, options: SetLocaleOptions = {}): void {
  if (!catalogs.has(code) || code === current) return;
  current = code;
  if (options.persist ?? true) storeLocale(code);
  applyToDocument();
  dropLangParam();
  for (const listener of [...listeners]) listener();
}

/** A stale `?lang=` would override the choice the user just made on the next reload. */
function dropLangParam(): void {
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has('lang')) return;
    url.searchParams.delete('lang');
    history.replaceState(history.state, '', url);
  } catch {
    // Ignore: the URL stays as it is.
  }
}

export function onLocaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function lookup(key: string, locale: string): string {
  return catalogs.get(locale)?.[key] ?? (en as Catalog)[key] ?? key;
}

function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Translates `key` into the current language, filling `{placeholders}` from `params`. */
export function t(key: MessageKey, params?: MessageParams): string {
  return interpolate(lookup(key, current), params);
}

/** Like `t`, for an explicit locale (used by tests). */
export function translate(locale: string, key: MessageKey, params?: MessageParams): string {
  return interpolate(lookup(key, locale), params);
}

/** Picks `<key>.one` or `<key>.other` for `count` and passes the formatted count as `{count}`. */
export function tPlural(key: PluralKey, count: number, params?: MessageParams): string {
  let category: string;
  try {
    category = new Intl.PluralRules(current).select(count);
  } catch {
    category = count === 1 ? 'one' : 'other';
  }
  const full = (category === 'one' ? `${key}.one` : `${key}.other`) as MessageKey;
  return t(full, { count: formatInteger(count), ...params });
}

/** Label shown in the language switcher, taken from the locale file itself. */
export function localeLabel(code: string): string {
  return catalogs.get(code)?.['meta.languageName'] ?? code;
}

/** Picks a per-locale display name from data, falling back to the default (English) name. */
export function localizedName(
  fallback: string,
  names?: Readonly<Record<string, string>>,
  locale: string = current,
): string {
  return names?.[locale] ?? fallback;
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(kind: string, locale: string, options: Intl.NumberFormatOptions) {
  const cacheKey = `${locale}|${kind}`;
  let found = formatters.get(cacheKey);
  if (!found) {
    found = new Intl.NumberFormat(locale, options);
    formatters.set(cacheKey, found);
  }
  return found;
}

/** "21.8 m". Room dimensions use two decimals ("0.55 m") so they match the JSON. */
export function formatMeters(value: number, locale: string = current, digits = 1): string {
  try {
    return formatter(`m${digits}`, locale, {
      style: 'unit',
      unit: 'meter',
      unitDisplay: 'short',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${value.toFixed(digits)} m`;
  }
}

/** "76°" */
export function formatDegrees(value: number, locale: string = current): string {
  try {
    return formatter('deg', locale, {
      style: 'unit',
      unit: 'degree',
      unitDisplay: 'narrow',
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value)}°`;
  }
}

/** Plain number with a fixed number of decimals, for the editor sliders. */
export function formatNumber(value: number, digits = 0, locale: string = current): string {
  try {
    return formatter(`n${digits}`, locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return value.toFixed(digits);
  }
}

export function formatInteger(value: number, locale: string = current): string {
  return formatNumber(value, 0, locale);
}
