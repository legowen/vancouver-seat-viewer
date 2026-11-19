import { safeStorageGet, safeStorageSet } from '../app/storage';
import { matchLocale, pickInitialLocale } from './detect';
import { formatCount, formatDegrees, formatMeters } from './format';
import type en from './locales/en.json';
import { createTranslator, type Dictionary, type MessageParams } from './translate';

/** Every UI string key. English is the source of truth for which keys exist. */
export type MessageKey = keyof typeof en;

export const FALLBACK_LOCALE = 'en';
const STORAGE_KEY = 'vsv.locale';
const DISPLAY_ORDER = ['en', 'ko', 'zh-Hans', 'zh-Hant'];

// Every JSON file in ./locales becomes a language. Adding zh-Hant.json is all it takes
// to offer Traditional Chinese: the switcher, detection and tests pick it up from here.
const files = import.meta.glob<Dictionary>('./locales/*.json', { eager: true, import: 'default' });
const dictionaries: Record<string, Dictionary> = {};
for (const [path, dictionary] of Object.entries(files)) {
  dictionaries[path.slice(path.lastIndexOf('/') + 1, -'.json'.length)] = dictionary;
}

const rank = (code: string): number => {
  const index = DISPLAY_ORDER.indexOf(code);
  return index === -1 ? DISPLAY_ORDER.length : index;
};

/** Available locale codes in the order the switcher shows them. */
export const LOCALES: readonly string[] = Object.keys(dictionaries).sort(
  (a, b) => rank(a) - rank(b) || a.localeCompare(b),
);

const translate = createTranslator(dictionaries, FALLBACK_LOCALE);
const listeners = new Set<() => void>();
let current = FALLBACK_LOCALE;

export function getLocale(): string {
  return current;
}

/** Translates a key into the current language, falling back to English. */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(current, key, params);
}

/** A locale's own name for itself, for the language switcher. */
export function localeLabel(code: string): { short: string; name: string } {
  return { short: translate(code, 'meta.short'), name: translate(code, 'meta.name') };
}

/** Number formatting in the current language. */
export const fmt = {
  meters: (value: number): string => formatMeters(value, current),
  degrees: (value: number): string => formatDegrees(value, current),
  count: (value: number): string => formatCount(value, current),
};

/** Picks the starting language: ?lang=, then the saved choice, then the browser, then English. */
export function initLocale(): string {
  let urlParam: string | null = null;
  let browserLanguages: readonly string[] = [];
  try {
    urlParam = new URLSearchParams(window.location.search).get('lang');
    browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  } catch {
    // No window or navigator: keep the defaults.
  }
  current = pickInitialLocale(
    { urlParam, stored: safeStorageGet(STORAGE_KEY), browserLanguages },
    LOCALES,
    FALLBACK_LOCALE,
  );
  document.documentElement.lang = current;
  return current;
}

/** Switches language, remembers the choice and tells every listener to re-render. */
export function setLocale(code: string): void {
  const next = matchLocale(code, LOCALES);
  if (!next || next === current) return;
  current = next;
  safeStorageSet(STORAGE_KEY, next);
  dropLangParameter();
  document.documentElement.lang = next;
  for (const listener of [...listeners]) listener();
}

export function onLocaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** An explicit choice outranks the ?lang= link the visitor arrived with, so drop the parameter. */
function dropLangParameter(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('lang')) return;
    url.searchParams.delete('lang');
    window.history.replaceState(window.history.state, '', url);
  } catch {
    // History can be unavailable in sandboxed frames. The saved choice still applies.
  }
}
