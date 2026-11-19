export type Dictionary = Readonly<Record<string, string>>;
export type MessageParams = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** Fills {name} placeholders. A placeholder without a value is left as written. */
export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (whole: string, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  );
}

/** The placeholder names a message uses, sorted, for comparing translations. */
export function placeholdersOf(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names].sort();
}

/**
 * Builds a lookup that falls back to the fallback locale when the active one lacks a key,
 * so a half-translated language still shows complete (if mixed) text.
 */
export function createTranslator(
  dictionaries: Readonly<Record<string, Dictionary>>,
  fallbackLocale: string,
): (locale: string, key: string, params?: MessageParams) => string {
  const lookup = (locale: string, key: string): string | undefined => {
    const dictionary = Object.hasOwn(dictionaries, locale) ? dictionaries[locale] : undefined;
    return dictionary && Object.hasOwn(dictionary, key) ? dictionary[key] : undefined;
  };
  return (locale, key, params) =>
    interpolate(lookup(locale, key) ?? lookup(fallbackLocale, key) ?? key, params);
}
