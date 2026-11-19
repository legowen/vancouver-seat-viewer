/** Regions whose readers conventionally expect Traditional Chinese characters. */
const TRADITIONAL_REGIONS = new Set(['tw', 'hk', 'mo']);

/**
 * Maps a language tag such as "ko-KR" or "zh-TW" onto one of the locales the app ships.
 * Returns null when nothing fits, so the caller can try its next source.
 */
export function matchLocale(
  tag: string | null | undefined,
  available: readonly string[],
): string | null {
  const wanted = tag?.trim().toLowerCase().replace(/_/g, '-');
  if (!wanted) return null;

  const byLowerCase = new Map(available.map((code) => [code.toLowerCase(), code]));
  const exact = byLowerCase.get(wanted);
  if (exact) return exact;

  const parts = wanted.split('-');
  const language = parts[0];

  if (language === 'zh') {
    const traditional =
      parts.includes('hant') || parts.some((part) => TRADITIONAL_REGIONS.has(part));
    // Fall back to the other script rather than to English: either is readable.
    for (const code of traditional ? ['zh-hant', 'zh-hans'] : ['zh-hans', 'zh-hant']) {
      const hit = byLowerCase.get(code);
      if (hit) return hit;
    }
  }

  // Longest prefix first: "en-ca" tries "en".
  for (let length = parts.length - 1; length >= 1; length--) {
    const hit = byLowerCase.get(parts.slice(0, length).join('-'));
    if (hit) return hit;
  }

  return available.find((code) => code.toLowerCase().split('-')[0] === language) ?? null;
}

export interface LocaleSources {
  /** Value of the ?lang= URL parameter. */
  urlParam?: string | null;
  /** The choice saved from an earlier visit. */
  stored?: string | null;
  /** navigator.languages, most preferred first. */
  browserLanguages?: readonly string[];
}

/** Picks the starting language: URL parameter, then saved choice, then browser, then fallback. */
export function pickInitialLocale(
  sources: LocaleSources,
  available: readonly string[],
  fallback: string,
): string {
  const candidates = [sources.urlParam, sources.stored, ...(sources.browserLanguages ?? [])];
  for (const candidate of candidates) {
    const match = matchLocale(candidate, available);
    if (match) return match;
  }
  return fallback;
}
