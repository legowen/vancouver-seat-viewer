import {
  AuditoriumSchema,
  type Auditorium,
  type AuditoriumType,
  type Entrance,
  type RowAlignment,
} from '../data/schema';
import en from '../i18n/locales/en.json';
import { interpolate } from '../i18n/translate';
import { parseCompact, type CompactError, type CompactOptions } from './compact';

/** Everything about an auditorium file except its rows. */
export interface ImportMeta {
  id: string;
  theatreId: string;
  name: string;
  type: AuditoriumType;
  entrance?: Entrance;
  rowAlign?: RowAlignment;
  verified?: boolean;
  /** Marks a made-up sample layout. */
  placeholder?: boolean;
  source?: string;
  notes?: string;
}

export type ImportResult = { ok: true; auditorium: Auditorium } | { ok: false; problems: string[] };

/** One problem in the seat text, as an English sentence with its line number. */
export function describeCompactError(error: CompactError): string {
  const messages: Record<string, string> = en;
  const template = messages[`editor.error.${error.code}`] ?? error.code;
  return interpolate(template, {
    line: error.line,
    label: error.label ?? '',
    token: error.token ?? '',
    seat: error.seat ?? '',
  });
}

/**
 * Builds a complete, validated auditorium from compact seat text and its other fields.
 * Used by `npm run import:auditorium`; the editor page builds the same thing as you type.
 */
export function importCompact(
  text: string,
  meta: ImportMeta,
  options: CompactOptions = {},
): ImportResult {
  const parsed = parseCompact(text, options);
  if (parsed.errors.length > 0) {
    return { ok: false, problems: parsed.errors.map(describeCompactError) };
  }
  const result = AuditoriumSchema.safeParse({
    id: meta.id,
    theatreId: meta.theatreId,
    name: meta.name,
    type: meta.type,
    rows: parsed.rows,
    rowAlign: meta.rowAlign,
    entrance: meta.entrance ?? 'front-left',
    verified: meta.verified ?? false,
    placeholder: meta.placeholder || undefined,
    source: meta.source || undefined,
    notes: meta.notes || undefined,
  });
  if (!result.success) {
    return {
      ok: false,
      problems: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }
  return { ok: true, auditorium: result.data };
}
