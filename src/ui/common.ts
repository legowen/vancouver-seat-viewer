import { h } from '../app/dom';
import type { DataError } from '../data/loader';
import type { Auditorium, Theatre } from '../data/schema';
import { getLocale, t } from '../i18n';

/** Picks the display name for the current language, or the English name. */
export function localized(
  names: Readonly<Record<string, string>> | undefined,
  fallback: string,
): string {
  const locale = getLocale();
  return names && Object.hasOwn(names, locale) ? (names[locale] ?? fallback) : fallback;
}

export const theatreName = (theatre: Theatre): string => localized(theatre.names, theatre.name);
export const theatreArea = (theatre: Theatre): string => localized(theatre.areaNames, theatre.area);
export const auditoriumName = (auditorium: Pick<Auditorium, 'name' | 'names'>): string =>
  localized(auditorium.names, auditorium.name);

type BadgeVariant = 'neutral' | 'accent' | 'warn';

export function badge(text: string, variant: BadgeVariant = 'neutral', hint?: string): HTMLElement {
  return h('span', { class: `badge badge--${variant}`, title: hint }, text);
}

/** "Estimated dimensions" appears whenever an auditorium's sizes were not measured. */
export function estimatedBadge(auditorium: Pick<Auditorium, 'verified'>): HTMLElement | null {
  return auditorium.verified ? null : badge(t('badge.estimated'), 'warn', t('badge.estimatedHint'));
}

export function auditoriumBadges(
  auditorium: Pick<Auditorium, 'type' | 'placeholder' | 'verified'>,
): (HTMLElement | null)[] {
  return [
    badge(t(`type.${auditorium.type}`), auditorium.type === 'vip' ? 'accent' : 'neutral'),
    auditorium.placeholder ? badge(t('badge.sample'), 'neutral', t('badge.sampleHint')) : null,
    estimatedBadge(auditorium),
  ];
}

export function backLink(href: string, label: string): HTMLElement {
  return h(
    'a',
    { class: 'back-link', href },
    h('span', { 'aria-hidden': 'true' }, '←'),
    h('span', null, label),
  );
}

/** Lists data files that failed validation, with the reason for each. */
export function dataErrorPanel(errors: readonly DataError[]): HTMLElement | null {
  if (errors.length === 0) return null;
  return h(
    'section',
    { class: 'notice notice--error', role: 'alert' },
    h('h2', { class: 'notice__title' }, t('error.dataTitle')),
    h('p', null, t('error.dataBody')),
    h(
      'ul',
      { class: 'notice__list' },
      errors.map((error) =>
        h(
          'li',
          null,
          h('code', null, error.file),
          h(
            'ul',
            null,
            error.messages.map((message) => h('li', null, message)),
          ),
        ),
      ),
    ),
  );
}

/** A centred message with one way out, for missing pages and missing data. */
export function messagePage(
  title: string,
  body: string,
  action?: { href: string; label: string },
): HTMLElement {
  return h(
    'div',
    { class: 'page page--message' },
    h('h1', { class: 'page__title' }, title),
    h('p', { class: 'lead' }, body),
    action ? h('a', { class: 'button', href: action.href }, action.label) : null,
  );
}
