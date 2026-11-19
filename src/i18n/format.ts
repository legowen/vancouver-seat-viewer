const formatters = new Map<string, Intl.NumberFormat | null>();

function formatter(
  locale: string,
  name: string,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat | null {
  const cacheKey = `${locale}|${name}`;
  let format = formatters.get(cacheKey);
  if (format === undefined) {
    try {
      format = new Intl.NumberFormat(locale, options);
    } catch {
      // Very old browsers lack unit formatting. Callers fall back to plain text.
      format = null;
    }
    formatters.set(cacheKey, format);
  }
  return format;
}

/** "21.8 m" in English, "21.8m" in Korean, "21.8米" in Chinese. */
export function formatMeters(value: number, locale: string): string {
  const format = formatter(locale, 'meters', {
    style: 'unit',
    unit: 'meter',
    unitDisplay: 'short',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return format ? format.format(value) : `${value.toFixed(1)} m`;
}

/** "76°". The narrow form is used because the short English form is "76 deg". */
export function formatDegrees(value: number, locale: string): string {
  const format = formatter(locale, 'degrees', {
    style: 'unit',
    unit: 'degree',
    unitDisplay: 'narrow',
    maximumFractionDigits: 0,
  });
  return format ? format.format(value) : `${Math.round(value)}°`;
}

/** A whole number with the locale's digit grouping. */
export function formatCount(value: number, locale: string): string {
  const format = formatter(locale, 'count', { maximumFractionDigits: 0 });
  return format ? format.format(value) : String(Math.round(value));
}
